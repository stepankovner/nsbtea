"""Публичный контент: настройки сайта, главная, страницы, события, заявки."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.contacts import normalize_phone, normalize_telegram
from app.domain.errors import DomainError, NotFoundError
from app.domain.money import format_rub
from app.domain.texts import day_month, plural, weekday_short
from app.domain.thursday import MSK
from app.models import Application, Category, Event, HomeBlock, MediaFile, Page, Product
from app.models.content import (
    APPLICATION_TYPE_LABELS,
    EVENT_TYPE_LABELS,
    ApplicationStatus,
    ApplicationType,
    EventType,
    HomeBlockKind,
    PageKind,
)
from app.models.system import NotificationEvent
from app.schemas.catalog import MediaOut
from app.schemas.content import (
    ApplicationIn,
    DeliveryPublic,
    EventOut,
    HomeBlockOut,
    HomeOut,
    PageLink,
    PageListItem,
    PageOut,
    SiteOut,
    StorePublic,
    ThursdayBlockInfo,
    ThursdayPublic,
    WelcomeOut,
)
from app.services.media import media_urls
from app.services.notifications import admin_link, h, notify_owner
from app.services.pricing import load_context
from app.services.settings import get_all
from app.services.settings_schema import (
    DeliverySettings,
    LoyaltySettings,
    PaymentSettings,
    SeoSettings,
    StoreSettings,
    ThursdaySettings,
)
from app.services.storefront import card_context, make_card, visible_condition

APPLICATION_LIMIT = 5
APPLICATION_WINDOW = 600

DATA_LABELS = {
    "organization": "Организация",
    "city": "Город",
    "volume": "Объём",
    "email": "Почта",
    "date": "Желаемая дата",
    "occasion": "Повод",
    "place": "Где",
    "guests": "Гостей",
    "comment": "Комментарий",
}


def media_out(container: Container, media: MediaFile | None) -> MediaOut | None:
    if media is None:
        return None
    urls = media_urls(container, media)
    return MediaOut(
        id=media.id,
        url=urls["original"],
        srcset={k: v for k, v in urls.items() if k != "original"},
        width=media.width,
        height=media.height,
    )


# ------------------------------------------------------------------ site


async def site_info(db: AsyncSession, container: Container) -> SiteOut:
    groups = await get_all(db)
    store = groups["store"]
    seo = groups["seo"]
    loyalty = groups["loyalty"]
    thursday = groups["thursday"]
    delivery = groups["delivery"]
    payment = groups["payment"]
    assert isinstance(store, StoreSettings)
    assert isinstance(seo, SeoSettings)
    assert isinstance(loyalty, LoyaltySettings)
    assert isinstance(thursday, ThursdaySettings)
    assert isinstance(delivery, DeliverySettings)
    assert isinstance(payment, PaymentSettings)
    promo = await load_context(db, container.clock.now())
    pages = (
        await db.scalars(
            select(Page)
            .where(Page.is_published.is_(True), Page.archived_at.is_(None))
            .order_by(Page.sort_order, Page.title)
        )
    ).all()
    return SiteOut(
        store=StorePublic.model_validate(store.model_dump()),
        metrika_id=seo.metrika_id,
        yandex_verification=seo.yandex_verification,
        seo_home_title=seo.home_title,
        seo_home_description=seo.home_description,
        welcome=WelcomeOut(enabled=loyalty.welcome_enabled, percent=loyalty.welcome_percent),
        thursday=ThursdayPublic(
            percent=promo.thursday.percent if promo.thursday else thursday.percent,
            mode=thursday.mode.value,
            active=promo.thursday is not None,
            ends_on_label=day_month(promo.thursday.ends_on) if promo.thursday else None,
        ),
        delivery=DeliveryPublic(
            pickup_enabled=delivery.pickup_enabled,
            pickup_address=delivery.pickup_address,
            courier_enabled=delivery.courier_enabled,
            courier_price_kop=delivery.courier_price_kop,
            courier_free_from_kop=delivery.courier_free_from_kop,
            courier_note=delivery.courier_note,
            cdek_enabled=delivery.cdek_enabled,
            cdek_free_from_kop=delivery.cdek_free_from_kop,
            origin_city_code=delivery.origin_city_code,
        ),
        allow_pay_on_delivery=payment.allow_pay_on_delivery,
        pages=[PageLink(slug=p.slug, title=p.title, kind=p.kind) for p in pages],
        telegram_bot_username=container.settings.telegram_bot_username,
    )


# ------------------------------------------------------------------ events


async def seats_taken(db: AsyncSession, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not event_ids:
        return {}
    rows = await db.execute(
        select(Application.event_id, func.coalesce(func.sum(Application.guests), 0))
        .where(
            Application.event_id.in_(event_ids),
            Application.status != ApplicationStatus.CANCELLED.value,
        )
        .group_by(Application.event_id)
    )
    return {eid: int(n) for eid, n in rows.all() if eid is not None}


def event_out(container: Container, event: Event, taken: int, now: datetime) -> EventOut:
    local = event.starts_at.astimezone(MSK)
    seats_left = None if event.seats_total is None else max(0, event.seats_total - taken)
    if seats_left is None:
        seats_label = None
    elif seats_left == 0:
        seats_label = "Мест нет"
    else:
        seats_label = f"Осталось {seats_left} {plural(seats_left, 'место', 'места', 'мест')}"
    is_past = event.starts_at <= now
    try:
        type_label = EVENT_TYPE_LABELS[EventType(event.type)]
    except ValueError:
        type_label = "Событие"
    return EventOut(
        id=event.id,
        slug=event.slug,
        type=event.type,
        type_label=type_label,
        title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        day=str(local.day),
        month_label=day_month(local.date()).split(" ", 1)[1],
        weekday=weekday_short(local.date()),
        time=local.strftime("%H:%M"),
        place=event.place,
        duration_text=event.duration_text,
        price_kop=event.price_kop,
        price_label=event.price_text or (format_rub(event.price_kop) if event.price_kop else None),
        seats_total=event.seats_total,
        seats_left=seats_left,
        seats_label=seats_label,
        note=event.note,
        cover=media_out(container, event.cover),
        short_description=event.short_description,
        description=event.description,
        can_book=not is_past and (seats_left is None or seats_left > 0),
        is_past=is_past,
    )


async def list_events(
    db: AsyncSession,
    container: Container,
    *,
    type_: str | None = None,
    past: bool = False,
    limit: int | None = None,
) -> list[EventOut]:
    now = container.clock.now()
    query = select(Event).where(Event.is_published.is_(True), Event.archived_at.is_(None))
    if past:
        query = query.where(Event.starts_at <= now).order_by(Event.starts_at.desc())
    else:
        query = query.where(Event.starts_at > now).order_by(Event.starts_at)
    if type_:
        query = query.where(Event.type == type_)
    if limit:
        query = query.limit(limit)
    events = (await db.scalars(query)).all()
    taken = await seats_taken(db, [e.id for e in events])
    return [event_out(container, e, taken.get(e.id, 0), now) for e in events]


async def get_event(db: AsyncSession, container: Container, slug: str) -> EventOut:
    event = await db.scalar(
        select(Event).where(
            Event.slug == slug, Event.is_published.is_(True), Event.archived_at.is_(None)
        )
    )
    if event is None:
        raise NotFoundError("Событие не найдено")
    taken = await seats_taken(db, [event.id])
    return event_out(container, event, taken.get(event.id, 0), container.clock.now())


# ------------------------------------------------------------------ pages


def page_out(container: Container, page: Page) -> PageOut:
    return PageOut(
        slug=page.slug,
        title=page.title,
        kind=page.kind,
        content=page.content,
        excerpt=page.excerpt,
        cover=media_out(container, page.cover),
        seo_title=page.seo_title,
        seo_description=page.seo_description,
        updated_at=page.updated_at,
    )


async def get_page(db: AsyncSession, container: Container, slug: str) -> PageOut:
    page = await db.scalar(
        select(Page).where(
            Page.slug == slug, Page.is_published.is_(True), Page.archived_at.is_(None)
        )
    )
    if page is None:
        raise NotFoundError("Страница не найдена")
    return page_out(container, page)


async def list_pages(
    db: AsyncSession, container: Container, kind: PageKind | None
) -> list[PageListItem]:
    query = (
        select(Page)
        .where(Page.is_published.is_(True), Page.archived_at.is_(None))
        .order_by(Page.sort_order, Page.title)
    )
    if kind is not None:
        query = query.where(Page.kind == kind.value)
    return [
        PageListItem(
            slug=p.slug,
            title=p.title,
            kind=p.kind,
            excerpt=p.excerpt,
            cover=media_out(container, p.cover),
        )
        for p in (await db.scalars(query)).all()
    ]


# ------------------------------------------------------------------ home


def _media_ids(data: Any) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    if isinstance(data, dict):
        for key, value in data.items():
            if key.endswith("media_id") and value:
                try:
                    found.add(uuid.UUID(str(value)))
                except ValueError:
                    continue
            else:
                found |= _media_ids(value)
    elif isinstance(data, list):
        for item in data:
            found |= _media_ids(item)
    return found


async def home(db: AsyncSession, container: Container) -> HomeOut:
    """Видимые блоки главной с подставленными данными. Пустые блоки (нет товаров/событий)
    тоже отдаются — витрина сама решает, скрыть ли их."""
    now = container.clock.now()
    blocks = (
        await db.scalars(
            select(HomeBlock).where(HomeBlock.is_visible.is_(True)).order_by(HomeBlock.sort_order)
        )
    ).all()
    ctx = await card_context(db, container)
    media_ids: set[uuid.UUID] = set()
    for block in blocks:
        media_ids |= _media_ids(block.data)
    media = {
        m.id: m
        for m in (
            (await db.scalars(select(MediaFile).where(MediaFile.id.in_(media_ids)))).all()
            if media_ids
            else []
        )
    }

    async def products_where(*conditions: Any, limit: int, order: Any) -> list[Product]:
        return list(
            (
                await db.scalars(
                    select(Product)
                    .where(*visible_condition(now), *conditions)
                    .order_by(*order)
                    .limit(limit)
                )
            ).all()
        )

    result: list[HomeBlockOut] = []
    for block in blocks:
        data = block.data
        images = {
            str(mid): image
            for mid in _media_ids(data)
            if (image := media_out(container, media.get(mid))) is not None
        }
        out = HomeBlockOut(kind=block.kind, data=data, images=images)
        limit = int(data.get("limit") or 4)
        if block.kind == HomeBlockKind.THURSDAY.value:
            thursday = ctx.promo.thursday
            if thursday is not None and thursday.product_ids:
                products = await products_where(
                    Product.id.in_(thursday.product_ids), limit=6, order=[Product.name]
                )
                out.products = [make_card(ctx, p) for p in products]
                out.thursday = ThursdayBlockInfo(
                    percent=thursday.percent,
                    ends_on_label=day_month(thursday.ends_on),
                    mode=thursday.mode.value,
                )
        elif block.kind == HomeBlockKind.FEATURED.value:
            ids = [uuid.UUID(str(i)) for i in data.get("product_ids") or []]
            if ids:
                chosen = await products_where(
                    Product.id.in_(ids), limit=limit, order=[Product.name]
                )
                chosen.sort(key=lambda p: ids.index(p.id))
            else:
                chosen = await products_where(
                    Product.stock > 0,
                    limit=limit,
                    order=[Product.sort_order, Product.created_at.desc()],
                )
            out.products = [make_card(ctx, p) for p in chosen]
        elif block.kind == HomeBlockKind.NEW_PRODUCTS.value:
            fresh = await products_where(
                Product.is_new_until > now, limit=limit, order=[Product.created_at.desc()]
            )
            out.products = [make_card(ctx, p) for p in fresh]
        elif block.kind == HomeBlockKind.SETS.value:
            category = await db.scalar(
                select(Category).where(Category.slug == (data.get("category_slug") or "nabory"))
            )
            if category is not None:
                sets = await products_where(
                    Product.category_id == category.id,
                    limit=limit,
                    order=[(Product.stock > 0).desc(), Product.sort_order],
                )
                out.products = [make_card(ctx, p) for p in sets]
        elif block.kind == HomeBlockKind.EVENTS.value:
            out.events = await list_events(db, container, limit=limit)
        result.append(out)
    return HomeOut(blocks=result)


# ------------------------------------------------------------------ applications


async def create_application(
    db: AsyncSession, container: Container, payload: ApplicationIn, *, ip: str | None
) -> str:
    await container.rate_limiter.hit(
        f"application:{ip}", limit=APPLICATION_LIMIT, window_seconds=APPLICATION_WINDOW
    )
    thanks = "Спасибо! Заявка у нас — скоро свяжемся."
    if payload.website.strip():
        return thanks  # бот заполнил скрытое поле — делаем вид, что всё хорошо
    if not payload.consent:
        raise DomainError(
            "Нужно согласие на обработку персональных данных — отметьте галочку",
            field="consent",
        )
    phone = normalize_phone(payload.phone) if payload.phone and payload.phone.strip() else None
    telegram = (
        normalize_telegram(payload.telegram)
        if payload.telegram and payload.telegram.strip()
        else None
    )
    if not phone and not telegram:
        raise DomainError("Укажите телефон или ник в Telegram", field="phone")

    event: Event | None = None
    if payload.type == ApplicationType.EVENT.value:
        if payload.event_id is None:
            raise DomainError("Выберите событие", field="event_id")
        event = await db.scalar(
            select(Event).where(Event.id == payload.event_id).with_for_update(of=Event)
        )
        if event is None or not event.is_published or event.archived_at is not None:
            raise NotFoundError("Событие не найдено")
        if event.starts_at <= container.clock.now():
            raise DomainError("Это событие уже прошло — выберите другую дату")
        if event.seats_total is not None:
            left = event.seats_total - (await seats_taken(db, [event.id])).get(event.id, 0)
            if left <= 0:
                raise DomainError(
                    "Мест больше нет — напишите нам в Telegram, добавим в лист ожидания"
                )
            if payload.guests > left:
                raise DomainError(f"Осталось мест: {left}", field="guests")

    application = Application(
        type=payload.type,
        event_id=event.id if event else None,
        name=payload.name.strip(),
        phone=phone,
        telegram=telegram,
        guests=payload.guests,
        data={k: v for k, v in payload.data.items() if v not in (None, "")},
        consent_at=container.clock.now(),
    )
    db.add(application)
    await db.flush()

    lines = [f"📝 <b>Новая заявка: {APPLICATION_TYPE_LABELS[ApplicationType(payload.type)]}</b>"]
    if event is not None:
        local = event.starts_at.astimezone(MSK)
        lines.append(f"Событие: {h(event.title)}, {day_month(local.date())} {local:%H:%M}")
        lines.append(f"Гостей: {payload.guests}")
    lines.append(f"Имя: {h(application.name)}")
    if phone:
        lines.append(f"Телефон: {phone}")
    if telegram:
        lines.append(f"Telegram: @{telegram}")
    for key, value in application.data.items():
        lines.append(f"{DATA_LABELS.get(key, key)}: {h(value)}")
    lines.append(admin_link(container, f"/applications/{application.id}"))
    await notify_owner(db, container, NotificationEvent.NEW_APPLICATION, "\n".join(lines))
    return thanks
