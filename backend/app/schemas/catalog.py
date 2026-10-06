"""Схемы каталога для админки."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.catalog_labels import BrewMethod, TeaEffect, TeaShape
from app.models.catalog import TileColor
from app.schemas.common import ApiModel, Slug


class MediaOut(ApiModel):
    id: uuid.UUID
    url: str
    srcset: dict[str, str]
    width: int
    height: int


class CategoryIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Slug | None = None
    parent_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=5000)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)
    is_visible: bool = True
    tile_color: TileColor = TileColor.NEUTRAL
    cover_media_id: uuid.UUID | None = None


class CategoryPatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: Slug | None = None
    parent_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=5000)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)
    is_visible: bool | None = None
    tile_color: TileColor | None = None
    cover_media_id: uuid.UUID | None = None


class CategoryOut(ApiModel):
    id: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None
    sort_order: int
    description: str | None
    seo_title: str | None
    seo_description: str | None
    is_visible: bool
    tile_color: str
    cover: MediaOut | None
    products_count: int
    archived_at: datetime | None
    children: list["CategoryOut"] = Field(default_factory=list)


class IdsIn(ApiModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class ProductCreateIn(ApiModel):
    type: Literal["tea", "unit"]
    name: str = Field(min_length=1, max_length=200)
    category_id: uuid.UUID | None = None


class PriceIn(ApiModel):
    amount_kop: int = Field(gt=0, le=100_000_000)
    per_grams: Literal[1, 50, 100] = 50


class BrewingMethodIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: BrewMethod
    vessel: str | None = Field(default=None, max_length=80)
    grams: float | None = Field(default=None, gt=0, le=100)
    volume_ml: int | None = Field(default=None, ge=10, le=5000)
    temp_c: int | None = Field(default=None, ge=1, le=100)
    first_steep_sec: int | None = Field(default=None, ge=0, le=24 * 3600)
    next_steep_sec: int | None = Field(default=None, ge=0, le=24 * 3600)
    steeps: int | None = Field(default=None, ge=1, le=50)
    note: str | None = Field(default=None, max_length=300)


class BrewingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    methods: list[BrewingMethodIn] = Field(default_factory=list, max_length=5)
    master_note: str | None = Field(default=None, max_length=3000)


class AttributesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tea_type: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    factory: str | None = Field(default=None, max_length=120)
    harvest_year: int | None = Field(default=None, ge=1900, le=2100)
    pressing_year: int | None = Field(default=None, ge=1900, le=2100)
    fermentation: str | None = Field(default=None, max_length=80)
    shape: TeaShape | None = None
    effect: TeaEffect | None = None


class ProductPatchIn(ApiModel):
    """Частичное обновление товара: передаются только изменившиеся поля."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: Slug | None = None
    category_id: uuid.UUID | None = None
    short_description: str | None = Field(default=None, max_length=600)
    description: dict[str, Any] | None = None
    hanzi: str | None = Field(default=None, max_length=8)
    pinyin: str | None = Field(default=None, max_length=80)
    price: PriceIn | None = None
    unit_price_kop: int | None = Field(default=None, gt=0, le=100_000_000)
    weight_presets: list[int] | None = Field(default=None, max_length=10)
    cake_weight_grams: int | None = Field(default=None, gt=0, le=10_000)
    cake_price_kop: int | None = Field(default=None, gt=0, le=100_000_000)
    custom_weight_enabled: bool | None = None
    custom_weight_min: int | None = Field(default=None, ge=1, le=10_000)
    custom_weight_step: int | None = Field(default=None, ge=1, le=1_000)
    weight_grams: int | None = Field(default=None, ge=0, le=100_000)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=100_000)
    attributes: AttributesIn | None = None
    brewing: BrewingIn | None = None
    flavor_tags: list[str] | None = Field(default=None, max_length=20)
    search_aliases: list[str] | None = Field(default=None, max_length=30)
    show_from: datetime | None = None
    show_until: datetime | None = None
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)
    sort_order: int | None = None

    @field_validator("flavor_tags", "search_aliases")
    @classmethod
    def _clean_list(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        seen: dict[str, str] = {}
        for raw in value:
            item = " ".join(raw.split())[:60]
            if item and item.lower() not in seen:
                seen[item.lower()] = item
        return list(seen.values())


class TagOut(ApiModel):
    id: uuid.UUID
    name: str
    slug: str


class ProductImageOut(ApiModel):
    id: uuid.UUID
    media_id: uuid.UUID
    url: str
    srcset: dict[str, str]
    alt: str | None
    width: int
    height: int


class ProductBrief(ApiModel):
    id: uuid.UUID
    name: str
    type: str
    status: str
    image_url: str | None


class WeightOptionOut(ApiModel):
    kind: str
    grams: int
    label: str
    price_kop: int
    available: bool


class CategoryRef(ApiModel):
    id: uuid.UUID
    name: str


class ProductOut(ApiModel):
    id: uuid.UUID
    type: str
    name: str
    slug: str
    status: str
    status_label: str
    category: CategoryRef | None
    short_description: str | None
    description: dict[str, Any] | None
    hanzi: str | None
    pinyin: str | None
    price_per_gram_kop: int | None
    price_input_base: int
    price_per_100g_kop: int | None
    unit_price_kop: int | None
    stock: int
    stock_label: str
    low_stock_threshold: int | None
    effective_threshold: int
    weight_presets: list[int]
    cake_weight_grams: int | None
    cake_price_kop: int | None
    custom_weight_enabled: bool
    custom_weight_min: int
    custom_weight_step: int
    weight_grams: int | None
    attributes: dict[str, Any]
    brewing: dict[str, Any]
    flavor_tags: list[TagOut]
    search_aliases: list[str]
    images: list[ProductImageOut]
    relations: dict[str, list[ProductBrief]]
    weight_options: list[WeightOptionOut]
    publish_problems: list[str]
    is_new_until: datetime | None
    show_from: datetime | None
    show_until: datetime | None
    seo_title: str | None
    seo_description: str | None
    sort_order: int
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    site_url: str


class ProductListItem(ApiModel):
    id: uuid.UUID
    name: str
    type: str
    status: str
    status_label: str
    category_name: str | None
    price_label: str
    price_per_gram_kop: int | None
    unit_price_kop: int | None
    stock: int
    stock_label: str
    stock_level: str
    image_url: str | None
    archived_at: datetime | None
    updated_at: datetime


class ProductListOut(ApiModel):
    items: list[ProductListItem]
    total: int
    page: int
    per_page: int


class RelationsIn(ApiModel):
    product_ids: list[uuid.UUID] = Field(max_length=20)


class AltIn(ApiModel):
    alt: str | None = Field(default=None, max_length=300)
