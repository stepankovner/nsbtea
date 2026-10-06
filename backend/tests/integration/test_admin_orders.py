"""Заказы в админке (SPEC 10.5): список, карточка, шаги статусов, отмена, возвраты, баллы."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.integrations.payments import FakePaymentGateway
from app.models import AuditLog, Customer, InventoryMovement, PointsTransaction, Product
from app.models.admin import AdminRole
from app.workers import jobs
from tests.factories import make_tea, make_unit
from tests.helpers import create_admin, login, outbox, owner_client
from tests.integration.test_checkout import send_webhook
from tests.orders_helpers import buy, get_order


def gateway(container: Container) -> FakePaymentGateway:
    assert isinstance(container.payments, FakePaymentGateway)
    return container.payments


class TestList:
    async def test_list_filters_and_search(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=5000)
        paid = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await buy(client, container, [(tea.id, "preset", 100, 1)], email="b@mail.ru", pay=False)
        await owner_client(client, db)

        body = (await client.get("/api/admin/orders")).json()
        assert body["total"] == 2
        assert body["counts"]["paid"] == 1
        assert body["counts"]["awaiting_payment"] == 1
        first = next(o for o in body["items"] if o["id"] == paid)
        assert first["status_label"] == "Оплачен (новый)"
        assert first["items_summary"] == "Да Хун Пао, 100 г"
        assert first["needs_action"] is True

        assert (await client.get("/api/admin/orders?status=paid")).json()["total"] == 1
        assert (await client.get("/api/admin/orders?q=10001")).json()["items"][0]["id"] == paid
        assert (await client.get("/api/admin/orders?q=NSB-10001")).json()["total"] == 1
        assert (await client.get("/api/admin/orders?q=900 123")).json()["total"] == 2
        assert (await client.get("/api/admin/orders?delivery=courier")).json()["total"] == 0

    async def test_detail(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 2)])
        await owner_client(client, db)
        detail = (await client.get(f"/api/admin/orders/{order_id}")).json()
        assert detail["number"] == "NSB-10001"
        assert detail["items"][0]["variant_label"] == "100 г"
        assert detail["items"][0]["qty"] == 2
        assert detail["customer"]["email"] == "anna@mail.ru"
        assert detail["customer"]["orders_count"] == 1
        assert detail["delivery_summary"].startswith("СДЭК — пункт выдачи")
        assert [s["label"] for s in detail["next_steps"]] == ["Начать сборку"]
        assert [h["to_status"] for h in detail["history"]] == ["awaiting_payment", "paid"]
        assert detail["can_refund"] is True
        assert detail["refundable_kop"] == detail["total_kop"]


class TestStatusFlow:
    async def test_assemble_ship_complete_with_points(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=2_000, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)

        step = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "assembling"})
        assert step.status_code == 200, step.text
        assert step.json()["status"] == "assembling"

        no_track = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "shipped"})
        assert no_track.status_code == 409
        assert "трек-номер" in no_track.json()["detail"]

        shipped = await client.post(
            f"/api/admin/orders/{order_id}/status",
            json={"to": "shipped", "tracking_number": "1234567890"},
        )
        assert shipped.status_code == 200
        emails = [
            m
            for m in await outbox(db, channel="email")
            if "передан в доставку" in (m.subject or "")
        ]
        assert "1234567890" in emails[0].body

        done = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "completed"})
        assert done.status_code == 200
        order = await get_order(db, order_id)
        # 2 000 ₽ − 10% приветственная = 1 800 ₽ → 5% = 90 баллов
        assert order.points_earned == 90
        customer = await db.get(Customer, order.customer_id, populate_existing=True)
        assert customer is not None
        assert customer.points_balance == 90
        earn = (await db.scalars(select(PointsTransaction))).one()
        assert earn.kind == "earn"
        completed_mail = [
            m for m in await outbox(db, channel="email") if "выполнен" in (m.subject or "")
        ]
        assert "90 баллов" in completed_mail[0].subject

        actions = [e.action for e in (await db.scalars(select(AuditLog))).all()]
        assert actions.count("order.status") == 3

    async def test_invalid_transition(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)], pay=False)
        await owner_client(client, db)
        response = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "paid"})
        assert response.status_code == 409
        assert "Нельзя перевести заказ" in response.json()["detail"]

    async def test_internal_comment_and_tracking(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        response = await client.patch(
            f"/api/admin/orders/{order_id}",
            json={"internal_comment": "Положить пробник шу", "tracking_number": " 999 "},
        )
        assert response.status_code == 200
        assert response.json()["internal_comment"] == "Положить пробник шу"
        assert response.json()["tracking_number"] == "999"


class TestCancelAndRefund:
    async def test_cancel_paid_order_refunds_and_restocks(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=500)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        response = await client.post(
            f"/api/admin/orders/{order_id}/cancel",
            json={"restock": True, "reason": "Клиент передумал"},
        )
        assert response.status_code == 200, response.text
        order = await get_order(db, order_id)
        assert order.status == "cancelled"
        assert order.refunded_kop == order.total_kop
        payment = next(iter(gateway(container).payments.values()))
        assert payment.refunded_kop == order.total_kop
        product = await db.get(Product, tea.id, populate_existing=True)
        assert product is not None
        assert product.stock == 500
        assert any("отменён" in (m.subject or "") for m in await outbox(db, channel="email"))

    async def test_cancel_without_restock(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=500)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        await client.post(f"/api/admin/orders/{order_id}/cancel", json={"restock": False})
        product = await db.get(Product, tea.id, populate_existing=True)
        assert product is not None
        assert product.stock == 400

    async def test_cancel_unpaid(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=500)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)], pay=False)
        await owner_client(client, db)
        response = await client.post(f"/api/admin/orders/{order_id}/cancel", json={"restock": True})
        assert response.status_code == 200
        order = await get_order(db, order_id)
        assert order.status == "cancelled"
        assert order.refunded_kop == 0

    async def test_partial_refund_with_items(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Чай", price_per_gram_kop=1_000, presets=[100], stock=5000)
        cup = await make_unit(db, "Чаша", unit_price_kop=100_000, stock=5)
        order_id = await buy(
            client, container, [(tea.id, "preset", 100, 1), (cup.id, "unit", 0, 1)]
        )
        await owner_client(client, db)
        order = await get_order(db, order_id)
        cup_item = next(i for i in order.items if i.product_name == "Чаша")
        response = await client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={
                "items": [{"order_item_id": str(cup_item.id), "qty": 1}],
                "restock": True,
                "reason": "Чаша разбилась при доставке",
            },
        )
        assert response.status_code == 200, response.text
        order = await get_order(db, order_id)
        assert order.refunded_kop == cup_item.receipt_amount_kop
        assert order.status == "paid"  # частичный возврат не меняет статус
        restock = (
            await db.scalars(
                select(InventoryMovement).where(
                    InventoryMovement.product_id == cup.id, InventoryMovement.reason == "refund"
                )
            )
        ).one()
        assert restock.delta == 1

    async def test_refund_more_than_paid(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        response = await client.post(
            f"/api/admin/orders/{order_id}/refund", json={"amount_kop": 10_000_000}
        )
        assert response.status_code == 422
        assert "больше" in response.json()["detail"]

    async def test_full_refund_after_completion_reverts_points(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        for step in ("assembling", "shipped", "completed"):
            await client.post(
                f"/api/admin/orders/{order_id}/status",
                json={"to": step, "tracking_number": "1"},
            )
        response = await client.post(
            f"/api/admin/orders/{order_id}/refund", json={"restock": False, "reason": "Брак"}
        )
        assert response.status_code == 200, response.text
        order = await get_order(db, order_id)
        assert order.status == "refunded"
        customer = await db.get(Customer, order.customer_id, populate_existing=True)
        assert customer is not None
        assert customer.points_balance == 0

    async def test_bank_refuses_refund(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        payment = next(iter(gateway(container).payments.values()))
        payment.refunded_kop = payment.request.amount_kop  # всё уже вернули вручную в банке
        response = await client.post(f"/api/admin/orders/{order_id}/refund", json={})
        assert response.status_code == 502
        assert "интернет-банк" in response.json()["detail"]


class TestNeedsAttention:
    async def test_resume_after_restock(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, presets=[100], stock=100)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)], pay=False)
        container.clock.advance(minutes=31)  # type: ignore[attr-defined]
        await jobs.cancel_expired_orders(container)
        product = await db.get(Product, tea.id, populate_existing=True)
        assert product is not None
        product.stock = 0
        await db.commit()
        operation_id = list(gateway(container).payments)[-1]
        gateway(container).mark_paid(operation_id)
        await send_webhook(client, operation_id)
        assert (await get_order(db, order_id)).status == "needs_attention"

        await owner_client(client, db)
        blocked = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "paid"})
        assert blocked.status_code == 409
        assert "не хватает" in blocked.json()["detail"].lower()

        product.stock = 300
        await db.commit()
        resumed = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "paid"})
        assert resumed.status_code == 200, resumed.text
        product = await db.get(Product, tea.id, populate_existing=True)
        assert product is not None
        assert product.stock == 200


async def test_staff_with_orders_permission_cannot_see_revenue_but_works_orders(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    tea = await make_tea(db, presets=[100], stock=5000)
    order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=["orders"],
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")
    step = await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "assembling"})
    assert step.status_code == 200
    refund = await client.post(f"/api/admin/orders/{order_id}/refund", json={})
    assert refund.status_code == 403
