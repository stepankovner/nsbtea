"""Схемы публичного API витрины."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.catalog import MediaOut
from app.schemas.common import ApiModel


class Badge(ApiModel):
    kind: str  # thursday | sale | new | low | out
    label: str


class VariantRef(ApiModel):
    kind: str
    grams: int


class BrewingSummary(ApiModel):
    temp: str
    grams: str
    steeps: str
    steeps_label: str


class ProductCard(ApiModel):
    id: uuid.UUID
    slug: str
    name: str
    type: str
    hanzi: str | None
    pinyin: str | None
    tile_color: str
    image: MediaOut | None
    meta: str
    short_description: str | None
    price_kop: int
    old_price_kop: int | None
    price_grams: int | None
    price_per_gram_kop: int | None
    in_stock: bool
    badges: list[Badge]
    default_variant: VariantRef | None
    brewing_summary: BrewingSummary | None


class FacetOption(ApiModel):
    value: str
    label: str
    count: int


class TagFacet(ApiModel):
    slug: str
    name: str
    count: int


class PriceRange(ApiModel):
    min_kop: int
    max_kop: int


class Facets(ApiModel):
    tags: list[TagFacet]
    regions: list[FacetOption]
    shapes: list[FacetOption]
    effects: list[FacetOption]
    price_per_100g: PriceRange | None


class CatalogPage(ApiModel):
    items: list[ProductCard]
    total: int
    page: int
    per_page: int
    facets: Facets
    category: "PublicCategory | None" = None


class PublicCategory(ApiModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    seo_title: str | None
    seo_description: str | None
    tile_color: str
    cover: MediaOut | None
    products_count: int
    children: list["PublicCategory"] = Field(default_factory=list)


class WeightOptionPublic(ApiModel):
    kind: str
    grams: int
    label: str
    price_kop: int
    old_price_kop: int | None
    available: bool


class CustomWeight(ApiModel):
    enabled: bool
    min: int
    step: int
    max: int


class AttributeItem(ApiModel):
    key: str
    label: str
    value: str


class BrewingMethodOut(ApiModel):
    method: str
    method_label: str
    vessel: str | None = None
    grams: float | None = None
    volume_ml: int | None = None
    temp_c: int | None = None
    first_steep_sec: int | None = None
    next_steep_sec: int | None = None
    steeps: int | None = None
    note: str | None = None


class BrewingOut(ApiModel):
    methods: list[BrewingMethodOut]
    master_note: str | None


class Crumb(ApiModel):
    name: str
    href: str


class Seo(ApiModel):
    title: str
    description: str
    canonical: str
    og_image: str | None


class GalleryImage(ApiModel):
    url: str
    srcset: dict[str, str]
    alt: str
    width: int
    height: int


class ProductPage(ProductCard):
    description: dict[str, Any] | None
    images: list[GalleryImage]
    attributes: list[AttributeItem]
    flavor_tags: list[TagFacet]
    brewing: BrewingOut | None
    weight_options: list[WeightOptionPublic]
    custom_weight: CustomWeight | None
    max_qty: int
    low_stock: bool
    upcoming_thursday: str | None
    promotion_title: str | None
    category: PublicCategory | None
    breadcrumbs: list[Crumb]
    similar: list[ProductCard]
    goes_with: list[ProductCard]
    set_contains: list[ProductCard]
    seo: Seo
    updated_at: datetime


class SuggestItem(ApiModel):
    slug: str
    name: str
    image_url: str | None
    price_kop: int


CatalogPage.model_rebuild()
