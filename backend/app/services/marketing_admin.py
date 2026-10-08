"""Админка: клиенты, акции, промокоды, «чай недели» (SPEC 10.6, 10.7)."""

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import ConflictError, DomainError, NotFoundError
from app.domain.loyalty import PointsKind
from app.domain.orders import REVENUE_STATUSES
from app.domain.promotions import OrderDiscountSource
from app.domain.thursday import (
    THURSDAY,
    ThursdayMode,
    msk_today,
    thursday_window,
    upcoming_thursdays,
)
from app.models import (
    AdminUser,
    Category,
    Customer,
    Order,
    OrderItem,
    Product,
    PromoCode,
    PromoCodeUsage,
    Promotion,
    ThursdayPlan,
)
from app.services import audit
from app.services.points import apply_points

COUNTED_STATUSES = [s.value for s in REVENUE_STATUSES] + ["completed"]
CODE_RE = re.compile(r"^[A-Z0-9_-]{3,32}$")


# ------------------------------------------------------------------ customers


@dataclass(frozen=True, slots=True)
class CustomerStats:
    orders_count: int
    total_spent_kop: int
    last_order_at: datetime | None

    @property
    def average_check_kop(self) -> int:
        return self.total_spent_kop // self.orders_count if self.orders_count else 0


async def customer_stats(
    db: AsyncSession, customer_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, CustomerStats]:
    if not customer_ids:
        return {}
    rows = await db.execute(
        select(
            Order.customer_id,
            func.count(),
            func.coalesce(func.sum(Order.total_kop - Order.refunded_kop), 0),
            func.max(Order.created_at),
        )
        .where(Order.customer_id.in_(customer_ids), Order.paid_at.is_not(None))
        .group_by(Order.customer_id)
    )
    return {
        cid: CustomerStats(int(n), int(total), last)
        for cid, n, total, last in rows.all()
        if cid is not None
    }


