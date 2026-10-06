"""Настройки, уведомления (outbox), вебхуки, файлы, редиректы старых адресов."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(default=dict)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class NotificationEvent(StrEnum):
    NEW_ORDER = "new_order"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"
    NEW_APPLICATION = "new_application"
    ORDER_ATTENTION = "order_attention"
    THURSDAY_REMINDER = "thursday_reminder"
    WEEKLY_SUMMARY = "weekly_summary"


NOTIFICATION_EVENT_LABELS: dict[NotificationEvent, str] = {
    NotificationEvent.NEW_ORDER: "Новый оплаченный заказ",
    NotificationEvent.LOW_STOCK: "Остаток ниже порога",
    NotificationEvent.OUT_OF_STOCK: "Товар закончился",
    NotificationEvent.NEW_APPLICATION: "Новая заявка",
    NotificationEvent.ORDER_ATTENTION: "Заказ требует внимания",
    NotificationEvent.THURSDAY_REMINDER: "Не запланирован четверг",
    NotificationEvent.WEEKLY_SUMMARY: "Сводка за неделю",
}


class NotificationRecipient(IdMixin, TimestampMixin, Base):
    __tablename__ = "notification_recipients"

    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    name: Mapped[str] = mapped_column(String(120))
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    events: Mapped[list[str]] = mapped_column(default=list)
    is_active: Mapped[bool] = mapped_column(default=True)


class OutboxChannel(StrEnum):
    TELEGRAM = "telegram"
    EMAIL = "email"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class OutboxMessage(IdMixin, Base):
    """Исходящее сообщение. Пишется в той же транзакции, что и событие, — ничего не теряется
    и не уходит лишнего при откате; доставляет воркер с повторами."""

    __tablename__ = "outbox"
    __table_args__ = (Index("ix_outbox_pending", "status", "next_attempt_at"),)

    channel: Mapped[str] = mapped_column(String(16))
    event: Mapped[str] = mapped_column(String(48))
    recipient: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    html: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default=OutboxStatus.PENDING.value)
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    next_attempt_at: Mapped[datetime | None]  # пусто — отправить сразу; иначе — время повтора
    sent_at: Mapped[datetime | None]


class WebhookEvent(IdMixin, Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("provider", "external_id"),)

    provider: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(128))
    payload: Mapped[dict[str, Any]] = mapped_column(default=dict)
    received_at: Mapped[datetime] = mapped_column(server_default=func.now())
    processed_at: Mapped[datetime | None]
    error: Mapped[str | None] = mapped_column(Text)


class MediaFile(IdMixin, Base):
    """Загруженная картинка: оригинал и WebP-варианты нескольких размеров."""

    __tablename__ = "media"

    storage_key: Mapped[str] = mapped_column(String(300))
    variants: Mapped[dict[str, Any]] = mapped_column(default=dict)  # {"640": "key.webp", ...}
    width: Mapped[int]
    height: Mapped[int]
    size_bytes: Mapped[int]
    original_name: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SlugRedirect(IdMixin, Base):
    """Старый адрес → сущность. Для 301-редиректа после смены ЧПУ."""

    __tablename__ = "slug_redirects"
    __table_args__ = (UniqueConstraint("entity", "old_slug"),)

    entity: Mapped[str] = mapped_column(String(32))
    old_slug: Mapped[str] = mapped_column(String(120))
    entity_id: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
