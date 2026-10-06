"""Фоновые задачи. Каждая открывает свою сессию и коммитит сама; ошибка по одному
заказу не мешает обработать остальные."""

import logging
from datetime import timedelta

from sqlalchemy import select

from app.container import Container
from app.domain.orders import OrderStatus
from app.models import Order
from app.services import orders as order_service
from app.services import payments
from app.services.outbox import deliver_pending

logger = logging.getLogger(__name__)

RECONCILE_WINDOW = timedelta(hours=1)


async def deliver_outbox(container: Container) -> int:
    return await deliver_pending(container)


async def cancel_expired_orders(container: Container) -> int:
    """Отменить заказы, не оплаченные за 30 минут. Сначала сверяемся с банком —
    вдруг оплата прошла, а вебхук потерялся."""
    now = container.clock.now()
    async with container.session_factory() as db:
        ids = (
            await db.scalars(
                select(Order.id).where(
                    Order.status == OrderStatus.AWAITING_PAYMENT.value,
                    Order.reserved_until <= now,
                )
            )
        ).all()
    cancelled = 0
    for order_id in ids:
        async with container.session_factory() as db:
            try:
                order = await order_service.lock_order(db, order_id)
                if order.status != OrderStatus.AWAITING_PAYMENT.value:
                    continue
                if await payments.refresh_order_payment(db, container, order):
                    await db.commit()
                    continue
                await order_service.cancel_unpaid(
                    db,
                    container,
                    order,
                    comment=f"Не оплачен за {container.settings.payment_ttl_minutes} минут",
                )
                await db.commit()
                cancelled += 1
            except Exception:
                await db.rollback()
                logger.exception("Не удалось отменить заказ %s", order_id)
    return cancelled


async def reconcile_payments(container: Container) -> int:
    """Резервная сверка неоплаченных заказов младше часа (на случай потерянного вебхука)."""
    now = container.clock.now()
    async with container.session_factory() as db:
        ids = (
            await db.scalars(
                select(Order.id).where(
                    Order.status.in_(
                        [OrderStatus.AWAITING_PAYMENT.value, OrderStatus.CANCELLED.value]
                    ),
                    Order.paid_at.is_(None),
                    Order.payment_method == "online",
                    Order.created_at >= now - RECONCILE_WINDOW,
                )
            )
        ).all()
    confirmed = 0
    for order_id in ids:
        async with container.session_factory() as db:
            try:
                order = await order_service.lock_order(db, order_id)
                if order.paid_at is None and await payments.refresh_order_payment(
                    db, container, order
                ):
                    confirmed += 1
                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("Сверка заказа %s не удалась", order_id)
    return confirmed
