"""Фоновые задачи. Каждая открывает свою сессию и коммитит сама; ошибка по одному
заказу не мешает обработать остальные."""

import logging
from datetime import timedelta

from sqlalchemy import delete, select

from app.container import Container
from app.domain.orders import OrderStatus
from app.domain.texts import day_month
from app.domain.thursday import msk_today, needs_planning_reminder, upcoming_thursdays
from app.models import (
    AdminChallenge,
    Cart,
    CustomerSession,
    LoginCode,
    Order,
    OutboxMessage,
    ThursdayPlan,
)
from app.models.system import NotificationEvent
from app.services import orders as order_service
from app.services import payments
from app.services.admin_orders import earn_points
from app.services.notifications import admin_link, notify_owner
from app.services.outbox import deliver_pending
from app.services.reports import build_weekly_summary
from app.services.settings import get_group
from app.services.settings_schema import DeliverySettings

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


async def auto_complete_orders(container: Container) -> int:
    """Заказы «передан в доставку» дольше N дней — выполнены, клиенту начисляются баллы."""
    async with container.session_factory() as db:
        settings = await get_group(db, DeliverySettings)
        deadline = container.clock.now() - timedelta(days=settings.auto_complete_days)
        ids = (
            await db.scalars(
                select(Order.id).where(
                    Order.status == OrderStatus.SHIPPED.value, Order.shipped_at <= deadline
                )
            )
        ).all()
    done = 0
    for order_id in ids:
        async with container.session_factory() as db:
            try:
                order = await order_service.lock_order(db, order_id)
                if order.status != OrderStatus.SHIPPED.value:
                    continue
                await order_service.set_status(
                    db,
                    container,
                    order,
                    OrderStatus.COMPLETED,
                    by_system=True,
                    comment=(
                        f"Автоматически через {settings.auto_complete_days} дней после отправки"
                    ),
                )
                await earn_points(db, order, None)
                order_service.email_customer(
                    db, container, order, OrderStatus.COMPLETED, was_paid=order.paid_at is not None
                )
                await db.commit()
                done += 1
            except Exception:
                await db.rollback()
                logger.exception("Не удалось завершить заказ %s", order_id)
    return done


async def thursday_reminder(container: Container) -> bool:
    """Понедельник 10:00 МСК: если впереди не запланирован ни один четверг — напомнить."""
    async with container.session_factory() as db:
        today = msk_today(container.clock.now())
        planned = (
            await db.scalars(select(ThursdayPlan.date).where(ThursdayPlan.date >= today))
        ).all()
        if not needs_planning_reminder(today, planned):
            return False
        next_thursday = upcoming_thursdays(today, 1)[0]
        await notify_owner(
            db,
            container,
            NotificationEvent.THURSDAY_REMINDER,
            f"🍵 <b>Чай недели не запланирован</b>\nВыберите чаи на четверг, "
            f"{day_month(next_thursday)}: {admin_link(container, '/promotions/thursdays')}",
        )
        await db.commit()
        return True


async def weekly_summary(container: Container) -> str:
    """Понедельник 10:00 МСК: сводка за прошлую неделю (пн–вс по Москве)."""
    async with container.session_factory() as db:
        text = await build_weekly_summary(db, container)
        await notify_owner(db, container, NotificationEvent.WEEKLY_SUMMARY, text)
        await db.commit()
        return text


async def cleanup(container: Container) -> dict[str, int]:
    now = container.clock.now()
    async with container.session_factory() as db:
        codes = await db.execute(
            delete(LoginCode).where(LoginCode.expires_at < now - timedelta(days=1))
        )
        challenges = await db.execute(
            delete(AdminChallenge).where(AdminChallenge.expires_at < now - timedelta(days=7))
        )
        carts = await db.execute(
            delete(Cart).where(
                Cart.customer_id.is_(None), Cart.updated_at < now - timedelta(days=60)
            )
        )
        sessions = await db.execute(
            delete(CustomerSession).where(CustomerSession.expires_at < now - timedelta(days=30))
        )
        outbox_rows = await db.execute(
            delete(OutboxMessage).where(
                OutboxMessage.status == "sent", OutboxMessage.created_at < now - timedelta(days=90)
            )
        )
        await db.commit()
    return {
        "login_codes": codes.rowcount or 0,  # type: ignore[attr-defined]
        "challenges": challenges.rowcount or 0,  # type: ignore[attr-defined]
        "carts": carts.rowcount or 0,  # type: ignore[attr-defined]
        "sessions": sessions.rowcount or 0,  # type: ignore[attr-defined]
        "outbox": outbox_rows.rowcount or 0,  # type: ignore[attr-defined]
    }
