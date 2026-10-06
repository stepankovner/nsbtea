"""Админка: заказы."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import Field

from app.api.deps import Db, Deps, OrdersAccess
from app.domain.errors import NotFoundError, PermissionDeniedError
from app.domain.orders import (
    DELIVERY_LABELS,
    STATUS_LABELS,
    DeliveryMethod,
    OrderStatus,
    next_steps,
)
from app.models import Order
from app.schemas.common import ApiModel
from app.services import admin_orders as svc
from app.services import orders as order_service
from app.services.emails import tracking_url

router = APIRouter(prefix="/admin/orders", tags=["admin: заказы"])


class OrderListItem(ApiModel):
    id: uuid.UUID
    number: str
    status: str
    status_label: str
    created_at: datetime
    name: str
    phone: str
    total_kop: int
    refunded_kop: int
    delivery_method: str
    delivery_label: str
    payment_method: str
    items_summary: str
    needs_action: bool


class StatusCount(ApiModel):
    value: str
    label: str


class OrderListOut(ApiModel):
    items: list[OrderListItem]
    total: int
    page: int
    per_page: int
    counts: dict[str, int]
    statuses: list[StatusCount]


class OrderItemOut(ApiModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    name: str
    product_type: str
    variant_label: str
    grams: int
    qty: int
    unit_price_kop: int
    line_total_kop: int
    product_discount_kop: int
    order_discount_kop: int
    points_kop: int
    receipt_amount_kop: int
    promotion: str | None


class HistoryOut(ApiModel):
    from_status: str | None
    to_status: str
    to_label: str
    actor_name: str | None
    actor_type: str
    comment: str | None
    created_at: datetime


class PaymentOut(ApiModel):
    id: uuid.UUID
    status: str
    amount_kop: int
    created_at: datetime
    paid_at: datetime | None
    payment_link_id: str


class RefundOut(ApiModel):
    id: uuid.UUID
    amount_kop: int
    status: str
    reason: str | None
    items: list[dict[str, Any]]
    created_at: datetime


class CustomerBrief(ApiModel):
    id: uuid.UUID
    name: str | None
    email: str | None
    phone: str | None
    orders_count: int
    points_balance: int


class StepOut(ApiModel):
    to: str
    label: str
    needs_tracking: bool


class AdminOrderOut(ApiModel):
    id: uuid.UUID
    number: str
    status: str
    status_label: str
    created_at: datetime
    paid_at: datetime | None
    reserved_until: datetime | None
    name: str
    phone: str
    email: str
    customer: CustomerBrief | None
    payment_method: str
    items: list[OrderItemOut]
    items_total_kop: int
    product_discount_kop: int
    order_discount_kop: int
    order_discount_source: str | None
    promo_code: str | None
    points_spent: int
    points_to_earn: int
    points_earned: int
    delivery_method: str
    delivery_label: str
    delivery_summary: str
    delivery_data: dict[str, Any]
    delivery_kop: int
    total_kop: int
    refunded_kop: int
    refundable_kop: int
    tracking_number: str | None
    tracking_url: str | None
    customer_comment: str | None
    internal_comment: str | None
    discount_notes: list[str]
    history: list[HistoryOut]
    payments: list[PaymentOut]
    refunds: list[RefundOut]
    next_steps: list[StepOut]
    can_cancel: bool
    can_refund: bool


def _delivery_label(order: Order) -> str:
    try:
        return DELIVERY_LABELS[DeliveryMethod(order.delivery_method)]
    except ValueError:
        return order.delivery_method


def _items_summary(order: Order) -> str:
    return ", ".join(
        order_service.item_line(i.product_name, i.variant_label, i.qty, i.product_type)
        for i in order.items
    )


async def order_out(db: Db, order: Order) -> AdminOrderOut:
    await db.flush()
    customer, orders_count = await svc.customer_summary(db, order)
    status = OrderStatus(order.status)
    try:
        method = DeliveryMethod(order.delivery_method)
        steps = next_steps(status, method)
    except ValueError:
        steps = []
    return AdminOrderOut(
        id=order.id,
        number=order.display_number,
        status=order.status,
        status_label=svc.label(order),
        created_at=order.created_at,
        paid_at=order.paid_at,
        reserved_until=order.reserved_until,
        name=order.name,
        phone=order.phone,
        email=order.email,
        customer=CustomerBrief(
            id=customer.id,
            name=customer.name,
            email=customer.email,
            phone=customer.phone,
            orders_count=orders_count,
            points_balance=customer.points_balance,
        )
        if customer
        else None,
        payment_method=order.payment_method,
        items=[
            OrderItemOut(
                id=i.id,
                product_id=i.product_id,
                name=i.product_name,
                product_type=i.product_type,
                variant_label=i.variant_label,
                grams=i.grams,
                qty=i.qty,
                unit_price_kop=i.unit_price_kop,
                line_total_kop=i.line_total_kop,
                product_discount_kop=i.product_discount_kop,
                order_discount_kop=i.order_discount_kop,
                points_kop=i.points_kop,
                receipt_amount_kop=i.receipt_amount_kop,
                promotion=i.applied_promotion_title,
            )
            for i in order.items
        ],
        items_total_kop=order.items_total_kop,
        product_discount_kop=order.product_discount_kop,
        order_discount_kop=order.order_discount_kop,
        order_discount_source=order.order_discount_source,
        promo_code=order.promo_code_text,
        points_spent=order.points_spent,
        points_to_earn=order.points_to_earn,
        points_earned=order.points_earned,
        delivery_method=order.delivery_method,
        delivery_label=_delivery_label(order),
        delivery_summary=order_service.delivery_summary(order),
        delivery_data=order.delivery_data,
        delivery_kop=order.delivery_kop,
        total_kop=order.total_kop,
        refunded_kop=order.refunded_kop,
        refundable_kop=svc.refundable_kop(order),
        tracking_number=order.tracking_number,
        tracking_url=tracking_url(order),
        customer_comment=order.customer_comment,
        internal_comment=order.internal_comment,
        discount_notes=order.discount_notes,
        history=[
            HistoryOut(
                from_status=h.from_status,
                to_status=h.to_status,
                to_label=STATUS_LABELS[OrderStatus(h.to_status)],
                actor_name=h.actor_name,
                actor_type=h.actor_type,
                comment=h.comment,
                created_at=h.created_at,
            )
            for h in order.history
        ],
        payments=[
            PaymentOut(
                id=p.id,
                status=p.status,
                amount_kop=p.amount_kop,
                created_at=p.created_at,
                paid_at=p.paid_at,
                payment_link_id=p.payment_link_id,
            )
            for p in order.payments
        ],
        refunds=[
            RefundOut(
                id=r.id,
                amount_kop=r.amount_kop,
                status=r.status,
                reason=r.reason,
                items=r.items,
                created_at=r.created_at,
            )
            for r in order.refunds
        ],
        next_steps=[
            StepOut(to=s.to.value, label=s.label, needs_tracking=s.needs_tracking) for s in steps
        ],
        can_cancel=status
        not in (
            OrderStatus.SHIPPED,
            OrderStatus.COMPLETED,
            OrderStatus.CANCELLED,
            OrderStatus.REFUNDED,
        ),
        can_refund=svc.refundable_kop(order) > 0 and status in svc.REFUNDABLE,
    )


@router.get("", response_model=OrderListOut, summary="Список заказов")
async def list_orders(
    _: OrdersAccess,
    db: Db,
    status: str | None = None,
    delivery: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 30,
) -> OrderListOut:
    orders, total, counts = await svc.list_orders(
        db,
        svc.OrderFilters(
            status=status, delivery=delivery, date_from=date_from, date_to=date_to, q=q
        ),
        page=page,
        per_page=per_page,
    )
    return OrderListOut(
        items=[
            OrderListItem(
                id=o.id,
                number=o.display_number,
                status=o.status,
                status_label=svc.label(o),
                created_at=o.created_at,
                name=o.name,
                phone=o.phone,
                total_kop=o.total_kop,
                refunded_kop=o.refunded_kop,
                delivery_method=o.delivery_method,
                delivery_label=_delivery_label(o),
                payment_method=o.payment_method,
                items_summary=_items_summary(o),
                needs_action=svc.needs_action(o),
            )
            for o in orders
        ],
        total=total,
        page=page,
        per_page=per_page,
        counts=counts,
        statuses=[StatusCount(value=v, label=label) for v, label in svc.status_options()],
    )


@router.get("/{order_id}", response_model=AdminOrderOut, summary="Карточка заказа")
async def get_order(order_id: uuid.UUID, _: OrdersAccess, db: Db) -> AdminOrderOut:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Заказ не найден")
    return await order_out(db, order)


class StatusIn(ApiModel):
    to: OrderStatus
    tracking_number: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=1000)


@router.post("/{order_id}/status", response_model=AdminOrderOut, summary="Следующий шаг")
async def change_status(
    order_id: uuid.UUID, payload: StatusIn, context: OrdersAccess, db: Db, container: Deps
) -> AdminOrderOut:
    order = await svc.change_status(
        db,
        container,
        context.user,
        order_id,
        to=payload.to,
        tracking_number=payload.tracking_number,
        comment=payload.comment,
    )
    return await order_out(db, order)


class OrderPatch(ApiModel):
    internal_comment: str | None = Field(default=None, max_length=5000)
    tracking_number: str | None = Field(default=None, max_length=64)


@router.patch("/{order_id}", response_model=AdminOrderOut, summary="Комментарий и трек-номер")
async def update_order(
    order_id: uuid.UUID, payload: OrderPatch, context: OrdersAccess, db: Db
) -> AdminOrderOut:
    order = await svc.update_order(
        db,
        context.user,
        order_id,
        internal_comment=payload.internal_comment,
        tracking_number=payload.tracking_number,
        fields=payload.model_fields_set,
    )
    return await order_out(db, order)


class CancelIn(ApiModel):
    restock: bool = True
    reason: str | None = Field(default=None, max_length=1000)


@router.post("/{order_id}/cancel", response_model=AdminOrderOut, summary="Отменить заказ")
async def cancel_order(
    order_id: uuid.UUID, payload: CancelIn, context: OrdersAccess, db: Db, container: Deps
) -> AdminOrderOut:
    order = await svc.cancel_order(
        db, container, context.user, order_id, restock=payload.restock, reason=payload.reason
    )
    return await order_out(db, order)


class RefundLineIn(ApiModel):
    order_item_id: uuid.UUID
    qty: int | None = Field(default=None, ge=1)


class RefundIn(ApiModel):
    amount_kop: int | None = Field(default=None, gt=0)
    items: list[RefundLineIn] = Field(default_factory=list, max_length=100)
    restock: bool = True
    reason: str | None = Field(default=None, max_length=1000)


@router.post("/{order_id}/refund", response_model=AdminOrderOut, summary="Возврат денег")
async def refund_order(
    order_id: uuid.UUID, payload: RefundIn, context: OrdersAccess, db: Db, container: Deps
) -> AdminOrderOut:
    if not context.user.is_owner:
        raise PermissionDeniedError("Возвраты денег доступны только владельцу")
    order = await svc.refund_order(
        db,
        container,
        context.user,
        order_id,
        amount_kop=payload.amount_kop,
        lines=[svc.RefundLine(i.order_item_id, i.qty) for i in payload.items],
        restock=payload.restock,
        reason=payload.reason,
    )
    return await order_out(db, order)
