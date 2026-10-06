"""Оформление и оплата (SPEC 3.3, 4.2, 4.3, 5): резерв, платёжная ссылка, вебхук,
автоотмена, поздняя оплата, сверка, повторная оплата, тихая регистрация."""

import asyncio
import json
import uuid
from datetime import timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.integrations.payments import FakePaymentGateway
from app.main import create_app
from app.models import (
    Customer,
    InventoryMovement,
    NotificationRecipient,
    Order,
    PointsTransaction,
    Product,
    PromoCode,
    PromoCodeUsage,
    Setting,
    WebhookEvent,
)
from app.workers import jobs
from tests.factories import make_tea, make_unit
from tests.helpers import add_to_cart, customer_login, outbox

PVZ = {
    "method": "cdek_pvz",
    "city_code": 44,
    "city_name": "Москва",
    "pvz_code": "MSK123",
    "pvz_address": "Москва, ул. Тверская, 1",
}


def checkout_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Анна",
        "phone": "+7 900 123-45-67",
        "email": "anna@mail.ru",
        "delivery": PVZ,
        "comment": "Позвоните заранее",
        "consent_offer": True,
        "consent_pd": True,
        "payment_method": "online",
    }
    payload.update(overrides)
    return payload


def gateway(container: Container) -> FakePaymentGateway:
    assert isinstance(container.payments, FakePaymentGateway)
    return container.payments


