"""Создание заказов в тестах через настоящий путь покупателя."""

import json
import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.integrations.payments import FakePaymentGateway
from app.models import Order
from tests.helpers import add_to_cart

PVZ = {
    "method": "cdek_pvz",
    "city_code": 44,
    "city_name": "Москва",
    "pvz_code": "MSK123",
    "pvz_address": "Москва, ул. Тверская, 1",
}


async def buy(
    client: AsyncClient,
    container: Container,
    lines: list[tuple[uuid.UUID, str, int, int]],
    *,
    email: str = "anna@mail.ru",
    delivery: dict[str, Any] | None = None,
    pay: bool = True,
) -> str:
    """Положить товары в корзину, оформить и (по умолчанию) оплатить. Возвращает id заказа."""
    for product_id, kind, grams, qty in lines:
        await add_to_cart(client, product_id, kind=kind, grams=grams, qty=qty)
    response = await client.post(
        "/api/checkout",
        json={
            "name": "Анна",
            "phone": "+79001234567",
            "email": email,
            "delivery": delivery or PVZ,
            "consent_offer": True,
            "consent_pd": True,
        },
    )
    assert response.status_code == 201, response.text
    order_id = str(response.json()["order_id"])
    if pay:
        gateway = container.payments
        assert isinstance(gateway, FakePaymentGateway)
        operation_id = list(gateway.payments)[-1]
        gateway.mark_paid(operation_id)
        webhook = await client.post(
            "/api/webhooks/tochka",
            content=json.dumps({"operationId": operation_id, "status": "APPROVED"}).encode(),
        )
        assert webhook.status_code == 200
    return order_id


async def get_order(db: AsyncSession, order_id: str) -> Order:
    order = await db.get(Order, uuid.UUID(order_id), populate_existing=True)
    assert order is not None
    return order
