"""Проверка промокода: существование, даты, лимиты использований (SPEC 7.2).

Правила сочетания со скидками — в domain/promotions.py.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.promotions import PromoCodeRule
from app.domain.texts import day_month
from app.domain.thursday import MSK
from app.models import Order, PromoCode, PromoCodeUsage


@dataclass(frozen=True, slots=True)
class PromoCheck:
    code: str
    rule: PromoCodeRule | None
    message: str | None
    promo: PromoCode | None


async def find_code(db: AsyncSession, code: str) -> PromoCode | None:
    return await db.scalar(
        select(PromoCode).where(PromoCode.code == code.strip(), PromoCode.archived_at.is_(None))
    )


async def _usages(
    db: AsyncSession,
    promo: PromoCode,
    *,
    customer_id: uuid.UUID | None = None,
    email: str | None = None,
) -> int:
    query = (
        select(func.count())
        .select_from(PromoCodeUsage)
        .join(Order, Order.id == PromoCodeUsage.order_id)
        .where(PromoCodeUsage.promo_code_id == promo.id, Order.status != "cancelled")
    )
    if customer_id is not None or email is not None:
        conditions = []
        if customer_id is not None:
            conditions.append(PromoCodeUsage.customer_id == customer_id)
        if email:
            conditions.append(PromoCodeUsage.email == email)
        query = query.where(or_(*conditions))
    return int(await db.scalar(query) or 0)


def availability_error(promo: PromoCode, now: datetime) -> str | None:
    if not promo.is_active:
        return "Промокод сейчас не действует"
    if promo.starts_at and promo.starts_at > now:
        start = promo.starts_at.astimezone(MSK).date()
        return f"Промокод ещё не начал действовать — с {day_month(start)}"
    if promo.ends_at and promo.ends_at <= now:
        return "Срок действия промокода закончился"
    return None


async def check(
    db: AsyncSession,
    code: str,
    now: datetime,
    *,
    customer_id: uuid.UUID | None,
    email: str | None,
) -> PromoCheck:
    promo = await find_code(db, code)
    if promo is None:
        return PromoCheck(
            code.strip().upper(), None, "Такого промокода нет — проверьте написание", None
        )
    message = availability_error(promo, now)
    if (
        message is None
        and promo.max_uses is not None
        and await _usages(db, promo) >= promo.max_uses
    ):
        message = "Промокод уже использован максимальное число раз"
    if (
        message is None
        and promo.max_uses_per_customer is not None
        and (customer_id or email)
        and await _usages(db, promo, customer_id=customer_id, email=email)
        >= promo.max_uses_per_customer
    ):
        message = "Вы уже использовали этот промокод"
    if message is not None:
        return PromoCheck(promo.code, None, message, promo)
    rule = PromoCodeRule(
        id=promo.id,
        code=promo.code,
        percent=promo.percent,
        amount_kop=promo.amount_kop,
        min_order_kop=promo.min_order_kop,
        first_order_only=promo.first_order_only,
        applies_to_discounted=promo.applies_to_discounted,
        product_ids=frozenset(p.id for p in promo.products),
        category_ids=frozenset(c.id for c in promo.categories),
    )
    return PromoCheck(promo.code, rule, None, promo)