async def place_order(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post("/api/checkout", json=checkout_payload(**overrides))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def send_webhook(client: AsyncClient, operation_id: str, status: str = "APPROVED") -> int:
    response = await client.post(
        "/api/webhooks/tochka",
        content=json.dumps({"operationId": operation_id, "status": status}).encode(),
        headers={"content-type": "text/plain"},
    )
    return response.status_code


async def load_order(db: AsyncSession, order_id: str) -> Order:
    order = await db.get(Order, uuid.UUID(order_id), populate_existing=True)
    assert order is not None
    return order


async def owner_chat(db: AsyncSession) -> None:
    db.add(NotificationRecipient(chat_id=1, name="Никита", events=["new_order", "order_attention"]))
    await db.commit()


class TestPlaceOrder:
    async def test_online_order(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=2_800, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)

        assert body["number"] == "NSB-10001"
        assert body["status"] == "awaiting_payment"
        assert body["payment_url"].startswith("https://nsbtea.test/api/dev/fake-pay/")

        order = await load_order(db, body["order_id"])
        assert order.items_total_kop == 280_000
        assert order.delivery_kop == 35_000  # заглушка СДЭК: тариф 136, до 500 г
        assert order.total_kop == 280_000 - 28_000 + 35_000  # приветственная −10% на первый заказ
        assert order.order_discount_source == "welcome"
        assert order.reserved_until == container.clock.now() + timedelta(minutes=30)
        assert order.consent_offer_at is not None
        assert order.consent_pd_at is not None
        assert order.delivery_data["pvz_code"] == "MSK123"
        assert order.phone == "+79001234567"
        assert (
            sum(i.receipt_amount_kop for i in order.items) + order.delivery_kop == order.total_kop
        )

        await db.refresh(tea)
        assert tea.stock == 400
        movement = (await db.scalars(select(InventoryMovement))).one()
        assert movement.order_id == order.id
        assert movement.reason == "sale"

        customer = (await db.scalars(select(Customer))).one()
        assert customer.email == "anna@mail.ru"
        assert order.customer_id == customer.id

        assert (await client.get("/api/cart")).json()["lines"] == []

        request = next(iter(gateway(container).payments.values())).request
        assert request.amount_kop == order.total_kop
        assert request.items[-1].name == "Доставка"
        assert request.items[-1].is_service
        assert request.redirect_url == f"https://nsbtea.test/order/{order.id}/result"
        assert request.client_email == "anna@mail.ru"

    async def test_consents_required(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        response = await client.post("/api/checkout", json=checkout_payload(consent_pd=False))
        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Подтвердите согласие на обработку персональных данных"
        )
        response = await client.post("/api/checkout", json=checkout_payload(consent_offer=False))
        assert response.json()["detail"] == "Подтвердите, что принимаете условия оферты"

    async def test_empty_cart(self, client: AsyncClient) -> None:
        response = await client.post("/api/checkout", json=checkout_payload())
        assert response.status_code == 422
        assert response.json()["detail"] == "Корзина пуста"

    async def test_stock_changed_since_cart(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Шу", presets=[100], stock=100)
        await add_to_cart(client, tea.id, grams=100)
        tea.stock = 30
        await db.commit()
        response = await client.post("/api/checkout", json=checkout_payload())
        assert response.status_code == 409
        assert "Шу" in response.json()["detail"]
        assert (await db.scalars(select(Order))).all() == []

    async def test_bank_unavailable_releases_reservation(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)
        gateway(container).fail_next_create = True
        response = await client.post("/api/checkout", json=checkout_payload())
        assert response.status_code == 502
        assert "банк" in response.json()["detail"].lower()
        await db.refresh(tea)
        assert tea.stock == 500
        order = (await db.scalars(select(Order))).one()
        assert order.status == "cancelled"
        assert len((await client.get("/api/cart")).json()["lines"]) == 1

    async def test_expected_total_mismatch(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        response = await client.post("/api/checkout", json=checkout_payload(expected_total_kop=1))
        assert response.status_code == 409
        assert "Сумма заказа изменилась" in response.json()["detail"]

    async def test_pvz_required(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        response = await client.post(
            "/api/checkout", json=checkout_payload(delivery={"method": "cdek_pvz"})
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "Выберите пункт выдачи СДЭК на карте"

    async def test_courier_and_pickup(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[100], stock=1000)
        await add_to_cart(client, tea.id, grams=100)
        response = await client.post(
            "/api/checkout", json=checkout_payload(delivery={"method": "courier"})
        )
        assert response.json()["detail"] == "Укажите адрес доставки"
        body = await place_order(
            client,
            delivery={
                "method": "courier",
                "address": "Владимир, ул. Мира, 5",
                "courier_time": "вечер",
            },
        )
        order = await load_order(db, body["order_id"])
        assert order.delivery_kop == 0
        assert order.delivery_data["courier_time"] == "вечер"

        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client, delivery={"method": "pickup"})
        assert (await load_order(db, body["order_id"])).delivery_kop == 0

    async def test_pay_on_delivery_disabled_by_default(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        response = await client.post(
            "/api/checkout",
            json=checkout_payload(delivery={"method": "pickup"}, payment_method="on_delivery"),
        )
        assert response.status_code == 422

    async def test_pay_on_delivery_when_enabled(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_chat(db)
        db.add(Setting(key="payment", value={"allow_pay_on_delivery": True}))
        await db.commit()
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        body = await place_order(
            client, delivery={"method": "pickup"}, payment_method="on_delivery"
        )
        assert body["payment_url"] is None
        assert body["status"] == "accepted"
        messages = await outbox(db, channel="telegram")
        assert any("Новый заказ" in m.body for m in messages)

    async def test_returning_customer_has_no_welcome_discount(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100], stock=1000)
        await add_to_cart(client, tea.id, grams=100)
        first = await place_order(client)
        gateway(container).mark_paid(next(iter(gateway(container).payments)))
        await send_webhook(client, next(iter(gateway(container).payments)))
        assert (await load_order(db, first["order_id"])).order_discount_kop == 10_000

        await add_to_cart(client, tea.id, grams=100)
        second = await place_order(client)
        assert (await load_order(db, second["order_id"])).order_discount_kop == 0


class TestPayment:
    async def test_webhook_marks_paid_and_notifies(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await owner_chat(db)
        tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        operation_id = next(iter(gateway(container).payments))
        gateway(container).mark_paid(operation_id)

        assert await send_webhook(client, operation_id) == 200
        order = await load_order(db, body["order_id"])
        assert order.status == "paid"
        assert order.paid_at is not None
        customer = await db.get(Customer, order.customer_id)
        assert customer is not None
        await db.refresh(customer)
        assert customer.first_paid_order_at is not None

        telegram = await outbox(db, channel="telegram")
        assert len(telegram) == 1
        assert "Новый заказ NSB-10001" in telegram[0].body
        assert "Да Хун Пао, 100 г" in telegram[0].body
        assert "/admin/orders/" in telegram[0].body
        emails = [m for m in await outbox(db, channel="email") if "оплачен" in (m.subject or "")]
        assert emails[0].recipient == "anna@mail.ru"
        assert "/account" in emails[0].body

        # повторный вебхук — без дублей
        assert await send_webhook(client, operation_id) == 200
        assert len(await outbox(db, channel="telegram")) == 1
        events = (await db.scalars(select(WebhookEvent))).all()
        assert len(events) == 1

    async def test_webhook_status_is_rechecked_with_bank(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        operation_id = next(iter(gateway(container).payments))
        # вебхук утверждает «оплачено», но банк говорит — нет
        assert await send_webhook(client, operation_id, "APPROVED") == 200
        assert (await load_order(db, body["order_id"])).status == "awaiting_payment"

    async def test_bad_webhook_body(self, client: AsyncClient) -> None:
        response = await client.post("/api/webhooks/tochka", content=b"garbage")
        assert response.status_code == 400

    async def test_status_page_and_retry(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        status = (await client.get(f"/api/orders/{body['order_id']}/status")).json()
        assert status["status"] == "awaiting_payment"
        assert status["can_retry"] is True
        assert status["number"] == "NSB-10001"

        retry = await client.post(f"/api/orders/{body['order_id']}/retry-payment")
        assert retry.status_code == 200
        assert retry.json()["payment_url"] != body["payment_url"]
        links = [p.request.payment_link_id for p in gateway(container).payments.values()]
        assert len(set(links)) == 2

        new_operation = list(gateway(container).payments)[-1]
        gateway(container).mark_paid(new_operation)
        # покупатель вернулся раньше вебхука — страница статуса сама сверяется с банком
        status = (await client.get(f"/api/orders/{body['order_id']}/status")).json()
        assert status["status"] == "paid"
        assert status["paid"] is True

    async def test_retry_after_expiry_rejected(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        container.clock.advance(minutes=31)  # type: ignore[attr-defined]
        await jobs.cancel_expired_orders(container)
        response = await client.post(f"/api/orders/{body['order_id']}/retry-payment")
        assert response.status_code == 409


class TestAutoCancel:
    async def test_cancel_returns_stock_points_and_promo(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        promo = PromoCode(code="CHAI", percent=15)
        db.add(promo)
        await db.commit()
        await customer_login(client, db, "anna@mail.ru")
        customer = (await db.scalars(select(Customer))).one()
        customer.points_balance = 200
        db.add(
            PointsTransaction(customer_id=customer.id, delta=200, kind="manual", balance_after=200)
        )
        await db.commit()

        tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)
        await client.put("/api/cart/promo-code", json={"code": "CHAI"})
        await client.put("/api/cart/points", json={"points": 200})
        body = await place_order(client)
        order = await load_order(db, body["order_id"])
        assert order.points_spent == 200
        assert order.promo_code_text == "CHAI"
        await db.refresh(customer)
        assert customer.points_balance == 0
        assert len((await db.scalars(select(PromoCodeUsage))).all()) == 1

        container.clock.advance(minutes=29)  # type: ignore[attr-defined]
        assert await jobs.cancel_expired_orders(container) == 0
        container.clock.advance(minutes=2)  # type: ignore[attr-defined]
        assert await jobs.cancel_expired_orders(container) == 1

        order = await load_order(db, body["order_id"])
        assert order.status == "cancelled"
        assert order.stock_reserved is False
        assert order.history[-1].actor_type == "system"
        await db.refresh(tea)
        assert tea.stock == 500
        await db.refresh(customer)
        assert customer.points_balance == 200
        assert (await db.scalars(select(PromoCodeUsage))).all() == []

    async def test_cancel_job_checks_bank_first(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        gateway(container).mark_paid(next(iter(gateway(container).payments)))
        container.clock.advance(minutes=31)  # type: ignore[attr-defined]
        await jobs.cancel_expired_orders(container)
        assert (await load_order(db, body["order_id"])).status == "paid"

    async def test_late_payment_rereserves_stock(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        operation_id = next(iter(gateway(container).payments))
        container.clock.advance(minutes=31)  # type: ignore[attr-defined]
        await jobs.cancel_expired_orders(container)
        await db.refresh(tea)
        assert tea.stock == 500

        gateway(container).mark_paid(operation_id)
        await send_webhook(client, operation_id)
        order = await load_order(db, body["order_id"])
        assert order.status == "paid"
        assert order.stock_reserved is True
        await db.refresh(tea)
        assert tea.stock == 400

    async def test_late_payment_without_stock_needs_attention(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await owner_chat(db)
        tea = await make_tea(db, presets=[100], stock=100)
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        operation_id = next(iter(gateway(container).payments))
        container.clock.advance(minutes=31)  # type: ignore[attr-defined]
        await jobs.cancel_expired_orders(container)
        product = await db.get(Product, tea.id, populate_existing=True)
        assert product is not None
        product.stock = 0
        await db.commit()

        gateway(container).mark_paid(operation_id)
        await send_webhook(client, operation_id)
        order = await load_order(db, body["order_id"])
        assert order.status == "needs_attention"
        messages = await outbox(db, channel="telegram")
        assert any("Требует внимания" in m.body for m in messages)

    async def test_reconcile_lost_webhook(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        body = await place_order(client)
        gateway(container).mark_paid(next(iter(gateway(container).payments)))
        container.clock.advance(minutes=5)  # type: ignore[attr-defined]
        assert await jobs.reconcile_payments(container) == 1
        assert (await load_order(db, body["order_id"])).status == "paid"


class TestConcurrency:
    @pytest.mark.parametrize("buyers", [3])
    async def test_last_item_sold_once(
        self, db: AsyncSession, container: Container, buyers: int
    ) -> None:
        cup = await make_unit(db, "Последняя чаша", stock=1)
        app = create_app(container)

        async def buy(i: int) -> int:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="https://nsbtea.test"
            ) as c:
                await add_to_cart(c, cup.id, kind="unit", grams=0)
                response = await c.post(
                    "/api/checkout",
                    json=checkout_payload(email=f"buyer{i}@mail.ru", delivery={"method": "pickup"}),
                )
                return response.status_code

        statuses = await asyncio.gather(*(buy(i) for i in range(buyers)))
        assert sorted(statuses) == [201, 409, 409]
        product = await db.get(Product, cup.id, populate_existing=True)
        assert product is not None
        assert product.stock == 0
