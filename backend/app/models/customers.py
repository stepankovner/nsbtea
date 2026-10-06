"""Покупатели, их сессии, коды входа, адреса, избранное, корзины."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.catalog import Product


class Customer(IdMixin, TimestampMixin, Base):
    __tablename__ = "customers"

    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    name: Mapped[str | None] = mapped_column(String(120))
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    marketing_consent: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[str | None] = mapped_column(Text)  # заметки владельца
    points_balance: Mapped[int] = mapped_column(default=0)  # кэш суммы журнала баллов
    first_paid_order_at: Mapped[datetime | None]
    last_login_at: Mapped[datetime | None]
    anonymized_at: Mapped[datetime | None]


class CustomerSession(IdMixin, Base):
    __tablename__ = "customer_sessions"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]

    customer: Mapped[Customer] = relationship(lazy="joined")


class LoginCode(IdMixin, Base):
    __tablename__ = "login_codes"

    email: Mapped[str] = mapped_column(CITEXT, index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    attempts: Mapped[int] = mapped_column(default=0)
    consumed_at: Mapped[datetime | None]


class CustomerAddress(IdMixin, TimestampMixin, Base):
    __tablename__ = "customer_addresses"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))  # метод доставки
    label: Mapped[str] = mapped_column(String(300))
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    is_default: Mapped[bool] = mapped_column(default=False)


class Favorite(Base):
    __tablename__ = "favorites"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    product: Mapped[Product] = relationship(lazy="joined")


class Cart(IdMixin, TimestampMixin, Base):
    __tablename__ = "carts"

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), unique=True
    )
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    promo_code: Mapped[str | None] = mapped_column(String(64))
    points_to_spend: Mapped[int] = mapped_column(default=0)

    items: Mapped[list["CartItem"]] = relationship(
        order_by="CartItem.created_at", cascade="all, delete-orphan", lazy="selectin"
    )


class CartItem(IdMixin, Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", "variant_kind", "grams"),
        CheckConstraint("qty > 0", name="qty_positive"),
    )

    cart_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    variant_kind: Mapped[str] = mapped_column(String(8))  # preset | cake | custom | unit
    grams: Mapped[int] = mapped_column(default=0)  # 0 для штучных
    qty: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    product: Mapped[Product] = relationship(lazy="joined")
