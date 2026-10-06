"""Личный кабинет (SPEC 8.2): заказы, повтор, баллы, избранное, адреса, профиль, удаление."""

import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import Customer, Order, PointsTransaction
from tests.factories import make_tea, make_unit
from tests.helpers import add_to_cart, customer_login
from tests.integration.test_checkout import place_order


async def test_requires_login(client: AsyncClient) -> None:
    for path in ("/api/account/me", "/api/account/orders", "/api/account/points"):
        response = await client.get(path)
        assert response.status_code == 401
        assert response.json()["detail"] == "Войдите в личный кабинет"


async def test_orders_and_repeat(client: AsyncClient, db: AsyncSession) -> None:
    await customer_login(client, db, "anna@mail.ru")
    tea = await make_tea(db, "Да Хун Пао", presets=[50, 100], stock=1000)
    cup = await make_unit(db, "Чаша", stock=1)
    await add_to_cart(client, tea.id, grams=100)
    await add_to_cart(client, cup.id, kind="unit", grams=0)
    body = await place_order(client)

    orders = (await client.get("/api/account/orders")).json()
    assert orders[0]["number"] == "NSB-10001"
    assert orders[0]["status_label"] == "Ожидает оплаты"
    detail = (await client.get(f"/api/account/orders/{body['order_id']}")).json()
    assert [i["name"] for i in detail["items"]] == ["Да Хун Пао", "Чаша"]
    assert detail["items"][0]["variant_label"] == "100 г"

    # чашу больше не купить (осталась одна, она в этом заказе) — повтор сообщит об этом
    repeat = (await client.post(f"/api/account/orders/{body['order_id']}/repeat")).json()
    assert repeat["added"] == ["Да Хун Пао, 100 г"]
    assert repeat["unavailable"] == ["«Чаша» — нет в наличии"]
    cart = (await client.get("/api/cart")).json()
    assert len(cart["lines"]) == 1


async def test_cannot_see_others_orders(client: AsyncClient, db: AsyncSession) -> None:
    tea = await make_tea(db, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    body = await place_order(client, email="other@mail.ru")
    client.cookies.clear()
    await customer_login(client, db, "anna@mail.ru")
    response = await client.get(f"/api/account/orders/{body['order_id']}")
    assert response.status_code == 404


async def test_silent_registration_links_orders(client: AsyncClient, db: AsyncSession) -> None:
    tea = await make_tea(db, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    await place_order(client, email="anna@mail.ru")
    await customer_login(client, db, "anna@mail.ru")
    assert len((await client.get("/api/account/orders")).json()) == 1


async def test_points_wallet(client: AsyncClient, db: AsyncSession) -> None:
    await customer_login(client, db, "anna@mail.ru")
    customer = (await db.scalars(select(Customer))).one()
    customer.points_balance = 150
    db.add(
        PointsTransaction(
            customer_id=customer.id, delta=150, kind="manual", balance_after=150, comment="Подарок"
        )
    )
    await db.commit()
    tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    body = await place_order(client)
    order = await db.get(Order, uuid.UUID(body["order_id"]))
    assert order is not None
    order.status = "paid"
    await db.commit()

    wallet = (await client.get("/api/account/points")).json()
    assert wallet["balance"] == 150
    assert wallet["pending"] == order.points_to_earn
    assert wallet["history"][0]["kind_label"] == "Изменено магазином"
    assert wallet["history"][0]["comment"] == "Подарок"


async def test_favorites(client: AsyncClient, db: AsyncSession) -> None:
    await customer_login(client, db, "anna@mail.ru")
    tea = await make_tea(db, "Да Хун Пао")
    assert (await client.put(f"/api/account/favorites/{tea.id}")).status_code == 200
    assert (await client.put(f"/api/account/favorites/{tea.id}")).status_code == 200
    favorites = (await client.get("/api/account/favorites")).json()
    assert [f["name"] for f in favorites] == ["Да Хун Пао"]
    await client.delete(f"/api/account/favorites/{tea.id}")
    assert (await client.get("/api/account/favorites")).json() == []


async def test_addresses(client: AsyncClient, db: AsyncSession) -> None:
    await customer_login(client, db, "anna@mail.ru")
    created = await client.post(
        "/api/account/addresses",
        json={
            "kind": "courier",
            "label": "Дом",
            "data": {"address": "Владимир, ул. Мира, 5"},
            "is_default": True,
        },
    )
    assert created.status_code == 201
    address_id = created.json()["id"]
    second = await client.post(
        "/api/account/addresses",
        json={"kind": "cdek_pvz", "label": "ПВЗ", "data": {"pvz_code": "VLD2"}, "is_default": True},
    )
    addresses = (await client.get("/api/account/addresses")).json()
    defaults = [a["label"] for a in addresses if a["is_default"]]
    assert defaults == ["ПВЗ"]
    await client.delete(f"/api/account/addresses/{address_id}")
    assert len((await client.get("/api/account/addresses")).json()) == 1
    assert second.status_code == 201


async def test_profile_update(client: AsyncClient, db: AsyncSession) -> None:
    await customer_login(client, db, "anna@mail.ru")
    response = await client.patch(
        "/api/account/profile",
        json={"name": "Анна", "phone": "8 900 111 22 33", "marketing_consent": True},
    )
    assert response.status_code == 200
    me = response.json()
    assert me["phone"] == "+79001112233"
    assert me["marketing_consent"] is True


async def test_delete_account_anonymizes_but_keeps_orders(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    await customer_login(client, db, "anna@mail.ru")
    tea = await make_tea(db, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    await place_order(client)
    response = await client.request("DELETE", "/api/account", json={"confirm": True})
    assert response.status_code == 200
    assert (await client.get("/api/account/me")).status_code == 401
    customer = (await db.scalars(select(Customer))).one()
    await db.refresh(customer)
    assert customer.anonymized_at is not None
    assert customer.email is None
    assert customer.phone is None
    assert len((await db.scalars(select(Order))).all()) == 1
