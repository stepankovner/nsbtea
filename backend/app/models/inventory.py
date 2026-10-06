"""Склад: поставки, движения остатков, память об отправленных уведомлениях."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin
from app.models.catalog import Product


class Supply(IdMixin, Base):
    __tablename__ = "supplies"

    comment: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    posted_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)


class InventoryMovement(IdMixin, Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (Index("ix_inventory_movements_product_at", "product_id", "created_at"),)

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    delta: Mapped[int]
    reason: Mapped[str] = mapped_column(String(16))
    balance_after: Mapped[int]
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    supply_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("supplies.id", ondelete="SET NULL"), index=True
    )
    comment: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    product: Mapped[Product] = relationship(lazy="joined")


class StockAlertState(Base):
    __tablename__ = "stock_alert_state"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    low_notified_at: Mapped[datetime | None]
    out_notified_at: Mapped[datetime | None]
