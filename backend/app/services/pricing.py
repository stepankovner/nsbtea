"""Цены на витрине и в корзине с учётом действующих акций и «чая недели».

Акции четверга не включаются воркером, а вычисляются по дате при каждом запросе
(см. DECISIONS.md): это надёжнее — нет состояния, которое может «зависнуть».
"""

import datetime as dt
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.money import format_rub
from app.domain.pricing import ProductType
from app.domain.promotions import (
    DiscountLine,
    ProductPromotion,
    PromotionKind,
    product_discount_kop,
)
from app.domain.texts import day_month
from app.domain.thursday import ThursdayMode, active_thursday, msk_today, promo_ends_on
from app.models import Product, Promotion, ThursdayPlan
from app.services.settings import get_group
from app.services.settings_schema import ThursdaySettings

THURSDAY_TITLE = "Чай недели"


@dataclass(frozen=True, slots=True)
class ActiveThursday:
    date: dt.date
    percent: int
    mode: ThursdayMode
    ends_on: dt.date
    product_ids: frozenset[uuid.UUID]

    @property
    def badge(self) -> str:
        if self.mode is ThursdayMode.DAY:
            return f"−{self.percent}% только сегодня"
        return f"−{self.percent}% до {day_month(self.ends_on)}"


@dataclass(frozen=True, slots=True)
class UpcomingThursday:
    date: dt.date
    percent: int

    @property
    def note(self) -> str:
        return f"−{self.percent}% на этот чай в четверг, {day_month(self.date)}"


@dataclass(slots=True)
class PromoContext:
    now: datetime
    promotions: list[ProductPromotion]
    thursday: ActiveThursday | None
    upcoming: dict[uuid.UUID, UpcomingThursday] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Priced:
    price_kop: int
    old_price_kop: int | None
    promotion: ProductPromotion | None

    @property
    def discount_kop(self) -> int:
        return 0 if self.old_price_kop is None else self.old_price_kop - self.price_kop


async def load_context(db: AsyncSession, now: datetime) -> PromoContext:
    sales = (
        await db.scalars(
            select(Promotion).where(
                Promotion.is_active.is_(True),
                Promotion.archived_at.is_(None),
                or_(Promotion.starts_at.is_(None), Promotion.starts_at <= now),
                or_(Promotion.ends_at.is_(None), Promotion.ends_at > now),
            )
        )
    ).all()
    promotions = [
        ProductPromotion(
            id=s.id,
            kind=PromotionKind.SALE,
            title=s.title,
            percent=s.percent,
            amount_kop=s.amount_kop,
            product_ids=frozenset(p.id for p in s.products),
            category_ids=frozenset(c.id for c in s.categories),
        )
        for s in sales
        if s.percent or s.amount_kop
    ]

    settings = await get_group(db, ThursdaySettings)
    today = msk_today(now)
    plans = (
        await db.scalars(
            select(ThursdayPlan).where(
                ThursdayPlan.date >= today - timedelta(days=7),
                ThursdayPlan.date <= today + timedelta(days=120),
            )
        )
    ).all()
    by_date = {p.date: p for p in plans}
    active_date = active_thursday(now, by_date.keys(), settings.mode)
    thursday: ActiveThursday | None = None
    if active_date is not None:
        plan = by_date[active_date]
        percent = plan.percent or settings.percent
        thursday = ActiveThursday(
            date=active_date,
            percent=percent,
            mode=settings.mode,
            ends_on=promo_ends_on(active_date, settings.mode),
            product_ids=frozenset(p.id for p in plan.products),
        )
        if thursday.product_ids:
            promotions.append(
                ProductPromotion(
                    id=plan.id,
                    kind=PromotionKind.THURSDAY,
                    title=THURSDAY_TITLE,
                    percent=percent,
                    amount_kop=None,
                    product_ids=thursday.product_ids,
                    category_ids=frozenset(),
                )
            )

    upcoming: dict[uuid.UUID, UpcomingThursday] = {}
    for plan in sorted(plans, key=lambda p: p.date):
        if plan.date < today or plan.date == active_date:
            continue
        for product in plan.products:
            upcoming.setdefault(
                product.id, UpcomingThursday(plan.date, plan.percent or settings.percent)
            )
    return PromoContext(now=now, promotions=promotions, thursday=thursday, upcoming=upcoming)


def category_ids(product: Product) -> frozenset[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    if product.category_id:
        ids.add(product.category_id)
    if product.category is not None and product.category.parent_id:
        ids.add(product.category.parent_id)
    return frozenset(ids)


def discount_line(
    product: Product, *, amount_kop: int, grams_total: int, units: int
) -> DiscountLine:
    return DiscountLine(
        key=str(product.id),
        product_id=product.id,
        product_name=product.name,
        category_ids=category_ids(product),
        type=ProductType(product.type),
        grams_total=grams_total,
        units=units,
        amount_kop=amount_kop,
    )


def price_with_discount(
    ctx: PromoContext, product: Product, *, amount_kop: int, grams_total: int = 0, units: int = 0
) -> Priced:
    line = discount_line(product, amount_kop=amount_kop, grams_total=grams_total, units=units)
    best: ProductPromotion | None = None
    best_amount = 0
    for promotion in ctx.promotions:
        if not promotion.matches(line):
            continue
        amount = product_discount_kop(promotion, line)
        better = amount > best_amount or (
            amount == best_amount
            and amount > 0
            and promotion.kind is PromotionKind.THURSDAY
            and (best is None or best.kind is not PromotionKind.THURSDAY)
        )
        if better:
            best, best_amount = promotion, amount
    if best is None or best_amount <= 0:
        return Priced(price_kop=amount_kop, old_price_kop=None, promotion=None)
    return Priced(price_kop=amount_kop - best_amount, old_price_kop=amount_kop, promotion=best)


def promotion_badge(ctx: PromoContext, promotion: ProductPromotion) -> tuple[str, str]:
    if promotion.kind is PromotionKind.THURSDAY and ctx.thursday is not None:
        return "thursday", ctx.thursday.badge
    if promotion.percent is not None:
        return "sale", f"−{promotion.percent}%"
    assert promotion.amount_kop is not None
    return "sale", f"−{format_rub(promotion.amount_kop)}"
