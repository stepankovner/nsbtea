"""Схемы контента: сайт, главная, страницы, события, заявки."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.schemas.catalog import MediaOut
from app.schemas.common import ApiModel
from app.schemas.storefront import ProductCard


class StorePublic(ApiModel):
    shop_name: str
    legal_name: str
    inn: str
    ogrnip: str
    legal_address: str
    phone: str
    email: str
    address: str
    telegram_url: str
    telegram_channel_url: str
    vk_url: str
    work_hours: str


class WelcomeOut(ApiModel):
    enabled: bool
    percent: int


class ThursdayPublic(ApiModel):
    percent: int
    mode: str
    active: bool
    ends_on_label: str | None


class DeliveryPublic(ApiModel):
    pickup_enabled: bool
    pickup_address: str
    courier_enabled: bool
    courier_price_kop: int
    courier_free_from_kop: int | None
    courier_note: str
    cdek_enabled: bool
    cdek_free_from_kop: int | None
    origin_city_code: int


class PageLink(ApiModel):
    slug: str
    title: str
    kind: str


class SiteOut(ApiModel):
    store: StorePublic
    metrika_id: str
    yandex_verification: str
    seo_home_title: str
    seo_home_description: str
    welcome: WelcomeOut
    thursday: ThursdayPublic
    delivery: DeliveryPublic
    allow_pay_on_delivery: bool
    pages: list[PageLink]
    telegram_bot_username: str | None
    yandex_maps_api_key: str | None


class EventOut(ApiModel):
    id: uuid.UUID
    slug: str
    type: str
    type_label: str
    title: str
    starts_at: datetime
    ends_at: datetime | None
    day: str
    month_label: str
    weekday: str
    time: str
    place: str | None
    duration_text: str | None
    price_kop: int | None
    price_label: str | None
    seats_total: int | None
    seats_left: int | None
    seats_label: str | None
    note: str | None
    cover: MediaOut | None
    short_description: str | None
    description: dict[str, Any] | None
    can_book: bool
    is_past: bool


class ThursdayBlockInfo(ApiModel):
    percent: int
    ends_on_label: str
    mode: str


class HomeBlockOut(ApiModel):
    kind: str
    data: dict[str, Any]
    images: dict[str, MediaOut] = Field(default_factory=dict)
    products: list[ProductCard] = Field(default_factory=list)
    events: list[EventOut] = Field(default_factory=list)
    thursday: ThursdayBlockInfo | None = None


class HomeOut(ApiModel):
    blocks: list[HomeBlockOut]


class PageOut(ApiModel):
    slug: str
    title: str
    kind: str
    content: dict[str, Any]
    excerpt: str | None
    cover: MediaOut | None
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime


class PageListItem(ApiModel):
    slug: str
    title: str
    kind: str
    excerpt: str | None
    cover: MediaOut | None


ApplicationKind = Literal["wholesale", "event", "private_ceremony"]


class ApplicationIn(ApiModel):
    type: ApplicationKind
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    telegram: str | None = Field(default=None, max_length=64)
    event_id: uuid.UUID | None = None
    guests: int = Field(default=1, ge=1, le=100)
    data: dict[str, str | int | None] = Field(default_factory=dict)
    consent: bool = False
    website: str = Field(default="", max_length=500)  # ловушка для ботов: людям поле не видно

    @field_validator("data")
    @classmethod
    def _limit(cls, value: dict[str, str | int | None]) -> dict[str, str | int | None]:
        if len(value) > 12:
            raise ValueError("Слишком много полей")
        cleaned: dict[str, str | int | None] = {}
        for key, item in value.items():
            if len(key) > 40:
                raise ValueError("Слишком длинное название поля")
            cleaned[key] = item.strip()[:2000] if isinstance(item, str) else item
        return cleaned


class ApplicationCreated(ApiModel):
    ok: bool = True
    message: str
