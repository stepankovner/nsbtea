"""Жизненный цикл заказа: статусы с историей, резерв и возврат остатка и баллов,
уведомления владельцу и письма покупателю."""

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import InsufficientStockError, NotFoundError
from app.domain.inventory import MovementReason
from app.domain.loyalty import PointsKind
from app.domain.money import format_rub
from app.domain.orders import (
    DELIVERY_LABELS,
    DeliveryMethod,
    OrderStatus,
    customer_email_on,
    ensure_transition,
    status_label,
)
from app.models import AdminUser, Order, OrderStatusChange, PromoCodeUsage
from app.models.system import NotificationEvent
from app.services import emails, inventory
from app.services.notifications import admin_link, h, notify_owner
from app.services.outbox import enqueue_email
from app.services.points import apply_points

SYSTEM = "system"
ADMIN = "admin"
CUSTOMER = "customer"


async def lock_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id).with_for_update(of=Order))
    if order is None:
        raise NotFoundError("Заказ не найден")
    return order


def record_history(
    order: Order,
    *,
    from_status: str | None,
    to_status: str,
    actor_type: str,
    actor: AdminUser | None = None,
    comment: str | None = None,
    at: datetime | None = None,
) -> None:
    change = OrderStatusChange(
        from_status=from_status,
        to_status=to_status,
        actor_type=actor_type,
        actor_id=actor.id if actor else None,
        actor_name=actor.name if actor else ("Система" if actor_type == SYSTEM else None),
        comment=comment,
    )
    if at is not None:
        change.created_at = at
    order.history.append(change)


async def set_status(
    db: AsyncSession,
    container: Container,
    order: Order,
    to: OrderStatus,
    *,
    by_system: bool,
    actor: AdminUser | None = None,
    comment: str | None = None,
) -> None:
    current = OrderStatus(order.status)
    ensure_transition(current, to, by_system=by_system)
    now = container.clock.now()
    order.status = to.value
    if to is OrderStatus.PAID and order.paid_at is None:
        order.paid_at = now
    elif to is OrderStatus.SHIPPED:
        order.shipped_at = now
    elif to is OrderStatus.COMPLETED:
        order.completed_at = now
    elif to is OrderStatus.CANCELLED:
        order.cancelled_at = now
    record_history(
        order,
        from_status=current.value,
        to_status=to.value,
        actor_type=SYSTEM if by_system else ADMIN,
        actor=actor,
        comment=comment,
        at=now,
    )


async def reserve_stock(db: AsyncSession, container: Container, order: Order) -> None:
    """Списать остаток под заказ. Если чего-то не хватает — InsufficientStockError
    (транзакция откатывается целиком)."""
    for item in order.items:
        if item.product_id is None:
            raise InsufficientStockError(f"«{item.product_name}» больше не продаётся")
        await inventory.change_stock(
            db,
            container,
            item.product_id,
            -item.stock_amount,
            MovementReason.SALE,
            order_id=order.id,
            comment=f"Заказ {order.display_number}",
        )
    order.stock_reserved = True


async def release_stock(
    db: AsyncSession,
    container: Container,
    order: Order,
    *,
    reason: MovementReason = MovementReason.CANCEL,
    actor: AdminUser | None = None,
) -> None:
    if not order.stock_reserved:
        return
    for item in order.items:
        if item.product_id is None:
            continue
        await inventory.change_stock(
            db,
            container,
            item.product_id,
            item.stock_amount,
            reason,
            order_id=order.id,
            comment=f"Заказ {order.display_number}",
            actor=actor,
        )
    order.stock_reserved = False


async def reserve_points(db: AsyncSession, order: Order) -> None:
    if order.points_spent and order.customer_id:
        await apply_points(
            db,
            order.customer_id,
            -order.points_spent,
            PointsKind.SPEND_RESERVE,
            order_id=order.id,
            comment=f"Оплата части заказа {order.display_number}",
        )


async def release_points(db: AsyncSession, order: Order, comment: str) -> None:
    if order.points_spent and order.customer_id:
        await apply_points(
            db,
            order.customer_id,
            order.points_spent,
            PointsKind.RELEASE,
            order_id=order.id,
            comment=comment,
        )


