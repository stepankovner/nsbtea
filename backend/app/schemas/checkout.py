"""Схемы корзины, доставки и оформления заказа."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

DeliveryMethodLiteral = Literal["cdek_pvz", "cdek_door", "courier", "pickup"]


class CartItemIn(ApiModel):
    product_id: uuid.UUID
    kind: Literal["preset", "cake", "custom", "unit"] = "preset"
    grams: int = Field(default=0, ge=0, le=100_000)
    qty: int = Field(default=1, ge=1, le=99)


class CartItemPatch(ApiModel):
    qty: int | None = Field(default=None, ge=1, le=99)
    kind: Literal["preset", "cake", "custom", "unit"] | None = None
    grams: int | None = Field(default=None, ge=0, le=100_000)


class PromoCodeIn(ApiModel):
    code: str = Field(min_length=1, max_length=64)


class PointsIn(ApiModel):
    points: int | None = Field(default=None, ge=0, le=10_000_000)
    max: bool = False


class CartLineOut(ApiModel):
    id: uuid.UUID
    product_id: uuid.UUID
    slug: str
    name: str
    type: str
    image_url: str | None
    hanzi: str | None
    tile_color: str
    variant_kind: str
    grams: int
    qty: int
    variant_label: str
    unit_price_kop: int
    line_total_kop: int
    product_discount_kop: int
    order_discount_kop: int  # доля скидки на заказ (промокод/приветственная) — для справки
    total_kop: int  # цена строки после товарной скидки; скидка на заказ — в итогах корзины
    promotion_label: str | None
    problem: str | None
    max_qty: int


class PromoStateOut(ApiModel):
    code: str
    applied: bool
    message: str | None


class WelcomeStateOut(ApiModel):
    percent: int
    applied: bool
    tentative: bool


class PointsStateOut(ApiModel):
    enabled: bool
    balance: int
    max_spend: int
    requested: int
    applied: int


class CartOut(ApiModel):
    lines: list[CartLineOut]
    count: int
    items_total_kop: int
    product_discount_kop: int
    order_discount_kop: int
    order_discount_label: str | None
    items_after_discounts_kop: int
    promo_code: PromoStateOut | None
    welcome: WelcomeStateOut | None
    points: PointsStateOut
    points_to_earn: int
    total_without_delivery_kop: int
    notes: list[str]
    problems: list[str]
    weight_grams: int


class DeliveryIn(ApiModel):
    method: DeliveryMethodLiteral
    city_code: int | None = Field(default=None, ge=0)
    city_name: str | None = Field(default=None, max_length=200)
    pvz_code: str | None = Field(default=None, max_length=40)
    pvz_address: str | None = Field(default=None, max_length=400)
    address: str | None = Field(default=None, max_length=400)
    postal_code: str | None = Field(default=None, max_length=12)
    courier_time: str | None = Field(default=None, max_length=120)


class QuoteIn(ApiModel):
    delivery: DeliveryIn


class QuoteOut(ApiModel):
    method: str
    price_kop: int
    free: bool
    period: str | None


class CheckoutIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=1, max_length=320)
    delivery: DeliveryIn
    comment: str | None = Field(default=None, max_length=2000)
    consent_offer: bool = False
    consent_pd: bool = False
    marketing_consent: bool = False
    payment_method: Literal["online", "on_delivery"] = "online"
    expected_total_kop: int | None = Field(default=None, ge=0)


class CheckoutOut(ApiModel):
    order_id: uuid.UUID
    number: str
    status: str
    payment_url: str | None
    total_kop: int


class OrderItemPublic(ApiModel):
    name: str
    variant_label: str
    qty: int
    total_kop: int


class OrderStatusOut(ApiModel):
    order_id: uuid.UUID
    number: str
    status: str
    status_label: str
    paid: bool
    can_retry: bool
    reserved_until: datetime | None
    total_kop: int
    delivery_kop: int
    delivery_label: str
    points_to_earn: int
    items: list[OrderItemPublic]


class RetryOut(ApiModel):
    payment_url: str
