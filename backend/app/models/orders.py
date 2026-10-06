"""Заказы, позиции, история статусов, платежи и возвраты."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Sequence, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.customers import Customer

order_number_seq = Sequence("order_number_seq", start=10001)

ORDER_NUMBER_PREFIX = "NSB-"


class Order(IdMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_status_created", "status", "created_at"),)

    number: Mapped[int] = mapped_column(
        BigInteger, order_number_seq, server_default=order_number_seq.next_value(), unique=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    # снимок контактов на момент заказа
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str] = mapped_column(String(320))

    status: Mapped[str] = mapped_column(String(24))
    payment_method: Mapped[str] = mapped_column(String(16))

    items_total_kop: Mapped[int]
    product_discount_kop: Mapped[int] = mapped_column(default=0)
    order_discount_kop: Mapped[int] = mapped_column(default=0)
    order_discount_source: Mapped[str | None] = mapped_column(String(16))
    promo_code_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("promo_codes.id", ondelete="SET NULL")
    )
    promo_code_text: Mapped[str | None] = mapped_column(String(64))
    points_spent: Mapped[int] = mapped_column(default=0)
    points_to_earn: Mapped[int] = mapped_column(default=0)
    points_earned: Mapped[int] = mapped_column(default=0)
    delivery_kop: Mapped[int] = mapped_column(default=0)
    total_kop: Mapped[int]
    refunded_kop: Mapped[int] = mapped_column(default=0)
    discount_notes: Mapped[list[str]] = mapped_column(default=list)

    delivery_method: Mapped[str] = mapped_column(String(16))
    delivery_data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    tracking_number: Mapped[str | None] = mapped_column(String(64))

    customer_comment: Mapped[str | None] = mapped_column(Text)
    internal_comment: Mapped[str | None] = mapped_column(Text)

    stock_reserved: Mapped[bool] = mapped_column(default=False)
    reserved_until: Mapped[datetime | None]
    paid_at: Mapped[datetime | None]
    shipped_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]

    consent_offer_at: Mapped[datetime | None]
    consent_pd_at: Mapped[datetime | None]

    customer: Mapped[Customer | None] = relationship(lazy="joined")
    items: Mapped[list["OrderItem"]] = relationship(
        order_by="OrderItem.position", cascade="all, delete-orphan", lazy="selectin"
    )
    history: Mapped[list["OrderStatusChange"]] = relationship(
        order_by="OrderStatusChange.created_at", cascade="all, delete-orphan", lazy="selectin"
    )
    payments: Mapped[list["Payment"]] = relationship(
        order_by="Payment.created_at", cascade="all, delete-orphan", lazy="selectin"
    )
    refunds: Mapped[list["Refund"]] = relationship(
        order_by="Refund.created_at", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def display_number(self) -> str:
        return f"{ORDER_NUMBER_PREFIX}{self.number}"


class OrderItem(IdMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(default=0)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(200))
    product_type: Mapped[str] = mapped_column(String(8))
    variant_kind: Mapped[str] = mapped_column(String(8))
    grams: Mapped[int] = mapped_column(default=0)  # вес одной упаковки (чай)
    qty: Mapped[int] = mapped_column(default=1)
    variant_label: Mapped[str] = mapped_column(String(60))
    unit_price_kop: Mapped[int]  # цена одной упаковки / штуки
    line_total_kop: Mapped[int]
    product_discount_kop: Mapped[int] = mapped_column(default=0)
    order_discount_kop: Mapped[int] = mapped_column(default=0)
    points_kop: Mapped[int] = mapped_column(default=0)
    applied_promotion_id: Mapped[uuid.UUID | None] = mapped_column(index=True)  # акция или четверг
    applied_promotion_title: Mapped[str | None] = mapped_column(String(200))
    receipt_amount_kop: Mapped[int] = mapped_column(default=0)

    @property
    def stock_amount(self) -> int:
        """Сколько списать со склада: граммы × упаковки для чая, штуки для штучного."""
        return self.grams * self.qty if self.product_type == "tea" else self.qty


class OrderStatusChange(IdMixin, Base):
    __tablename__ = "order_status_changes"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24))
    actor_type: Mapped[str] = mapped_column(String(16))  # system | admin | customer
    actor_id: Mapped[uuid.UUID | None]
    actor_name: Mapped[str | None] = mapped_column(String(120))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Payment(IdMixin, Base):
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(16), default="tochka")
    payment_link_id: Mapped[str] = mapped_column(String(64), unique=True)
    operation_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    payment_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="created")
    amount_kop: Mapped[int]
    raw: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime | None]
    paid_at: Mapped[datetime | None]


class Refund(IdMixin, Base):
    __tablename__ = "refunds"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL")
    )
    amount_kop: Mapped[int]
    items: Mapped[list[dict[str, Any]]] = mapped_column(default=list)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    restocked: Mapped[bool] = mapped_column(default=False)
    reason: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
