"""Админка: клиенты, акции, промокоды, «чай недели»."""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import Field
from sqlalchemy import select

from app.api.admin.catalog import brief
from app.api.deps import CustomersAccess, Db, Deps, Owner, PromotionsAccess
from app.domain.errors import NotFoundError
from app.domain.loyalty import POINTS_KIND_LABELS, PointsKind
from app.domain.texts import day_month
from app.domain.thursday import thursday_window
from app.models import Customer, Order, PointsTransaction, PromoCode, Promotion, ThursdayPlan
from app.schemas.catalog import ProductBrief
from app.schemas.common import ApiModel, Ok
from app.services import audit
from app.services import marketing_admin as svc
from app.services import orders as order_service
from app.services.promo_codes import availability_error
from app.services.settings import get_group
from app.services.settings_schema import ThursdaySettings

router = APIRouter(prefix="/admin", tags=["admin: клиенты и акции"])


# ------------------------------------------------------------------ customers


class CustomerRow(ApiModel):
    id: uuid.UUID
    name: str | None
    email: str | None
    phone: str | None
    telegram_username: str | None
    orders_count: int
    total_spent_kop: int
    points_balance: int
    last_order_at: datetime | None
    created_at: datetime


class CustomerListOut(ApiModel):
    items: list[CustomerRow]
    total: int


class CustomerOrderRow(ApiModel):
    id: uuid.UUID
    number: str
    status: str
    status_label: str
    total_kop: int
    created_at: datetime


class PointsRow(ApiModel):
    id: uuid.UUID
    delta: int
    kind_label: str
    comment: str | None
    balance_after: int
    created_at: datetime


class CustomerCard(CustomerRow):
    notes: str | None
    marketing_consent: bool
    average_check_kop: int
    orders: list[CustomerOrderRow]
    points_history: list[PointsRow]


def _row(customer: Customer, stats: svc.CustomerStats | None) -> CustomerRow:
    return CustomerRow(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        telegram_username=customer.telegram_username,
        orders_count=stats.orders_count if stats else 0,
        total_spent_kop=stats.total_spent_kop if stats else 0,
        points_balance=customer.points_balance,
        last_order_at=stats.last_order_at if stats else None,
        created_at=customer.created_at,
    )


@router.get("/customers", response_model=CustomerListOut, summary="Клиенты")
async def list_customers(
    _: CustomersAccess,
    db: Db,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 30,
) -> CustomerListOut:
    customers, total, stats = await svc.list_customers(db, q=q, page=page, per_page=per_page)
    return CustomerListOut(items=[_row(c, stats.get(c.id)) for c in customers], total=total)


async def _card(db: Db, customer_id: uuid.UUID) -> CustomerCard:
    customer = await svc.get_customer(db, customer_id)
    stats = (await svc.customer_stats(db, [customer.id])).get(customer.id)
    orders = (
        await db.scalars(
            select(Order)
            .where(Order.customer_id == customer.id)
            .order_by(Order.created_at.desc())
            .limit(100)
        )
    ).all()
    history = (
        await db.scalars(
            select(PointsTransaction)
            .where(PointsTransaction.customer_id == customer.id)
            .order_by(PointsTransaction.created_at.desc(), PointsTransaction.id.desc())
            .limit(100)
        )
    ).all()
    row = _row(customer, stats)
    return CustomerCard(
        **row.model_dump(),
        notes=customer.notes,
        marketing_consent=customer.marketing_consent,
        average_check_kop=stats.average_check_kop if stats else 0,
        orders=[
            CustomerOrderRow(
                id=o.id,
                number=o.display_number,
                status=o.status,
                status_label=order_service.public_status_label(o),
                total_kop=o.total_kop,
                created_at=o.created_at,
            )
            for o in orders
        ],
        points_history=[
            PointsRow(
                id=h.id,
                delta=h.delta,
                kind_label=POINTS_KIND_LABELS.get(PointsKind(h.kind), h.kind),
                comment=h.comment,
                balance_after=h.balance_after,
                created_at=h.created_at,
            )
            for h in history
        ],
    )


@router.get("/customers/{customer_id}", response_model=CustomerCard, summary="Карточка клиента")
async def customer_card(customer_id: uuid.UUID, _: CustomersAccess, db: Db) -> CustomerCard:
    return await _card(db, customer_id)


class NotesIn(ApiModel):
    notes: str | None = Field(default=None, max_length=5000)


