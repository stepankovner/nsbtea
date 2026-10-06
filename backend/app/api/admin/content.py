"""Админка: страницы, блоки главной, события, заявки (SPEC 10.8)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, status
from pydantic import Field, field_validator
from sqlalchemy import func, select

from app.api.admin.catalog import media_out
from app.api.deps import ApplicationsAccess, ContentAccess, Db, Deps
from app.domain.errors import DomainError, NotFoundError
from app.domain.richtext import validate_document
from app.domain.slugs import slugify
from app.models import Application, Event, HomeBlock, MediaFile, Page
from app.models.content import (
    APPLICATION_STATUS_LABELS,
    APPLICATION_TYPE_LABELS,
    EVENT_TYPE_LABELS,
    HOME_BLOCK_LABELS,
    ApplicationStatus,
    ApplicationType,
    EventType,
    HomeBlockKind,
)
from app.schemas.catalog import MediaOut
from app.schemas.common import ApiModel, Ok, Slug
from app.services import audit
from app.services.content_public import event_out, media_ids_in, seats_taken
from app.services.seed import LEGAL_SLUGS

router = APIRouter(prefix="/admin", tags=["admin: контент"])
EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}


async def _unique(
    db: Db, model: type[Page] | type[Event], base: str, exclude: uuid.UUID | None
) -> str:
    candidate, n = base, 2
    while True:
        query = select(model.id).where(model.slug == candidate)
        if exclude is not None:
            query = query.where(model.id != exclude)
        if await db.scalar(query) is None:
            return candidate
        candidate, n = f"{base}-{n}", n + 1


# ------------------------------------------------------------------ pages


class PageIn(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    slug: Slug | None = None
    kind: Literal["page", "guide", "legal"] = "page"
    content: dict[str, Any] = Field(default_factory=lambda: dict(EMPTY_DOC))
    excerpt: str | None = Field(default=None, max_length=600)
    cover_media_id: uuid.UUID | None = None
    is_published: bool = False
    sort_order: int = 0
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)

    @field_validator("content")
    @classmethod
    def _doc(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            return validate_document(value)
        except DomainError as exc:
            raise ValueError(exc.message) from exc


class PagePatch(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: Slug | None = None
    kind: Literal["page", "guide", "legal"] | None = None
    content: dict[str, Any] | None = None
    excerpt: str | None = Field(default=None, max_length=600)
    cover_media_id: uuid.UUID | None = None
    is_published: bool | None = None
    sort_order: int | None = None
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)

    @field_validator("content")
    @classmethod
    def _doc(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        try:
            return validate_document(value)
        except DomainError as exc:
            raise ValueError(exc.message) from exc


class PageAdminOut(ApiModel):
    id: uuid.UUID
    title: str
    slug: str
    kind: str
    content: dict[str, Any]
    excerpt: str | None
    cover: MediaOut | None
    is_published: bool
    sort_order: int
    seo_title: str | None
    seo_description: str | None
    required: bool
    updated_at: datetime
    site_url: str


def _page_out(container: Deps, page: Page) -> PageAdminOut:
    base = container.settings.public_base_url.rstrip("/")
    path = (
        f"/legal/{page.slug}"
        if page.kind == "legal"
        else (f"/guides/{page.slug}" if page.kind == "guide" else f"/pages/{page.slug}")
    )
    return PageAdminOut(
        id=page.id,
        title=page.title,
        slug=page.slug,
        kind=page.kind,
        content=page.content,
        excerpt=page.excerpt,
        cover=media_out(container, page.cover),
        is_published=page.is_published,
        sort_order=page.sort_order,
        seo_title=page.seo_title,
        seo_description=page.seo_description,
        required=page.slug in LEGAL_SLUGS,
        updated_at=page.updated_at,
        site_url=f"{base}{path}",
    )


@router.get("/pages", response_model=list[PageAdminOut], summary="Страницы")
async def list_pages(
    _: ContentAccess, db: Db, container: Deps, archived: bool = False
) -> list[PageAdminOut]:
    query = select(Page).order_by(Page.kind, Page.sort_order, Page.title)
    query = query.where(Page.archived_at.is_not(None) if archived else Page.archived_at.is_(None))
    return [_page_out(container, p) for p in (await db.scalars(query)).all()]


@router.get("/pages/{page_id}", response_model=PageAdminOut, summary="Страница")
async def get_page(page_id: uuid.UUID, _: ContentAccess, db: Db, container: Deps) -> PageAdminOut:
    page = await db.get(Page, page_id)
    if page is None:
        raise NotFoundError("Страница не найдена")
    return _page_out(container, page)


@router.post(
    "/pages", response_model=PageAdminOut, status_code=status.HTTP_201_CREATED, summary="Создать"
)
async def create_page(
    payload: PageIn, context: ContentAccess, db: Db, container: Deps
) -> PageAdminOut:
    data = payload.model_dump()
    data["slug"] = await _unique(db, Page, data.pop("slug") or slugify(payload.title), None)
    page = Page(**data)
    db.add(page)
    await db.flush()
    await db.refresh(page, ["cover"])
    await audit.record(
        db,
        context.user,
        action="page.create",
        entity="page",
        entity_id=page.id,
        summary=f"Создана страница «{page.title}»",
    )
    return _page_out(container, page)


@router.patch("/pages/{page_id}", response_model=PageAdminOut, summary="Изменить страницу")
async def update_page(
    page_id: uuid.UUID, payload: PagePatch, context: ContentAccess, db: Db, container: Deps
) -> PageAdminOut:
    page = await db.get(Page, page_id)
    if page is None:
        raise NotFoundError("Страница не найдена")
    data = payload.model_dump(exclude_unset=True)
    if data.get("slug") and data["slug"] != page.slug:
        clash = await db.scalar(
            select(Page.id).where(Page.slug == data["slug"], Page.id != page.id)
        )
        if clash:
            raise DomainError(f"Адрес «{data['slug']}» уже занят", field="slug")
    before = {"is_published": page.is_published, "title": page.title}
    for key, value in data.items():
        if value is not None or key in (
            "excerpt",
            "cover_media_id",
            "seo_title",
            "seo_description",
        ):
            setattr(page, key, value)
    await db.flush()
    await db.refresh(page, ["cover", "updated_at"])
    await audit.record(
        db,
        context.user,
        action="page.update",
        entity="page",
        entity_id=page.id,
        summary=f"Изменена страница «{page.title}»",
        diff=audit.diff_fields(before, {"is_published": page.is_published, "title": page.title}),
    )
    return _page_out(container, page)


@router.delete("/pages/{page_id}", response_model=Ok, summary="В архив")
async def archive_page(page_id: uuid.UUID, context: ContentAccess, db: Db, container: Deps) -> Ok:
    page = await db.get(Page, page_id)
    if page is None:
        raise NotFoundError("Страница не найдена")
    if page.slug in LEGAL_SLUGS:
        raise DomainError("Эта страница обязательна для работы магазина — её можно только изменить")
    page.archived_at = container.clock.now()
    page.is_published = False
    await audit.record(
        db,
        context.user,
        action="page.archive",
        entity="page",
        entity_id=page.id,
        summary=f"Страница «{page.title}» убрана в архив",
    )
    return Ok()


@router.post("/pages/{page_id}/restore", response_model=PageAdminOut, summary="Из архива")
async def restore_page(
    page_id: uuid.UUID, context: ContentAccess, db: Db, container: Deps
) -> PageAdminOut:
    page = await db.get(Page, page_id)
    if page is None:
        raise NotFoundError("Страница не найдена")
    page.archived_at = None
    return _page_out(container, page)


# ------------------------------------------------------------------ home blocks


class HomeBlockOut(ApiModel):
    kind: str
    label: str
    data: dict[str, Any]
    images: dict[str, MediaOut]
    sort_order: int
    is_visible: bool


class HomeBlockPatch(ApiModel):
    data: dict[str, Any] | None = None
    is_visible: bool | None = None


async def _block_out(db: Db, container: Deps, block: HomeBlock) -> HomeBlockOut:
    ids = media_ids_in(block.data)
    media = (await db.scalars(select(MediaFile).where(MediaFile.id.in_(ids)))).all() if ids else []
    images = {str(m.id): out for m in media if (out := media_out(container, m)) is not None}
    return HomeBlockOut(
        kind=block.kind,
        label=HOME_BLOCK_LABELS.get(HomeBlockKind(block.kind), block.kind),
        data=block.data,
        images=images,
        sort_order=block.sort_order,
        is_visible=block.is_visible,
    )


@router.get("/home-blocks", response_model=list[HomeBlockOut], summary="Блоки главной")
async def list_blocks(_: ContentAccess, db: Db, container: Deps) -> list[HomeBlockOut]:
    blocks = (await db.scalars(select(HomeBlock).order_by(HomeBlock.sort_order))).all()
    return [await _block_out(db, container, b) for b in blocks]


@router.patch("/home-blocks/{kind}", response_model=HomeBlockOut, summary="Изменить блок")
async def update_block(
    kind: HomeBlockKind, payload: HomeBlockPatch, context: ContentAccess, db: Db, container: Deps
) -> HomeBlockOut:
    block = await db.scalar(select(HomeBlock).where(HomeBlock.kind == kind.value))
    if block is None:
        block = HomeBlock(kind=kind.value, data={}, sort_order=100)
        db.add(block)
    if payload.data is not None:
        if len(str(payload.data)) > 50_000:
            raise DomainError("Слишком много текста в блоке")
        block.data = payload.data
    if payload.is_visible is not None:
        block.is_visible = payload.is_visible
    await db.flush()
    await audit.record(
        db,
        context.user,
        action="home.update",
        entity="home_block",
        entity_id=kind.value,
        summary=f"Изменён блок главной «{HOME_BLOCK_LABELS[kind]}»",
    )
    return await _block_out(db, container, block)


class ReorderIn(ApiModel):
    kinds: list[HomeBlockKind] = Field(min_length=1, max_length=20)


@router.post("/home-blocks/reorder", response_model=Ok, summary="Порядок блоков")
async def reorder_blocks(payload: ReorderIn, _: ContentAccess, db: Db) -> Ok:
    blocks = {b.kind: b for b in (await db.scalars(select(HomeBlock))).all()}
    for index, kind in enumerate(payload.kinds):
        if kind.value in blocks:
            blocks[kind.value].sort_order = index
    return Ok()


# ------------------------------------------------------------------ events


class EventIn(ApiModel):
    type: EventType = EventType.CEREMONY
    title: str = Field(min_length=1, max_length=200)
    slug: Slug | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    duration_text: str | None = Field(default=None, max_length=80)
    place: str | None = Field(default=None, max_length=200)
    price_kop: int | None = Field(default=None, ge=0)
    price_text: str | None = Field(default=None, max_length=120)
    seats_total: int | None = Field(default=None, ge=0, le=10_000)
    note: str | None = Field(default=None, max_length=120)
    cover_media_id: uuid.UUID | None = None
    short_description: str | None = Field(default=None, max_length=1000)
    description: dict[str, Any] | None = None
    is_published: bool = False

    @field_validator("description")
    @classmethod
    def _doc(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        try:
            return validate_document(value)
        except DomainError as exc:
            raise ValueError(exc.message) from exc


class EventPatch(ApiModel):
    type: EventType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: Slug | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    duration_text: str | None = Field(default=None, max_length=80)
    place: str | None = Field(default=None, max_length=200)
    price_kop: int | None = Field(default=None, ge=0)
    price_text: str | None = Field(default=None, max_length=120)
    seats_total: int | None = Field(default=None, ge=0, le=10_000)
    note: str | None = Field(default=None, max_length=120)
    cover_media_id: uuid.UUID | None = None
    short_description: str | None = Field(default=None, max_length=1000)
    description: dict[str, Any] | None = None
    is_published: bool | None = None

    @field_validator("description")
    @classmethod
    def _doc(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        try:
            return validate_document(value)
        except DomainError as exc:
            raise ValueError(exc.message) from exc


class EventAdminOut(ApiModel):
    id: uuid.UUID
    type: str
    type_label: str
    title: str
    slug: str
    starts_at: datetime
    ends_at: datetime | None
    duration_text: str | None
    place: str | None
    price_kop: int | None
    price_text: str | None
    seats_total: int | None
    seats_taken: int
    seats_left: int | None
    note: str | None
    cover: MediaOut | None
    short_description: str | None
    description: dict[str, Any] | None
    is_published: bool
    is_past: bool
    applications_count: int


async def _event_out(db: Db, container: Deps, event: Event) -> EventAdminOut:
    taken = (await seats_taken(db, [event.id])).get(event.id, 0)
    public = event_out(container, event, taken, container.clock.now())
    count = int(
        await db.scalar(
            select(func.count()).select_from(Application).where(Application.event_id == event.id)
        )
        or 0
    )
    return EventAdminOut(
        id=event.id,
        type=event.type,
        type_label=EVENT_TYPE_LABELS.get(EventType(event.type), event.type),
        title=event.title,
        slug=event.slug,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        duration_text=event.duration_text,
        place=event.place,
        price_kop=event.price_kop,
        price_text=event.price_text,
        seats_total=event.seats_total,
        seats_taken=taken,
        seats_left=public.seats_left,
        note=event.note,
        cover=media_out(container, event.cover),
        short_description=event.short_description,
        description=event.description,
        is_published=event.is_published,
        is_past=public.is_past,
        applications_count=count,
    )


@router.get("/events", response_model=list[EventAdminOut], summary="События")
async def list_events(
    _: ContentAccess, db: Db, container: Deps, period: str = "upcoming"
) -> list[EventAdminOut]:
    now = container.clock.now()
    query = select(Event).where(Event.archived_at.is_(None))
    if period == "past":
        query = query.where(Event.starts_at <= now).order_by(Event.starts_at.desc())
    else:
        query = query.where(Event.starts_at > now).order_by(Event.starts_at)
    return [await _event_out(db, container, e) for e in (await db.scalars(query)).all()]


@router.post(
    "/events", response_model=EventAdminOut, status_code=status.HTTP_201_CREATED, summary="Создать"
)
async def create_event(
    payload: EventIn, context: ContentAccess, db: Db, container: Deps
) -> EventAdminOut:
    data = payload.model_dump()
    data["type"] = payload.type.value
    data["slug"] = await _unique(db, Event, data.pop("slug") or slugify(payload.title), None)
    event = Event(**data)
    db.add(event)
    await db.flush()
    await db.refresh(event, ["cover"])
    await audit.record(
        db,
        context.user,
        action="event.create",
        entity="event",
        entity_id=event.id,
        summary=f"Создано событие «{event.title}»",
    )
    return await _event_out(db, container, event)


@router.get("/events/{event_id}", response_model=EventAdminOut, summary="Событие")
async def get_event(
    event_id: uuid.UUID, _: ContentAccess, db: Db, container: Deps
) -> EventAdminOut:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("Событие не найдено")
    return await _event_out(db, container, event)


@router.patch("/events/{event_id}", response_model=EventAdminOut, summary="Изменить событие")
async def update_event(
    event_id: uuid.UUID, payload: EventPatch, context: ContentAccess, db: Db, container: Deps
) -> EventAdminOut:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("Событие не найдено")
    data = payload.model_dump(exclude_unset=True)
    if "type" in data and data["type"] is not None:
        data["type"] = EventType(data["type"]).value
    if data.get("slug") and data["slug"] != event.slug:
        data["slug"] = await _unique(db, Event, data["slug"], event.id)
    for key, value in data.items():
        setattr(event, key, value)
    await db.flush()
    await db.refresh(event, ["cover", "updated_at"])
    await audit.record(
        db,
        context.user,
        action="event.update",
        entity="event",
        entity_id=event.id,
        summary=f"Изменено событие «{event.title}»",
    )
    return await _event_out(db, container, event)


@router.delete("/events/{event_id}", response_model=Ok, summary="В архив")
async def archive_event(event_id: uuid.UUID, context: ContentAccess, db: Db, container: Deps) -> Ok:
    event = await db.get(Event, event_id)
    if event is not None:
        event.archived_at = container.clock.now()
        event.is_published = False
    return Ok()


# ------------------------------------------------------------------ applications


class ApplicationOut(ApiModel):
    id: uuid.UUID
    type: str
    type_label: str
    status: str
    status_label: str
    name: str
    phone: str | None
    telegram: str | None
    guests: int
    data: dict[str, Any]
    event_id: uuid.UUID | None
    event_title: str | None
    admin_comment: str | None
    created_at: datetime


class ApplicationListOut(ApiModel):
    items: list[ApplicationOut]
    total: int
    counts: dict[str, int]


def _application_out(app: Application) -> ApplicationOut:
    return ApplicationOut(
        id=app.id,
        type=app.type,
        type_label=APPLICATION_TYPE_LABELS.get(ApplicationType(app.type), app.type),
        status=app.status,
        status_label=APPLICATION_STATUS_LABELS.get(ApplicationStatus(app.status), app.status),
        name=app.name,
        phone=app.phone,
        telegram=app.telegram,
        guests=app.guests,
        data=app.data,
        event_id=app.event_id,
        event_title=app.event.title if app.event else None,
        admin_comment=app.admin_comment,
        created_at=app.created_at,
    )


@router.get("/applications", response_model=ApplicationListOut, summary="Заявки")
async def list_applications(
    _: ApplicationsAccess,
    db: Db,
    type: str | None = None,
    status: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ApplicationListOut:
    base = select(Application)
    if type:
        base = base.where(Application.type == type)
    counts = {
        str(s): int(n)
        for s, n in (
            await db.execute(
                select(Application.status, func.count())
                .where(Application.type == type if type else Application.id.is_not(None))
                .group_by(Application.status)
            )
        ).all()
    }
    if status:
        base = base.where(Application.status == status)
    total = int(await db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    rows = (
        await db.scalars(
            base.order_by(Application.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()
    return ApplicationListOut(items=[_application_out(a) for a in rows], total=total, counts=counts)


@router.get("/applications/{application_id}", response_model=ApplicationOut, summary="Заявка")
async def get_application(
    application_id: uuid.UUID, _: ApplicationsAccess, db: Db
) -> ApplicationOut:
    app = await db.get(Application, application_id)
    if app is None:
        raise NotFoundError("Заявка не найдена")
    return _application_out(app)


class ApplicationPatch(ApiModel):
    status: ApplicationStatus | None = None
    admin_comment: str | None = Field(default=None, max_length=5000)


@router.patch("/applications/{application_id}", response_model=ApplicationOut, summary="Изменить")
async def update_application(
    application_id: uuid.UUID, payload: ApplicationPatch, context: ApplicationsAccess, db: Db
) -> ApplicationOut:
    app = await db.get(Application, application_id)
    if app is None:
        raise NotFoundError("Заявка не найдена")
    before = {"status": app.status}
    if payload.status is not None:
        app.status = payload.status.value
    if "admin_comment" in payload.model_fields_set:
        app.admin_comment = (payload.admin_comment or "").strip() or None
    await audit.record(
        db,
        context.user,
        action="application.update",
        entity="application",
        entity_id=app.id,
        summary=f"Заявка от {app.name}: {APPLICATION_STATUS_LABELS[ApplicationStatus(app.status)]}",
        diff=audit.diff_fields(before, {"status": app.status}),
    )
    return _application_out(app)
