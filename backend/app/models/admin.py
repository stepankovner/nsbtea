"""Сотрудники, их сессии, одноразовые коды, журнал действий."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin


class AdminRole(StrEnum):
    OWNER = "owner"
    STAFF = "staff"


class AdminPermission(StrEnum):
    """Разделы админки, которые можно выдать временному сотруднику."""

    ORDERS = "orders"
    PRODUCTS = "products"
    INVENTORY = "inventory"
    CUSTOMERS = "customers"
    PROMOTIONS = "promotions"
    CONTENT = "content"
    APPLICATIONS = "applications"
    # Только владелец: настройки, финансы (выручка, возвраты), доступы, журнал.


PERMISSION_LABELS: dict[AdminPermission, str] = {
    AdminPermission.ORDERS: "Заказы",
    AdminPermission.PRODUCTS: "Товары",
    AdminPermission.INVENTORY: "Склад",
    AdminPermission.CUSTOMERS: "Клиенты",
    AdminPermission.PROMOTIONS: "Акции и промокоды",
    AdminPermission.CONTENT: "Страницы, главная и события",
    AdminPermission.APPLICATIONS: "Заявки",
}

DEFAULT_STAFF_PERMISSIONS = [AdminPermission.ORDERS.value, AdminPermission.INVENTORY.value]


class AdminUser(IdMixin, TimestampMixin, Base):
    __tablename__ = "admin_users"

    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default=AdminRole.STAFF.value)
    permissions: Mapped[list[str]] = mapped_column(default=list)
    expires_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    invite_expires_at: Mapped[datetime | None]
    last_login_at: Mapped[datetime | None]
    failed_logins: Mapped[int] = mapped_column(default=0)

    @property
    def is_owner(self) -> bool:
        return self.role == AdminRole.OWNER.value

    def has_permission(self, permission: AdminPermission) -> bool:
        return self.is_owner or permission.value in self.permissions

    def is_active_at(self, now: datetime) -> bool:
        if self.revoked_at is not None:
            return False
        return self.expires_at is None or self.expires_at > now


class AdminSession(IdMixin, Base):
    __tablename__ = "admin_sessions"

    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    last_seen_at: Mapped[datetime | None]
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))

    admin_user: Mapped[AdminUser] = relationship(lazy="joined")


class ChallengePurpose(StrEnum):
    LOGIN_2FA = "login_2fa"
    PASSWORD_RESET = "password_reset"
    TELEGRAM_LINK = "telegram_link"


class AdminChallenge(IdMixin, Base):
    """Одноразовый код: вход по второму фактору, сброс пароля, привязка Telegram."""

    __tablename__ = "admin_challenges"

    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(32))
    code_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    attempts: Mapped[int] = mapped_column(default=0)
    consumed_at: Mapped[datetime | None]


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_entity", "entity", "entity_id"),)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), index=True
    )
    actor_name: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(64))
    entity: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(Text)
    diff: Mapped[dict[str, Any]] = mapped_column(default=dict)
    at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