async def list_customers(
    db: AsyncSession, *, q: str | None, page: int, per_page: int
) -> tuple[list[Customer], int, dict[uuid.UUID, CustomerStats]]:
    query = select(Customer).where(Customer.anonymized_at.is_(None))
    if q and q.strip():
        text = q.strip()
        digits = re.sub(r"\D", "", text)
        conditions: list[ColumnElement[bool]] = [
            Customer.email.ilike(f"%{text}%"),
            Customer.name.ilike(f"%{text}%"),
            Customer.telegram_username.ilike(f"%{text.lstrip('@')}%"),
        ]
        if len(digits) >= 4:
            conditions.append(Customer.phone.contains(digits[-10:]))
        query = query.where(or_(*conditions))
    total = int(await db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    customers = list(
        (
            await db.scalars(
                query.order_by(Customer.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()
    )
    stats = await customer_stats(db, [c.id for c in customers])
    return customers, total, stats


async def get_customer(db: AsyncSession, customer_id: uuid.UUID) -> Customer:
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("Клиент не найден")
    return customer


async def update_notes(
    db: AsyncSession, actor: AdminUser, customer_id: uuid.UUID, notes: str | None
) -> Customer:
    customer = await get_customer(db, customer_id)
    before = customer.notes
    customer.notes = (notes or "").strip() or None
    await audit.record(
        db,
        actor,
        action="customer.notes",
        entity="customer",
        entity_id=customer.id,
        summary=f"Заметка о клиенте {customer.email or customer.name or customer.id}",
        diff=audit.diff_fields({"notes": before}, {"notes": customer.notes}),
    )
    return customer


async def adjust_points(
    db: AsyncSession, actor: AdminUser, customer_id: uuid.UUID, *, delta: int, comment: str
) -> Customer:
    if not comment.strip():
        raise DomainError("Напишите, за что начисляете или списываете баллы", field="comment")
    if delta == 0:
        raise DomainError("Укажите количество баллов", field="delta")
    customer = await get_customer(db, customer_id)
    before = customer.points_balance
    await apply_points(
        db, customer.id, delta, PointsKind.MANUAL, comment=comment.strip(), actor=actor
    )
    await audit.record(
        db,
        actor,
        action="customer.points",
        entity="customer",
        entity_id=customer.id,
        summary=f"{'Начислено' if delta > 0 else 'Списано'} {abs(delta)} баллов: {comment.strip()}",
        diff={"points_balance": [before, customer.points_balance]},
    )
    return customer


# ------------------------------------------------------------------ promotions


def _validate_value(percent: int | None, amount_kop: int | None) -> None:
    if (percent is None) == (amount_kop is None):
        raise DomainError("Укажите скидку либо в процентах, либо в рублях", field="percent")


def _validate_dates(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and ends_at <= starts_at:
        raise DomainError("Дата окончания должна быть позже даты начала", field="ends_at")


async def _products(db: AsyncSession, ids: Sequence[uuid.UUID]) -> list[Product]:
    if not ids:
        return []
    products = list((await db.scalars(select(Product).where(Product.id.in_(ids)))).all())
    if len(products) != len(set(ids)):
        raise NotFoundError("Некоторые товары не найдены")
    return products


async def _categories(db: AsyncSession, ids: Sequence[uuid.UUID]) -> list[Category]:
    if not ids:
        return []
    categories = list((await db.scalars(select(Category).where(Category.id.in_(ids)))).all())
    if len(categories) != len(set(ids)):
        raise NotFoundError("Некоторые категории не найдены")
    return categories


def promotion_status(promotion: Promotion, now: datetime) -> str:
    if not promotion.is_active:
        return "Выключена"
    if promotion.starts_at and promotion.starts_at > now:
        return "Запланирована"
    if promotion.ends_at and promotion.ends_at <= now:
        return "Закончилась"
    return "Действует"


async def save_promotion(
    db: AsyncSession,
    actor: AdminUser,
    promotion_id: uuid.UUID | None,
    data: dict[str, object],
) -> Promotion:
    if promotion_id is None:
        promotion = Promotion(kind="sale", title="")
        db.add(promotion)
    else:
        found = await db.get(Promotion, promotion_id)
        if found is None:
            raise NotFoundError("Акция не найдена")
        promotion = found
    product_ids = data.pop("product_ids", None)
    category_ids = data.pop("category_ids", None)
    for key, value in data.items():
        setattr(promotion, key, value)
    _validate_value(promotion.percent, promotion.amount_kop)
    _validate_dates(promotion.starts_at, promotion.ends_at)
    if promotion.percent is not None and not 1 <= promotion.percent <= 99:
        raise DomainError("Процент скидки — от 1 до 99", field="percent")
    if product_ids is not None:
        promotion.products = await _products(db, product_ids)  # type: ignore[arg-type]
    if category_ids is not None:
        promotion.categories = await _categories(db, category_ids)  # type: ignore[arg-type]
    if not promotion.products and not promotion.categories:
        raise DomainError("Выберите товары или категории, на которые действует акция")
    await db.flush()
    await audit.record(
        db,
        actor,
        action="promotion.save",
        entity="promotion",
        entity_id=promotion.id,
        summary=f"Сохранена акция «{promotion.title}»",
    )
    return promotion


async def promotion_stats(
    db: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    if not ids:
        return {}
    rows = await db.execute(
        select(
            OrderItem.applied_promotion_id,
            func.count(func.distinct(OrderItem.order_id)),
            func.coalesce(func.sum(OrderItem.product_discount_kop), 0),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.applied_promotion_id.in_(ids), Order.status.in_(COUNTED_STATUSES))
        .group_by(OrderItem.applied_promotion_id)
    )
    return {pid: (int(n), int(total)) for pid, n, total in rows.all() if pid is not None}


async def welcome_stats(db: AsyncSession) -> tuple[int, int]:
    row = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(Order.order_discount_kop), 0)).where(
                Order.order_discount_source == OrderDiscountSource.WELCOME.value,
                Order.status.in_(COUNTED_STATUSES),
            )
        )
    ).one()
    return int(row[0]), int(row[1])


# ------------------------------------------------------------------ promo codes


def normalize_code(code: str) -> str:
    value = code.strip().upper()
    if not CODE_RE.match(value):
        raise DomainError(
            "Промокод — латинские буквы, цифры, дефис или подчёркивание, от 3 до 32 символов",
            field="code",
        )
    return value


async def save_promo_code(
    db: AsyncSession, actor: AdminUser, code_id: uuid.UUID | None, data: dict[str, object]
) -> PromoCode:
    if "code" in data:
        data["code"] = normalize_code(str(data["code"]))
        clash_query = select(PromoCode).where(PromoCode.code == data["code"])
        if code_id is not None:
            clash_query = clash_query.where(PromoCode.id != code_id)
        clash = await db.scalar(clash_query)
        if clash is not None:
            if clash.archived_at is not None:
                raise ConflictError(
                    "Такой промокод уже есть в архиве — восстановите его "
                    "(«Акции» → «Промокоды» → «Архив»)",
                    field="code",
                )
            raise ConflictError("Такой промокод уже есть", field="code")
    if code_id is None:
        promo = PromoCode(code=str(data.get("code", "")))
        db.add(promo)
    else:
        found = await db.get(PromoCode, code_id)
        if found is None:
            raise NotFoundError("Промокод не найден")
        promo = found
    product_ids = data.pop("product_ids", None)
    category_ids = data.pop("category_ids", None)
    for key, value in data.items():
        setattr(promo, key, value)
    _validate_value(promo.percent, promo.amount_kop)
    _validate_dates(promo.starts_at, promo.ends_at)
    if promo.percent is not None and not 1 <= promo.percent <= 99:
        raise DomainError("Процент скидки — от 1 до 99", field="percent")
    if product_ids is not None:
        promo.products = await _products(db, product_ids)  # type: ignore[arg-type]
    if category_ids is not None:
        promo.categories = await _categories(db, category_ids)  # type: ignore[arg-type]
    await db.flush()
    await audit.record(
        db,
        actor,
        action="promo_code.save",
        entity="promo_code",
        entity_id=promo.id,
        summary=f"Сохранён промокод {promo.code}",
    )
    return promo


async def promo_code_stats(
    db: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    if not ids:
        return {}
    rows = await db.execute(
        select(
            PromoCodeUsage.promo_code_id,
            func.count(),
            func.coalesce(func.sum(PromoCodeUsage.discount_kop), 0),
        )
        .join(Order, Order.id == PromoCodeUsage.order_id)
        .where(PromoCodeUsage.promo_code_id.in_(ids), Order.status.in_(COUNTED_STATUSES))
        .group_by(PromoCodeUsage.promo_code_id)
    )
    return {cid: (int(n), int(total)) for cid, n, total in rows.all()}


# ------------------------------------------------------------------ thursdays


async def thursday_calendar(
    db: AsyncSession, container: Container
) -> tuple[list[date], dict[date, ThursdayPlan]]:
    today = msk_today(container.clock.now())
    days = upcoming_thursdays(today, 8)
    plans = (
        await db.scalars(
            select(ThursdayPlan).where(ThursdayPlan.date >= days[0], ThursdayPlan.date <= days[-1])
        )
    ).all()
    return days, {p.date: p for p in plans}


async def running_thursday_before(
    db: AsyncSession, first_upcoming: date, mode: ThursdayMode, now: datetime
) -> ThursdayPlan | None:
    """План прошлого четверга, чья скидка ещё идёт (режим «неделя», с пятницы по среду)."""
    previous = first_upcoming - timedelta(weeks=1)
    plan = await db.scalar(select(ThursdayPlan).where(ThursdayPlan.date == previous))
    if plan is None or not plan.products:
        return None
    start, end = thursday_window(previous, mode)
    return plan if start <= now < end else None


async def save_thursday(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    day: date,
    *,
    product_ids: Sequence[uuid.UUID],
    percent: int | None,
    note: str | None,
) -> ThursdayPlan:
    if day.weekday() != THURSDAY:
        raise DomainError(f"{day:%d.%m.%Y} — не четверг", field="date")
    today = msk_today(container.clock.now())
    if day < today:
        raise DomainError("Этот четверг уже прошёл", field="date")
    if not product_ids:
        raise DomainError("Выберите хотя бы один чай", field="product_ids")
    plan = await db.scalar(select(ThursdayPlan).where(ThursdayPlan.date == day))
    if plan is None:
        plan = ThursdayPlan(date=day, products=[])
        db.add(plan)
    plan.percent = percent
    plan.note = (note or "").strip() or None
    plan.products = await _products(db, product_ids)
    await db.flush()
    await audit.record(
        db,
        actor,
        action="thursday.save",
        entity="thursday",
        entity_id=day.isoformat(),
        summary=f"Чай недели на {day:%d.%m.%Y}: " + ", ".join(p.name for p in plan.products),
    )
    return plan


async def delete_thursday(db: AsyncSession, actor: AdminUser, day: date) -> None:
    plan = await db.scalar(select(ThursdayPlan).where(ThursdayPlan.date == day))
    if plan is None:
        return
    await db.delete(plan)
    await audit.record(
        db,
        actor,
        action="thursday.delete",
        entity="thursday",
        entity_id=day.isoformat(),
        summary=f"Снят план чая недели на {day:%d.%m.%Y}",
    )