@router.patch("/customers/{customer_id}", response_model=CustomerCard, summary="Заметки")
async def update_customer(
    customer_id: uuid.UUID, payload: NotesIn, context: CustomersAccess, db: Db
) -> CustomerCard:
    await svc.update_notes(db, context.user, customer_id, payload.notes)
    return await _card(db, customer_id)


class PointsAdjustIn(ApiModel):
    delta: int = Field(ge=-1_000_000, le=1_000_000)
    comment: str = Field(min_length=1, max_length=500)


@router.post(
    "/customers/{customer_id}/points", response_model=CustomerCard, summary="Начислить/списать"
)
async def adjust_points(
    customer_id: uuid.UUID, payload: PointsAdjustIn, context: Owner, db: Db
) -> CustomerCard:
    """Только владелец (SPEC 7.1): у сотрудников нет доступа к деньгам и баллам (SPEC 10.9)."""
    await svc.adjust_points(
        db, context.user, customer_id, delta=payload.delta, comment=payload.comment
    )
    await db.flush()
    return await _card(db, customer_id)


# ------------------------------------------------------------------ promotions


class UsageStats(ApiModel):
    uses: int
    discount_kop: int


class PromotionIn(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    percent: int | None = Field(default=None, ge=1, le=99)
    amount_kop: int | None = Field(default=None, gt=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class PromotionPatch(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    percent: int | None = Field(default=None, ge=1, le=99)
    amount_kop: int | None = Field(default=None, gt=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None
    product_ids: list[uuid.UUID] | None = None
    category_ids: list[uuid.UUID] | None = None


class CategoryBrief(ApiModel):
    id: uuid.UUID
    name: str


class PromotionOut(ApiModel):
    id: uuid.UUID
    title: str
    percent: int | None
    amount_kop: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool
    archived: bool
    status_label: str
    products: list[ProductBrief]
    categories: list[CategoryBrief]
    stats: UsageStats


async def _promotion_out(db: Db, container: Deps, promotion: Promotion) -> PromotionOut:
    stats = (await svc.promotion_stats(db, [promotion.id])).get(promotion.id, (0, 0))
    return PromotionOut(
        id=promotion.id,
        title=promotion.title,
        percent=promotion.percent,
        amount_kop=promotion.amount_kop,
        starts_at=promotion.starts_at,
        ends_at=promotion.ends_at,
        is_active=promotion.is_active,
        archived=promotion.archived_at is not None,
        status_label=svc.promotion_status(promotion, container.clock.now()),
        products=[brief(container, p) for p in promotion.products],
        categories=[CategoryBrief(id=c.id, name=c.name) for c in promotion.categories],
        stats=UsageStats(uses=stats[0], discount_kop=stats[1]),
    )


@router.get("/promotions", response_model=list[PromotionOut], summary="Акции")
async def list_promotions(
    _: PromotionsAccess, db: Db, container: Deps, archived: bool = False
) -> list[PromotionOut]:
    in_archive = Promotion.archived_at.is_not(None) if archived else Promotion.archived_at.is_(None)
    promotions = (
        await db.scalars(select(Promotion).where(in_archive).order_by(Promotion.created_at.desc()))
    ).all()
    return [await _promotion_out(db, container, p) for p in promotions]


@router.get("/promotions/welcome-stats", response_model=UsageStats, summary="Приветственная")
async def welcome_stats(_: PromotionsAccess, db: Db) -> UsageStats:
    uses, total = await svc.welcome_stats(db)
    return UsageStats(uses=uses, discount_kop=total)


@router.post(
    "/promotions",
    response_model=PromotionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать акцию",
)
async def create_promotion(
    payload: PromotionIn, context: PromotionsAccess, db: Db, container: Deps
) -> PromotionOut:
    promotion = await svc.save_promotion(db, context.user, None, payload.model_dump())
    return await _promotion_out(db, container, promotion)


@router.patch("/promotions/{promotion_id}", response_model=PromotionOut, summary="Изменить акцию")
async def update_promotion(
    promotion_id: uuid.UUID,
    payload: PromotionPatch,
    context: PromotionsAccess,
    db: Db,
    container: Deps,
) -> PromotionOut:
    promotion = await svc.save_promotion(
        db, context.user, promotion_id, payload.model_dump(exclude_unset=True)
    )
    return await _promotion_out(db, container, promotion)


@router.delete("/promotions/{promotion_id}", response_model=Ok, summary="В архив")
async def archive_promotion(
    promotion_id: uuid.UUID, context: PromotionsAccess, db: Db, container: Deps
) -> Ok:
    promotion = await db.get(Promotion, promotion_id)
    if promotion is not None:
        promotion.archived_at = container.clock.now()
        promotion.is_active = False
        await audit.record(
            db,
            context.user,
            action="promotion.archive",
            entity="promotion",
            entity_id=promotion.id,
            summary=f"Акция «{promotion.title}» убрана в архив",
        )
    return Ok()


@router.post("/promotions/{promotion_id}/restore", response_model=PromotionOut, summary="Из архива")
async def restore_promotion(
    promotion_id: uuid.UUID, context: PromotionsAccess, db: Db, container: Deps
) -> PromotionOut:
    promotion = await db.get(Promotion, promotion_id)
    if promotion is None:
        raise NotFoundError("Акция не найдена")
    if promotion.archived_at is not None:
        promotion.archived_at = None  # возвращается выключенной: включить — осознанно
        await audit.record(
            db,
            context.user,
            action="promotion.restore",
            entity="promotion",
            entity_id=promotion.id,
            summary=f"Акция «{promotion.title}» возвращена из архива (выключена)",
        )
    return await _promotion_out(db, container, promotion)


# ------------------------------------------------------------------ promo codes


class PromoCodeSaveIn(ApiModel):
    code: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=500)
    percent: int | None = Field(default=None, ge=1, le=99)
    amount_kop: int | None = Field(default=None, gt=0)
    min_order_kop: int = Field(default=0, ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    max_uses_per_customer: int | None = Field(default=None, ge=1)
    first_order_only: bool = False
    applies_to_discounted: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    category_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class PromoCodePatch(ApiModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=500)
    percent: int | None = Field(default=None, ge=1, le=99)
    amount_kop: int | None = Field(default=None, gt=0)
    min_order_kop: int | None = Field(default=None, ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    max_uses_per_customer: int | None = Field(default=None, ge=1)
    first_order_only: bool | None = None
    applies_to_discounted: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None
    product_ids: list[uuid.UUID] | None = None
    category_ids: list[uuid.UUID] | None = None


class PromoCodeOut(ApiModel):
    id: uuid.UUID
    code: str
    description: str | None
    percent: int | None
    amount_kop: int | None
    min_order_kop: int
    max_uses: int | None
    max_uses_per_customer: int | None
    first_order_only: bool
    applies_to_discounted: bool
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool
    archived: bool
    status_label: str
    products: list[ProductBrief]
    categories: list[CategoryBrief]
    stats: UsageStats


async def _code_out(db: Db, container: Deps, promo: PromoCode) -> PromoCodeOut:
    stats = (await svc.promo_code_stats(db, [promo.id])).get(promo.id, (0, 0))
    error = availability_error(promo, container.clock.now())
    return PromoCodeOut(
        id=promo.id,
        code=promo.code,
        description=promo.description,
        percent=promo.percent,
        amount_kop=promo.amount_kop,
        min_order_kop=promo.min_order_kop,
        max_uses=promo.max_uses,
        max_uses_per_customer=promo.max_uses_per_customer,
        first_order_only=promo.first_order_only,
        applies_to_discounted=promo.applies_to_discounted,
        starts_at=promo.starts_at,
        ends_at=promo.ends_at,
        is_active=promo.is_active,
        archived=promo.archived_at is not None,
        status_label="Действует" if error is None else error,
        products=[brief(container, p) for p in promo.products],
        categories=[CategoryBrief(id=c.id, name=c.name) for c in promo.categories],
        stats=UsageStats(uses=stats[0], discount_kop=stats[1]),
    )


@router.get("/promo-codes", response_model=list[PromoCodeOut], summary="Промокоды")
async def list_codes(
    _: PromotionsAccess, db: Db, container: Deps, archived: bool = False
) -> list[PromoCodeOut]:
    in_archive = PromoCode.archived_at.is_not(None) if archived else PromoCode.archived_at.is_(None)
    codes = (
        await db.scalars(select(PromoCode).where(in_archive).order_by(PromoCode.created_at.desc()))
    ).all()
    return [await _code_out(db, container, c) for c in codes]


@router.post(
    "/promo-codes",
    response_model=PromoCodeOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать промокод",
)
async def create_code(
    payload: PromoCodeSaveIn, context: PromotionsAccess, db: Db, container: Deps
) -> PromoCodeOut:
    promo = await svc.save_promo_code(db, context.user, None, payload.model_dump())
    return await _code_out(db, container, promo)


@router.patch("/promo-codes/{code_id}", response_model=PromoCodeOut, summary="Изменить промокод")
async def update_code(
    code_id: uuid.UUID, payload: PromoCodePatch, context: PromotionsAccess, db: Db, container: Deps
) -> PromoCodeOut:
    promo = await svc.save_promo_code(
        db, context.user, code_id, payload.model_dump(exclude_unset=True)
    )
    return await _code_out(db, container, promo)


@router.delete("/promo-codes/{code_id}", response_model=Ok, summary="В архив")
async def archive_code(
    code_id: uuid.UUID, context: PromotionsAccess, db: Db, container: Deps
) -> Ok:
    promo = await db.get(PromoCode, code_id)
    if promo is not None and promo.archived_at is None:
        promo.archived_at = container.clock.now()
        promo.is_active = False
        await audit.record(
            db,
            context.user,
            action="promo_code.archive",
            entity="promo_code",
            entity_id=promo.id,
            summary=f"Промокод {promo.code} убран в архив",
        )
    return Ok()


@router.post("/promo-codes/{code_id}/restore", response_model=PromoCodeOut, summary="Из архива")
async def restore_code(
    code_id: uuid.UUID, context: PromotionsAccess, db: Db, container: Deps
) -> PromoCodeOut:
    promo = await db.get(PromoCode, code_id)
    if promo is None:
        raise NotFoundError("Промокод не найден")
    if promo.archived_at is not None:
        promo.archived_at = None  # возвращается выключенным: включить — осознанно
        await audit.record(
            db,
            context.user,
            action="promo_code.restore",
            entity="promo_code",
            entity_id=promo.id,
            summary=f"Промокод {promo.code} возвращён из архива (выключен)",
        )
    return await _code_out(db, container, promo)


# ------------------------------------------------------------------ thursdays


class ThursdayOut(ApiModel):
    date: date
    label: str
    planned: bool
    running: bool  # скидка действует прямо сейчас
    percent: int
    custom_percent: int | None
    note: str | None
    products: list[ProductBrief]


class ThursdayCalendarOut(ApiModel):
    # в режиме «неделя» с пятницы по среду идёт акция прошлого четверга — её не видно в upcoming
    current: ThursdayOut | None
    upcoming: list[ThursdayOut]
    default_percent: int
    mode: str


def _thursday_out(
    container: Deps,
    day: date,
    plan: ThursdayPlan | None,
    settings: ThursdaySettings,
    now: datetime,
) -> ThursdayOut:
    planned = plan is not None and bool(plan.products)
    start, end = thursday_window(day, settings.mode)
    return ThursdayOut(
        date=day,
        label=day_month(day),
        planned=planned,
        running=planned and start <= now < end,
        percent=(plan.percent if plan and plan.percent else settings.percent),
        custom_percent=plan.percent if plan else None,
        note=plan.note if plan else None,
        products=[brief(container, p) for p in plan.products] if plan else [],
    )


@router.get("/thursdays", response_model=ThursdayCalendarOut, summary="Календарь четвергов")
async def thursdays(_: PromotionsAccess, db: Db, container: Deps) -> ThursdayCalendarOut:
    settings = await get_group(db, ThursdaySettings)
    now = container.clock.now()
    days, plans = await svc.thursday_calendar(db, container)
    current = None
    previous = await svc.running_thursday_before(db, days[0], settings.mode, now)
    if previous is not None:
        current = _thursday_out(container, previous.date, previous, settings, now)
    return ThursdayCalendarOut(
        current=current,
        upcoming=[_thursday_out(container, day, plans.get(day), settings, now) for day in days],
        default_percent=settings.percent,
        mode=settings.mode.value,
    )


class ThursdayIn(ApiModel):
    product_ids: list[uuid.UUID] = Field(max_length=20)
    percent: int | None = Field(default=None, ge=1, le=99)
    note: str | None = Field(default=None, max_length=500)


@router.put("/thursdays/{day}", response_model=Ok, summary="Запланировать четверг")
async def save_thursday(
    day: date, payload: ThursdayIn, context: PromotionsAccess, db: Db, container: Deps
) -> Ok:
    await svc.save_thursday(
        db,
        container,
        context.user,
        day,
        product_ids=payload.product_ids,
        percent=payload.percent,
        note=payload.note,
    )
    return Ok()


@router.delete("/thursdays/{day}", response_model=Ok, summary="Снять план")
async def delete_thursday(day: date, context: PromotionsAccess, db: Db) -> Ok:
    await svc.delete_thursday(db, context.user, day)
    return Ok()
