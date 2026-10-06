import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.admin import AdminUser
from app.schemas.common import ApiModel, Email, Name


class AdminUserOut(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    permissions: list[str]
    telegram_linked: bool
    expires_at: datetime | None
    is_owner: bool

    @classmethod
    def of(cls, user: AdminUser) -> "AdminUserOut":
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role,
            permissions=user.permissions,
            telegram_linked=user.telegram_chat_id is not None,
            expires_at=user.expires_at,
            is_owner=user.is_owner,
        )


class LoginIn(ApiModel):
    email: Email
    password: str = Field(min_length=1, max_length=200)


class LoginOut(ApiModel):
    status: Literal["ok", "two_factor_required"]
    user: AdminUserOut | None = None
    csrf_token: str | None = None
    challenge_id: uuid.UUID | None = None


class TwoFactorIn(ApiModel):
    challenge_id: uuid.UUID
    code: str = Field(min_length=4, max_length=12)


class MeOut(ApiModel):
    user: AdminUserOut
    csrf_token: str


class ForgotPasswordIn(ApiModel):
    email: Email


class ResetPasswordIn(ApiModel):
    email: Email
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=1, max_length=200)


class ChangePasswordIn(ApiModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class InviteInfoOut(ApiModel):
    name: str
    email: str


class AcceptInviteIn(ApiModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class TelegramLinkOut(ApiModel):
    code: str
    deep_link: str
    expires_at: datetime


class StaffCreateIn(ApiModel):
    name: Name
    email: Email
    permissions: list[str]
    expires_at: datetime | None = None


class StaffUpdateIn(ApiModel):
    permissions: list[str] | None = None
    expires_at: datetime | None = None
    restore: bool = False


class StaffOut(AdminUserOut):
    revoked_at: datetime | None
    invite_pending: bool
    last_login_at: datetime | None

    @classmethod
    def of(cls, user: AdminUser) -> "StaffOut":
        base = AdminUserOut.of(user).model_dump()
        return cls(
            **base,
            revoked_at=user.revoked_at,
            invite_pending=user.password_hash is None,
            last_login_at=user.last_login_at,
        )


class StaffCreatedOut(ApiModel):
    staff: StaffOut
    invite_url: str


class PermissionOption(ApiModel):
    value: str
    label: str


class StaffListOut(ApiModel):
    items: list[StaffOut]
    permissions: list[PermissionOption]
