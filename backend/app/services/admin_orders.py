"""Заказы в админке: список, смена статуса крупными шагами, отмена, возвраты (SPEC 10.5)."""

import logging
import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import (
    DomainError,
    ExternalServiceError,
    InsufficientStockError,
    InvalidTransitionError,
    NotFoundError,
)
from app.domain.inventory import MovementReason
from app.domain.loyalty import PointsKind, proportional_points, revocable_points
from app.domain.money import format_rub
from app.domain.orders import (
    STATUS_LABELS,
    DeliveryMethod,
    OrderStatus,
    ensure_can_ship,
)
from app.integrations.payments import PaymentGatewayError
from app.models import AdminUser, Customer, Order, Refund
from app.services import audit, emails, inventory
from app.services import orders as order_service
from app.services.outbox import enqueue_email
from app.services.points import NotEnoughPointsError, apply_points

logger = logging.getLogger(__name__)

REFUNDABLE = (
    OrderStatus.PAID,
    OrderStatus.ASSEMBLING,
    OrderStatus.SHIPPED,
    OrderStatus.COMPLETED,
    OrderStatus.NEEDS_ATTENTION,
)


@dataclass(frozen=True, slots=True)
class OrderFilters:
    status: str | None = None
    delivery: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    q: str | None = None


def _search(query: Select[Order], q: str) -> Select[Order]:
    text = q.strip()
    digits = re.sub(r"\D", "", text)
    conditions: list[ColumnElement[bool]] = [
        Order.name.ilike(f"%{text}%"),
        Order.email.ilike(f"%{text}%"),
    ]
    number_match = re.fullmatch(r"(?i)(?:nsb-?)?(\d{4,8})", text.replace(" ", ""))
    if number_match:
        conditions.append(Order.number == int(number_match.group(1)))
    if len(digits) >= 4:
        tail = digits[-10:] if len(digits) > 10 else digits
        conditions.append(Order.phone.contains(tail))
    return query.where(or_(*conditions))


