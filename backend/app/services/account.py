"""Личный кабинет: повтор заказа, обезличивание аккаунта (SPEC 8.2)."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import DomainError, InsufficientStockError, NotFoundError
from app.models import (
    Cart,
    Customer,
    CustomerAddress,
    Favorite,
    Order,
)
from app.services import cart as cart_service
from app.services import customer_auth


async def customer_order(db: AsyncSession, customer: Customer, order_id: uuid.UUID) -> Order:
    order = await db.scalar(
        select(Order).where(Order.id == order_id, Order.customer_id == customer.id)
    )
    if order is None:
        raise NotFoundError("Заказ не найден")
    return order


async def repeat_order(
    db: AsyncSession, container: Container, customer: Customer, order_id: uuid.UUID
) -> tuple[list[str], list[str]]:
    """Положить в корзину то, что есть в наличии, и сообщить, чего нет."""
    order = await customer_order(db, customer, order_id)
    cart, _ = await cart_service.get_or_create(db, container, customer=customer, token=None)
    added: list[str] = []
    unavailable: list[str] = []
    for item in order.items:
        label = (
            f"{item.product_name}, {item.variant_label}"
            if item.product_type == "tea"
            else item.product_name
        )
        if item.product_id is None:
            unavailable.append(f"«{item.product_name}» — больше не продаётся")
            continue
        try:
            async with db.begin_nested():
                await cart_service.add_item(
                    db,
                    container,
                    cart,
                    product_id=item.product_id,
                    kind=item.variant_kind,
                    grams=item.grams,
                    qty=item.qty,
                )
            added.append(label)
        except InsufficientStockError:
            await db.refresh(cart, ["items"])
            unavailable.append(f"«{item.product_name}» — нет в наличии")
        except (NotFoundError, DomainError):
            await db.refresh(cart, ["items"])
            unavailable.append(f"«{item.product_name}» — больше не продаётся в этом варианте")
    return added, unavailable


async def anonymize(db: AsyncSession, container: Container, customer: Customer) -> None:
    """Удаление аккаунта: персональные данные стираются, заказы остаются для учёта."""
    await customer_auth.revoke_all(db, container, customer)
    await db.execute(delete(CustomerAddress).where(CustomerAddress.customer_id == customer.id))
    await db.execute(delete(Favorite).where(Favorite.customer_id == customer.id))
    await db.execute(delete(Cart).where(Cart.customer_id == customer.id))
    customer.email = None
    customer.phone = None
    customer.name = None
    customer.telegram_id = None
    customer.telegram_username = None
    customer.notes = None
    customer.marketing_consent = False
    customer.anonymized_at = container.clock.now()


async def set_default_address(db: AsyncSession, customer: Customer, address_id: uuid.UUID) -> None:
    await db.execute(
        update(CustomerAddress)
        .where(CustomerAddress.customer_id == customer.id, CustomerAddress.id != address_id)
        .values(is_default=False)
    )
