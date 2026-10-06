"""Лояльность и акции: журнал баллов, акции, «чай недели», промокоды."""

import datetime as dt
import uuid
from datetime import datetime

from sqlalchemy import Column, ForeignKey, String, Table, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.catalog import Category, Product


class PointsTransaction(IdMixin, Base):
    """Журнал баллов. Баланс клиента = сумма delta; кэш обновляется в той же транзакции."""

    __tablename__ = "points_transactions"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    delta: Mapped[int]
    kind: Mapped[str] = mapped_column(String(16))
    balance_after: Mapped[int]
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    comment: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


promotion_products = Table(
    "promotion_products",
    Base.metadata,
    Column("promotion_id", ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
)
promotion_categories = Table(
    "promotion_categories",
    Base.metadata,
    Column("promotion_id", ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Promotion(IdMixin, TimestampMixin, Base):
    """Акция: скидка % или ₽ на выбранные товары или категории, с датами."""

    __tablename__ = "promotions"

    kind: Mapped[str] = mapped_column(String(16), default="sale")
    title: Mapped[str] = mapped_column(String(200))
    percent: Mapped[int | None]
    amount_kop: Mapped[int | None]
    starts_at: Mapped[datetime | None]
    ends_at: Mapped[datetime | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    archived_at: Mapped[datetime | None]

    products: Mapped[list[Product]] = relationship(secondary=promotion_products, lazy="selectin")
    categories: Mapped[list[Category]] = relationship(
        secondary=promotion_categories, lazy="selectin"
    )


thursday_plan_products = Table(
    "thursday_plan_products",
    Base.metadata,
    Column("plan_id", ForeignKey("thursday_plans.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
)


class ThursdayPlan(IdMixin, TimestampMixin, Base):
    __tablename__ = "thursday_plans"

    date: Mapped[dt.date] = mapped_column(unique=True)
    percent: Mapped[int | None]  # None — общий процент из настроек
    note: Mapped[str | None] = mapped_column(Text)

    products: Mapped[list[Product]] = relationship(
        secondary=thursday_plan_products, lazy="selectin"
    )


promo_code_products = Table(
    "promo_code_products",
    Base.metadata,
    Column("promo_code_id", ForeignKey("promo_codes.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
)
promo_code_categories = Table(
    "promo_code_categories",
    Base.metadata,
    Column("promo_code_id", ForeignKey("promo_codes.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class PromoCode(IdMixin, TimestampMixin, Base):
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(CITEXT, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    percent: Mapped[int | None]
    amount_kop: Mapped[int | None]
    min_order_kop: Mapped[int] = mapped_column(default=0)
    max_uses: Mapped[int | None]
    max_uses_per_customer: Mapped[int | None]
    first_order_only: Mapped[bool] = mapped_column(default=False)
    applies_to_discounted: Mapped[bool] = mapped_column(default=False)
    starts_at: Mapped[datetime | None]
    ends_at: Mapped[datetime | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    archived_at: Mapped[datetime | None]

    products: Mapped[list[Product]] = relationship(secondary=promo_code_products, lazy="selectin")
    categories: Mapped[list[Category]] = relationship(
        secondary=promo_code_categories, lazy="selectin"
    )


class PromoCodeUsage(IdMixin, Base):
    __tablename__ = "promo_code_usages"
    __table_args__ = (UniqueConstraint("order_id"),)

    promo_code_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("promo_codes.id", ondelete="CASCADE"), index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    email: Mapped[str] = mapped_column(CITEXT)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    discount_kop: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
