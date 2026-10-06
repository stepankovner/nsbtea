import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class SupplyLineIn(ApiModel):
    product_id: uuid.UUID
    qty: int = Field(gt=0, le=1_000_000)


class SupplyIn(ApiModel):
    comment: str | None = Field(default=None, max_length=1000)
    lines: list[SupplyLineIn] = Field(min_length=1, max_length=200)


class MovementLineOut(ApiModel):
    product_id: uuid.UUID
    product_name: str
    delta: int
    qty_label: str
    balance_after: int
    balance_label: str


class SupplyOut(ApiModel):
    id: uuid.UUID
    comment: str | None
    posted_at: datetime
    lines: list[MovementLineOut]


class SupplyListItem(ApiModel):
    id: uuid.UUID
    comment: str | None
    posted_at: datetime
    actor_name: str | None
    lines_count: int


class SupplyListOut(ApiModel):
    items: list[SupplyListItem]
    total: int


class CountLineIn(ApiModel):
    product_id: uuid.UUID
    actual: int = Field(ge=0, le=10_000_000)


class CountIn(ApiModel):
    comment: str | None = Field(default=None, max_length=1000)
    lines: list[CountLineIn] = Field(min_length=1, max_length=500)


class CountLineOut(ApiModel):
    product_id: uuid.UUID
    product_name: str
    before: int
    actual: int
    delta: int
    delta_label: str


class CountOut(ApiModel):
    changed: int
    lines: list[CountLineOut]


class WriteoffIn(ApiModel):
    reason: Literal["defect", "tasting", "personal", "other"]
    comment: str | None = Field(default=None, max_length=1000)
    lines: list[SupplyLineIn] = Field(min_length=1, max_length=200)


class WriteoffOut(ApiModel):
    lines: list[MovementLineOut]


class StockRowOut(ApiModel):
    product_id: uuid.UUID
    name: str
    type: str
    status: str
    stock: int
    stock_label: str
    threshold: int
    threshold_label: str
    level: str
    level_label: str
    last_supply_at: datetime | None
    image_url: str | None


class StockListOut(ApiModel):
    items: list[StockRowOut]


class MovementOut(ApiModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    reason: str
    reason_label: str
    delta: int
    delta_label: str
    balance_after: int
    balance_label: str
    comment: str | None
    order_id: uuid.UUID | None
    order_number: str | None
    supply_id: uuid.UUID | None
    actor_name: str | None
    created_at: datetime


class MovementListOut(ApiModel):
    items: list[MovementOut]
    total: int