async def drop_promo_usage(db: AsyncSession, order: Order) -> None:
    await db.execute(delete(PromoCodeUsage).where(PromoCodeUsage.order_id == order.id))


async def cancel_unpaid(
    db: AsyncSession,
    container: Container,
    order: Order,
    *,
    comment: str,
    by_system: bool = True,
    actor: AdminUser | None = None,
) -> None:
    """Отмена заказа, который не был оплачен: вернуть остаток, баллы, промокод."""
    await release_stock(db, container, order, actor=actor)
    await release_points(db, order, f"Заказ {order.display_number} отменён")
    await drop_promo_usage(db, order)
    await set_status(
        db,
        container,
        order,
        OrderStatus.CANCELLED,
        by_system=by_system,
        actor=actor,
        comment=comment,
    )


def item_line(name: str, label: str, qty: int, product_type: str) -> str:
    base = f"{name}, {label}" if product_type == "tea" else name
    return f"{base} × {qty}" if qty > 1 else base


def delivery_summary(order: Order) -> str:
    try:
        method = DeliveryMethod(order.delivery_method)
        label = DELIVERY_LABELS[method]
    except ValueError:
        return order.delivery_method
    data = order.delivery_data
    detail = data.get("pvz_address") or data.get("address") or ""
    if data.get("city_name") and data.get("city_name") not in detail:
        detail = f"{data['city_name']}, {detail}".strip(", ")
    if data.get("courier_time"):
        detail = f"{detail} (удобно: {data['courier_time']})"
    return f"{label}{': ' + detail if detail else ''}"


async def notify_new_order(db: AsyncSession, container: Container, order: Order) -> None:
    lines = [
        f"🛒 <b>Новый заказ {order.display_number}</b> — {format_rub(order.total_kop)}",
        "Оплачен онлайн" if order.status == OrderStatus.PAID.value else "Оплата при получении",
        "",
        *(
            f"• {h(item_line(i.product_name, i.variant_label, i.qty, i.product_type))}"
            f" — {format_rub(i.line_total_kop)}"
            for i in order.items
        ),
        "",
        f"Доставка: {h(delivery_summary(order))}"
        + (f" — {format_rub(order.delivery_kop)}" if order.delivery_kop else ""),
        f"Клиент: {h(order.name)}, {order.phone}, {h(order.email)}",
    ]
    if order.customer_comment:
        lines.append(f"Комментарий: {h(order.customer_comment)}")
    lines.append(admin_link(container, f"/orders/{order.id}"))
    await notify_owner(db, container, NotificationEvent.NEW_ORDER, "\n".join(lines))


async def notify_attention(
    db: AsyncSession, container: Container, order: Order, reason: str
) -> None:
    await notify_owner(
        db,
        container,
        NotificationEvent.ORDER_ATTENTION,
        f"❗ <b>Требует внимания: заказ {order.display_number}</b>\n{h(reason)}\n"
        f"{admin_link(container, f'/orders/{order.id}')}",
    )


def email_customer(
    db: AsyncSession, container: Container, order: Order, status: OrderStatus, *, was_paid: bool
) -> None:
    if not order.email or not customer_email_on(status, was_paid=was_paid):
        return
    base = container.settings.public_base_url.rstrip("/")
    if status in (OrderStatus.PAID, OrderStatus.ACCEPTED):
        message = emails.order_confirmed_email(order, base, paid=status is OrderStatus.PAID)
    elif status is OrderStatus.SHIPPED:
        message = emails.order_shipped_email(order, base)
    elif status is OrderStatus.COMPLETED:
        message = emails.order_completed_email(order, base)
    elif status is OrderStatus.CANCELLED:
        message = emails.order_cancelled_email(order, base)
    elif status is OrderStatus.REFUNDED:
        message = emails.order_refunded_email(order, order.refunded_kop, base)
    else:
        return
    subject, text, html = message
    enqueue_email(
        db, to=order.email, subject=subject, text=text, html=html, event=f"order_{status}"
    )


def public_status_label(order: Order) -> str:
    try:
        method = DeliveryMethod(order.delivery_method)
    except ValueError:
        method = None
    return status_label(OrderStatus(order.status), method)
