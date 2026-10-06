"""Каталог: категории, товары, фото, теги, связи."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.system import MediaFile


class TileColor(StrEnum):
    """Цвет плитки товара по виду чая (дизайн-токены)."""

    PUER = "puer"
    OOLONG = "oolong"
    RED = "red"
    WHITE = "white"
    GREEN = "green"
    YELLOW = "yellow"
    NEUTRAL = "neutral"


class Category(IdMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    sort_order: Mapped[int] = mapped_column(default=0)
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL")
    )
    description: Mapped[str | None] = mapped_column(Text)
    seo_title: Mapped[str | None] = mapped_column(String(200))
    seo_description: Mapped[str | None] = mapped_column(String(400))
    is_visible: Mapped[bool] = mapped_column(default=True)
    tile_color: Mapped[str] = mapped_column(String(16), default=TileColor.NEUTRAL.value)
    archived_at: Mapped[datetime | None]

    cover: Mapped[MediaFile | None] = relationship(lazy="joined")


class ProductStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    HIDDEN = "hidden"


PRODUCT_STATUS_LABELS: dict[ProductStatus, str] = {
    ProductStatus.DRAFT: "Черновик",
    ProductStatus.PUBLISHED: "На сайте",
    ProductStatus.HIDDEN: "Скрыт",
}


class TagKind(StrEnum):
    FLAVOR = "flavor"


product_tags = Table(
    "product_tags",
    Base.metadata,
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(IdMixin, Base):
    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(String(60))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    kind: Mapped[str] = mapped_column(String(16), default=TagKind.FLAVOR.value)


class Product(IdMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("stock >= 0", name="stock_not_negative"),
        Index(
            "ix_products_search_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_search_fts",
            text("to_tsvector('russian', search_text)"),
            postgresql_using="gin",
        ),
    )

    type: Mapped[str] = mapped_column(String(8))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default=ProductStatus.DRAFT.value, index=True)
    archived_at: Mapped[datetime | None]

    short_description: Mapped[str | None] = mapped_column(Text)
    description: Mapped[dict[str, Any] | None]  # документ редактора (TipTap JSON)
    hanzi: Mapped[str | None] = mapped_column(String(16))  # иероглифы для плитки
    pinyin: Mapped[str | None] = mapped_column(String(80))

    # Цена: чай — копейки за грамм; штучный — копейки за штуку
    price_per_gram_kop: Mapped[int | None]
    price_input_base: Mapped[int] = mapped_column(default=50)  # как удобнее вводить: 1/50/100 г
    unit_price_kop: Mapped[int | None]

    # Остаток: чай — граммы, штучный — штуки (см. DECISIONS.md: одна колонка вместо двух)
    stock: Mapped[int] = mapped_column(default=0)
    low_stock_threshold: Mapped[int | None]

    weight_presets: Mapped[list[int]] = mapped_column(default=list)
    cake_weight_grams: Mapped[int | None]
    cake_price_kop: Mapped[int | None]
    custom_weight_enabled: Mapped[bool] = mapped_column(default=False)
    custom_weight_min: Mapped[int] = mapped_column(default=10)
    custom_weight_step: Mapped[int] = mapped_column(default=5)
    weight_grams: Mapped[int | None]  # вес штучного товара — для расчёта посылки

    attributes: Mapped[dict[str, Any]] = mapped_column(default=dict)
    brewing: Mapped[dict[str, Any]] = mapped_column(default=dict)
    search_aliases: Mapped[list[str]] = mapped_column(default=list)
    search_text: Mapped[str] = mapped_column(Text, default="")

    is_new_until: Mapped[datetime | None]
    show_from: Mapped[datetime | None]  # праздничные наборы: даты показа на витрине
    show_until: Mapped[datetime | None]
    sort_order: Mapped[int] = mapped_column(default=0)
    seo_title: Mapped[str | None] = mapped_column(String(200))
    seo_description: Mapped[str | None] = mapped_column(String(400))

    category: Mapped[Category | None] = relationship(lazy="joined")
    images: Mapped[list["ProductImage"]] = relationship(
        order_by="ProductImage.sort_order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tags: Mapped[list[Tag]] = relationship(secondary=product_tags, lazy="selectin")


class ProductImage(IdMixin, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.id", ondelete="CASCADE"))
    alt: Mapped[str | None] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(default=0)

    media: Mapped[MediaFile] = relationship(lazy="joined")


class RelationKind(StrEnum):
    SIMILAR_PINNED = "similar_pinned"
    GOES_WITH = "goes_with"
    SET_CONTAINS = "set_contains"


class ProductRelation(Base):
    __tablename__ = "product_relations"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    related_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(24), primary_key=True)
    sort_order: Mapped[int] = mapped_column(default=0)

    related: Mapped[Product] = relationship(foreign_keys=[related_id], lazy="joined")
