"""Контент: страницы, блоки главной, события, заявки."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampMixin
from app.models.system import MediaFile


class PageKind(StrEnum):
    PAGE = "page"
    GUIDE = "guide"  # «Как заваривать»
    LEGAL = "legal"  # оферта, политика, согласие


# Обязательные документы: без них нельзя запускать продажи (ссылки из согласий при оформлении)
LEGAL_SLUGS = ("offer", "privacy", "consent")


class Page(IdMixin, TimestampMixin, Base):
    __tablename__ = "pages"

    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16), default=PageKind.PAGE.value)
    content: Mapped[dict[str, Any]] = mapped_column(default=dict)
    excerpt: Mapped[str | None] = mapped_column(Text)
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL")
    )
    is_published: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    seo_title: Mapped[str | None] = mapped_column(String(200))
    seo_description: Mapped[str | None] = mapped_column(String(400))
    archived_at: Mapped[datetime | None]

    cover: Mapped[MediaFile | None] = relationship(lazy="joined")


class HomeBlockKind(StrEnum):
    HERO = "hero"
    THURSDAY = "thursday"
    SERVICES = "services"
    FEATURED = "featured"
    NEW_PRODUCTS = "new_products"
    SETS = "sets"
    EVENTS = "events"
    ABOUT = "about"
    ADVANTAGES = "advantages"
    WHOLESALE = "wholesale"


HOME_BLOCK_LABELS: dict[HomeBlockKind, str] = {
    HomeBlockKind.HERO: "Главный баннер",
    HomeBlockKind.THURSDAY: "Чай недели",
    HomeBlockKind.SERVICES: "Не только чай (церемонии, сплавы, выезд)",
    HomeBlockKind.FEATURED: "Сейчас в наличии",
    HomeBlockKind.NEW_PRODUCTS: "Новинки",
    HomeBlockKind.SETS: "Наборы",
    HomeBlockKind.EVENTS: "Ближайшие события",
    HomeBlockKind.ABOUT: "О магазине и мастере",
    HomeBlockKind.ADVANTAGES: "Преимущества",
    HomeBlockKind.WHOLESALE: "Оптовые заказы",
}


class HomeBlock(IdMixin, TimestampMixin, Base):
    __tablename__ = "home_blocks"

    kind: Mapped[str] = mapped_column(String(24), unique=True)
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    sort_order: Mapped[int] = mapped_column(default=0)
    is_visible: Mapped[bool] = mapped_column(default=True)


class EventType(StrEnum):
    CEREMONY = "ceremony"
    RAFTING = "rafting"
    LECTURE = "lecture"
    OTHER = "other"


EVENT_TYPE_LABELS: dict[EventType, str] = {
    EventType.CEREMONY: "Церемония",
    EventType.RAFTING: "Сплав на сапах",
    EventType.LECTURE: "Лекция",
    EventType.OTHER: "Событие",
}


class Event(IdMixin, TimestampMixin, Base):
    __tablename__ = "events"

    type: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    starts_at: Mapped[datetime] = mapped_column(index=True)
    ends_at: Mapped[datetime | None]
    duration_text: Mapped[str | None] = mapped_column(String(80))
    place: Mapped[str | None] = mapped_column(String(200))
    price_kop: Mapped[int | None]
    price_text: Mapped[str | None] = mapped_column(String(120))
    seats_total: Mapped[int | None]
    note: Mapped[str | None] = mapped_column(String(120))  # «Закрытие сезона»
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL")
    )
    short_description: Mapped[str | None] = mapped_column(Text)
    description: Mapped[dict[str, Any] | None]
    is_published: Mapped[bool] = mapped_column(default=False)
    archived_at: Mapped[datetime | None]

    cover: Mapped[MediaFile | None] = relationship(lazy="joined")


class ApplicationType(StrEnum):
    WHOLESALE = "wholesale"
    EVENT = "event"
    PRIVATE_CEREMONY = "private_ceremony"


APPLICATION_TYPE_LABELS: dict[ApplicationType, str] = {
    ApplicationType.WHOLESALE: "Опт",
    ApplicationType.EVENT: "Запись на событие",
    ApplicationType.PRIVATE_CEREMONY: "Индивидуальная церемония",
}


class ApplicationStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    CLOSED = "closed"
    CANCELLED = "cancelled"


APPLICATION_STATUS_LABELS: dict[ApplicationStatus, str] = {
    ApplicationStatus.NEW: "Новая",
    ApplicationStatus.IN_PROGRESS: "В работе",
    ApplicationStatus.CLOSED: "Закрыта",
    ApplicationStatus.CANCELLED: "Отменена",
}


class Application(IdMixin, TimestampMixin, Base):
    __tablename__ = "applications"

    type: Mapped[str] = mapped_column(String(24), index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    telegram: Mapped[str | None] = mapped_column(String(64))
    guests: Mapped[int] = mapped_column(default=1)
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    status: Mapped[str] = mapped_column(String(16), default=ApplicationStatus.NEW.value, index=True)
    admin_comment: Mapped[str | None] = mapped_column(Text)
    consent_at: Mapped[datetime] = mapped_column(server_default=func.now())

    event: Mapped[Event | None] = relationship(lazy="joined")
