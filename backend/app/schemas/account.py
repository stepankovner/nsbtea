import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel


class CustomerMeOut(ApiModel):
    id: uuid.UUID
    email: str | None
    name: str | None
    phone: str | None
    telegram_username: str | None
    telegram_linked: bool
    marketing_consent: bool
    points_balance: int
    points_pending: int


class ProfileIn(ApiModel):
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    marketing_consent: bool | None = None


class AccountOrderItem(ApiModel):
    product_id: uuid.UUID | None
    slug: str | None
    name: str
    variant_label: str
    qty: int
    total_kop: int


class AccountOrder(ApiModel):
    id: uuid.UUID
    number: str
    status: str
    status_label: str
    created_at: datetime
    total_kop: int
    delivery_label: str
    tracking_number: str | None
    tracking_url: str | None
    points_spent: int
    points_to_earn: int
    points_earned: int
    can_pay: bool
    items: list[AccountOrderItem]


class RepeatOut(ApiModel):
    added: list[str]
    unavailable: list[str]


class PointsHistoryItem(ApiModel):
    id: uuid.UUID
    delta: int
    kind: str
    kind_label: str
    comment: str | None
    order_number: str | None
    created_at: datetime
    balance_after: int


class WalletOut(ApiModel):
    balance: int
    pending: int
    history: list[PointsHistoryItem]


class AddressIn(ApiModel):
    kind: Literal["cdek_pvz", "cdek_door", "courier"]
    label: str = Field(min_length=1, max_length=300)
    data: dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False


class AddressOut(AddressIn):
    id: uuid.UUID


class DeleteAccountIn(ApiModel):
    confirm: bool = False