async def list_orders(
    db: AsyncSession, filters: OrderFilters, *, page: int, per_page: int
) -> tuple[list[Order], int, dict[str, int]]:
    query = select(Order)
    if filters.delivery:
        query = query.where(Order.delivery_method == filters.delivery)
    if filters.date_from:
        query = query.where(Order.created_at >= filters.date_from)
    if filters.date_to:
        query = query.where(Order.created_at < filters.date_to)
    if filters.q:
        query = _search(query, filters.q)
    filtered = query.subquery()
    counts_rows = await db.execute(
        select(filtered.c.status, func.count()).group_by(filtered.c.status)
    )
    counts = {str(status): int(n) for status, n in counts_rows.all()}
    if filters.status:
        query = query.where(Order.status == filters.status)
    total = int(await db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = (
        await db.scalars(
            query.order_by(Order.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        )
    ).all()
    return list(rows), total, counts


def needs_action(order: Order) -> bool:
    return OrderStatus(order.status) in (
        OrderStatus.PAID,
        OrderStatus.ACCEPTED,
        OrderStatus.NEEDS_ATTENTION,
    )


def label(order: Order) -> str:
    return order_service.public_status_label(order)


async def _customer_orders_count(db: AsyncSession, customer_id: uuid.UUID | None) -> int:
    if customer_id is None:
        return 0
    return int(
        await db.scalar(
            select(func.count()).select_from(Order).where(Order.customer_id == customer_id)
        )
        or 0
    )


async def customer_summary(db: AsyncSession, order: Order) -> tuple[Customer | None, int]:
    customer = await db.get(Customer, order.customer_id) if order.customer_id else None
    return customer, await _customer_orders_count(db, order.customer_id)


def refundable_kop(order: Order) -> int:
    if order.paid_at is None or order.payment_method != "online":
        return 0
    return max(0, order.total_kop - order.refunded_kop)


async def earn_points(db: AsyncSession, order: Order, actor: AdminUser | None) -> None:
    if order.customer_id and order.points_to_earn > 0 and order.points_earned == 0:
        await apply_points(
            db,
            order.customer_id,
            order.points_to_earn,
            PointsKind.EARN,
            order_id=order.id,
            comment=f"За заказ {order.display_number}",
            actor=actor,
        )
        order.points_earned = order.points_to_earn


async def change_status(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    order_id: uuid.UUID,
    *,
    to: OrderStatus,
    tracking_number: str | None = None,
    comment: str | None = None,
) -> Order:
    order = await order_service.lock_order(db, order_id)
    current = OrderStatus(order.status)
    if to is OrderStatus.CANCELLED:
        raise InvalidTransitionError("Чтобы отменить заказ, нажмите «Отменить заказ»")
    if to is OrderStatus.REFUNDED:
        raise InvalidTransitionError("Чтобы вернуть деньги, нажмите «Оформить возврат»")
    if to is OrderStatus.SHIPPED:
        if tracking_number and tracking_number.strip():
            order.tracking_number = tracking_number.strip()
        ensure_can_ship_order(order)
    if current is OrderStatus.NEEDS_ATTENTION and to is OrderStatus.PAID:
        await _resume_attention(db, container, order)

    await order_service.set_status(
        db, container, order, to, by_system=False, actor=actor, comment=comment
    )
    if to is OrderStatus.COMPLETED:
        await earn_points(db, order, actor)
    order_service.email_customer(db, container, order, to, was_paid=order.paid_at is not None)
    await container.kicker.kick("deliver_outbox")
    await audit.record(
        db,
        actor,
        action="order.status",
        entity="order",
        entity_id=order.id,
        summary=f"Заказ {order.display_number}: {STATUS_LABELS[current]} → {STATUS_LABELS[to]}",
        diff={"status": [current.value, to.value]},
    )
    return order


def ensure_can_ship_order(order: Order) -> None:
    ensure_can_ship(DeliveryMethod(order.delivery_method), tracking_number=order.tracking_number)


async def _resume_attention(db: AsyncSession, container: Container, order: Order) -> None:
    """«Вернуть в работу» после сбоя: восстановить резерв, если его нет."""
    if order.stock_reserved:
        return
    try:
        async with db.begin_nested():
            await order_service.reserve_stock(db, container, order)
            await order_service.reserve_points(db, order)
    except InsufficientStockError as exc:
        raise InsufficientStockError(
            f"Не хватает товара, чтобы вернуть заказ в работу. {exc.message}. "
            "Примите поставку или оформите возврат денег."
        ) from exc
    except NotEnoughPointsError as exc:
        raise DomainError(
            "У покупателя не хватает баллов, которыми он платил. Начислите их вручную "
            "или оформите возврат."
        ) from exc


async def update_order(
    db: AsyncSession,
    actor: AdminUser,
    order_id: uuid.UUID,
    *,
    internal_comment: str | None,
    tracking_number: str | None,
    fields: set[str],
) -> Order:
    order = await order_service.lock_order(db, order_id)
    before = {"internal_comment": order.internal_comment, "tracking_number": order.tracking_number}
    if "internal_comment" in fields:
        order.internal_comment = (internal_comment or "").strip() or None
    if "tracking_number" in fields:
        order.tracking_number = (tracking_number or "").strip() or None
    after = {"internal_comment": order.internal_comment, "tracking_number": order.tracking_number}
    diff = audit.diff_fields(before, after)
    if diff:
        await audit.record(
            db,
            actor,
            action="order.update",
            entity="order",
            entity_id=order.id,
            summary=f"Изменён заказ {order.display_number}",
            diff=diff,
        )
    return order


async def _refund_money(
    db: AsyncSession,
    container: Container,
    order: Order,
    amount_kop: int,
    actor: AdminUser,
    reason: str | None,
    items: list[dict[str, object]],
) -> Refund:
    payment = next(
        (p for p in reversed(order.payments) if p.operation_id and p.paid_at is not None), None
    )
    if payment is None or payment.operation_id is None:
        raise DomainError("У заказа нет онлайн-оплаты — вернуть деньги через банк нельзя")
    try:
        result = await container.payments.refund(payment.operation_id, amount_kop)
    except PaymentGatewayError as exc:
        raise ExternalServiceError(
            f"Банк не принял возврат ({exc}). Попробуйте позже или сделайте возврат "
            "в интернет-банке Точки, а затем отметьте заказ здесь."
        ) from exc
    logger.info("Возврат по заказу %s принят банком: %s", order.display_number, result.refund_id)
    refund = Refund(
        order_id=order.id,
        payment_id=payment.id,
        amount_kop=amount_kop,
        items=items,
        status="succeeded",
        reason=reason,
        actor_id=actor.id,
        created_at=container.clock.now(),
    )
    order.refunds.append(refund)
    order.refunded_kop += amount_kop
    return refund


async def _adjust_points_for_refund(
    db: AsyncSession, order: Order, *, before_kop: int, after_kop: int, actor: AdminUser
) -> None:
    """Вернуть потраченные и забрать начисленные баллы пропорционально возвращённой сумме."""
    if not order.customer_id or order.total_kop == 0:
        return
    whole = order.total_kop

    def share(points: int) -> int:
        return proportional_points(points=points, part_kop=after_kop, whole_kop=whole) - (
            proportional_points(points=points, part_kop=before_kop, whole_kop=whole)
        )

    spent_back = share(order.points_spent)
    if spent_back > 0:
        await apply_points(
            db,
            order.customer_id,
            spent_back,
            PointsKind.RELEASE,
            order_id=order.id,
            comment=f"Возврат по заказу {order.display_number}",
            actor=actor,
        )
    earned_back = share(order.points_earned)
    if earned_back > 0:
        customer = await db.get(Customer, order.customer_id)
        balance = customer.points_balance if customer else 0
        take = revocable_points(requested=earned_back, balance=balance)
        if take > 0:
            await apply_points(
                db,
                order.customer_id,
                -take,
                PointsKind.REVERT,
                order_id=order.id,
                comment=f"Отмена начисления: возврат по заказу {order.display_number}",
                actor=actor,
            )


async def cancel_order(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    order_id: uuid.UUID,
    *,
    restock: bool,
    reason: str | None,
) -> Order:
    order = await order_service.lock_order(db, order_id)
    status = OrderStatus(order.status)
    comment = reason.strip() if reason and reason.strip() else "Отменён в админке"
    if status in (OrderStatus.SHIPPED, OrderStatus.COMPLETED):
        raise InvalidTransitionError("Заказ уже передан покупателю — оформите возврат")
    if status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
        raise InvalidTransitionError("Заказ уже отменён")
    was_paid = order.paid_at is not None and order.payment_method == "online"
    if was_paid and not actor.is_owner:
        raise DomainError("Отменить оплаченный заказ может только владелец — нужен возврат денег")

    if was_paid:
        amount = refundable_kop(order)
        if amount > 0:
            before = order.refunded_kop
            await _refund_money(db, container, order, amount, actor, comment, [])
            await _adjust_points_for_refund(
                db, order, before_kop=before, after_kop=order.refunded_kop, actor=actor
            )
    else:
        await order_service.release_points(db, order, f"Заказ {order.display_number} отменён")

    if restock:
        await order_service.release_stock(db, container, order, actor=actor)
    else:
        order.stock_reserved = False
    await order_service.drop_promo_usage(db, order)
    await order_service.set_status(
        db, container, order, OrderStatus.CANCELLED, by_system=False, actor=actor, comment=comment
    )
    order_service.email_customer(db, container, order, OrderStatus.CANCELLED, was_paid=was_paid)
    await container.kicker.kick("deliver_outbox")
    await audit.record(
        db,
        actor,
        action="order.cancel",
        entity="order",
        entity_id=order.id,
        summary=f"Заказ {order.display_number} отменён"
        + (f", возврат {format_rub(order.refunded_kop)}" if was_paid else "")
        + ("" if restock else " (товар на склад не возвращён)"),
        diff={"status": [status.value, OrderStatus.CANCELLED.value]},
    )
    return order


@dataclass(frozen=True, slots=True)
class RefundLine:
    order_item_id: uuid.UUID
    qty: int | None


async def refund_order(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    order_id: uuid.UUID,
    *,
    amount_kop: int | None,
    lines: Sequence[RefundLine],
    restock: bool,
    reason: str | None,
) -> Order:
    order = await order_service.lock_order(db, order_id)
    status = OrderStatus(order.status)
    if status not in REFUNDABLE:
        raise InvalidTransitionError(f"Возврат невозможен: заказ «{STATUS_LABELS[status]}»")
    available = refundable_kop(order)
    if available <= 0:
        raise DomainError("По этому заказу нечего возвращать")

    items_by_id = {i.id: i for i in order.items}
    restock_plan: list[tuple[uuid.UUID, int, str]] = []
    refund_items: list[dict[str, object]] = []
    if lines:
        total = 0
        for line in lines:
            item = items_by_id.get(line.order_item_id)
            if item is None:
                raise NotFoundError("Позиция заказа не найдена")
            qty = line.qty or item.qty
            if not 1 <= qty <= item.qty:
                raise DomainError(f"«{item.product_name}»: можно вернуть от 1 до {item.qty}")
            total += item.receipt_amount_kop * qty // item.qty
            refund_items.append(
                {"order_item_id": str(item.id), "name": item.product_name, "qty": qty}
            )
            if item.product_id:
                amount = item.grams * qty if item.product_type == "tea" else qty
                restock_plan.append((item.product_id, amount, item.product_name))
        amount = amount_kop or total
    else:
        amount = amount_kop or available
    if amount <= 0:
        raise DomainError("Сумма возврата должна быть больше нуля")
    if amount > available:
        raise DomainError(
            f"Сумма возврата больше, чем можно вернуть: доступно {format_rub(available)}"
        )

    before = order.refunded_kop
    await _refund_money(db, container, order, amount, actor, reason, refund_items)
    await _adjust_points_for_refund(
        db, order, before_kop=before, after_kop=order.refunded_kop, actor=actor
    )
    full = order.refunded_kop >= order.total_kop
    if restock:
        if restock_plan:
            for product_id, qty, _ in restock_plan:
                await inventory.change_stock(
                    db,
                    container,
                    product_id,
                    qty,
                    MovementReason.REFUND,
                    order_id=order.id,
                    comment=f"Возврат по заказу {order.display_number}",
                    actor=actor,
                )
        elif full:
            await order_service.release_stock(
                db, container, order, reason=MovementReason.REFUND, actor=actor
            )
    if full:
        await order_service.drop_promo_usage(db, order)
        await order_service.set_status(
            db, container, order, OrderStatus.REFUNDED, by_system=False, actor=actor, comment=reason
        )
    if full:
        order_service.email_customer(db, container, order, OrderStatus.REFUNDED, was_paid=True)
    elif order.email:
        base = container.settings.public_base_url.rstrip("/")
        subject, text, html = emails.order_refunded_email(order, amount, base)
        enqueue_email(
            db, to=order.email, subject=subject, text=text, html=html, event="order_refund"
        )
    await container.kicker.kick("deliver_outbox")
    await audit.record(
        db,
        actor,
        action="order.refund",
        entity="order",
        entity_id=order.id,
        summary=f"Возврат по заказу {order.display_number}: {format_rub(amount)}"
        + (" (полный)" if full else ""),
        diff={"refunded_kop": [before, order.refunded_kop]},
    )
    return order


def status_options() -> list[tuple[str, str]]:
    return [(s.value, STATUS_LABELS[s]) for s in OrderStatus]
