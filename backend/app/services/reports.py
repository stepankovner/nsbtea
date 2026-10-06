"""Сводка за неделю для владельца (SPEC 11.1)."""

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.inventory import format_qty
from app.domain.money import format_rub
from app.domain.orders import OrderStatus
from app.domain.texts import day_month
from app.domain.thursday import MSK, msk_today
from app.models import Customer, Order, OrderItem, PointsTransaction, PromoCode, PromoCodeUsage
from app.services import inventory
from app.services.inventory import product_type
from app.services.notifications import h

PAID_STATUSES = [
    OrderStatus.PAID.value,
    OrderStatus.ASSEMBLING.value,
    OrderStatus.SHIPPED.value,
    OrderStatus.COMPLETED.value,
    OrderStatus.REFUNDED.value,
]


def _start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=MSK).astimezone(UTC)


async def _revenue(db: AsyncSession, start: datetime, end: datetime) -> tuple[int, int]:
    row = (
        await db.execute(
            select(
                func.count(), func.coalesce(func.sum(Order.total_kop - Order.refunded_kop), 0)
            ).where(Order.paid_at >= start, Order.paid_at < end, Order.status.in_(PAID_STATUSES))
        )
    ).one()
    return int(row[0]), int(row[1])


def _change(current: int, previous: int) -> str:
    if previous == 0:
        return ""
    pct = round((current - previous) * 100 / previous)
    return f" ({'+' if pct >= 0 else '−'}{abs(pct)}% к прошлой неделе)"


async def build_weekly_summary(db: AsyncSession, container: Container) -> str:
    today = msk_today(container.clock.now())
    week_start = today - timedelta(days=today.weekday() + 7)
    start, end = _start(week_start), _start(week_start + timedelta(days=7))
    prev_start = _start(week_start - timedelta(days=7))

    orders, revenue = await _revenue(db, start, end)
    prev_orders, prev_revenue = await _revenue(db, prev_start, start)
    average = revenue // orders if orders else 0

    top = (
        await db.execute(
            select(
                OrderItem.product_name,
                func.sum(OrderItem.qty),
                func.sum(OrderItem.grams * OrderItem.qty),
                func.sum(OrderItem.line_total_kop - OrderItem.product_discount_kop),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.paid_at >= start, Order.paid_at < end, Order.status.in_(PAID_STATUSES))
            .group_by(OrderItem.product_name)
            .order_by(func.sum(OrderItem.line_total_kop).desc())
            .limit(5)
        )
    ).all()
    new_customers = int(
        await db.scalar(
            select(func.count())
            .select_from(Customer)
            .where(Customer.first_paid_order_at >= start, Customer.first_paid_order_at < end)
        )
        or 0
    )
    points = dict(
        (
            await db.execute(
                select(PointsTransaction.kind, func.coalesce(func.sum(PointsTransaction.delta), 0))
                .where(PointsTransaction.created_at >= start, PointsTransaction.created_at < end)
                .group_by(PointsTransaction.kind)
            )
        ).all()
    )
    earned = int(points.get("earn", 0))
    spent = -int(points.get("spend_reserve", 0)) - int(points.get("release", 0))
    codes = (
        await db.execute(
            select(PromoCode.code, func.count(), func.sum(PromoCodeUsage.discount_kop))
            .join(PromoCodeUsage, PromoCodeUsage.promo_code_id == PromoCode.id)
            .join(Order, Order.id == PromoCodeUsage.order_id)
            .where(Order.paid_at >= start, Order.paid_at < end)
            .group_by(PromoCode.code)
        )
    ).all()
    reorder = await inventory.stock_rows(db, only_attention=True)

    period = f"{day_month(week_start)} — {day_month(week_start + timedelta(days=6))}"
    lines = [
        f"📊 <b>Сводка за неделю</b> {period}",
        "",
        f"Выручка: {format_rub(revenue)}{_change(revenue, prev_revenue)}",
        f"Заказов: {orders}" + (f" (неделей раньше: {prev_orders})" if prev_orders else ""),
        f"Средний чек: {format_rub(average)}",
        f"Новых клиентов: {new_customers}",
    ]
    if top:
        lines += ["", "<b>Топ товаров:</b>"]
        for index, (name, qty, grams, total) in enumerate(top, start=1):
            amount = f"{int(grams)} г" if grams else f"{int(qty)} шт."
            lines.append(f"{index}. {h(name)} — {amount}, {format_rub(int(total))}")
    lines += ["", f"Баллы: начислено {earned}, списано {max(spent, 0)}"]
    if codes:
        lines.append(
            "Промокоды: "
            + "; ".join(
                f"{h(code)} — {n} раз, {format_rub(int(total or 0))}" for code, n, total in codes
            )
        )
    if reorder:
        lines += ["", "<b>Нужно дозаказать:</b>"]
        lines += [
            f"• {h(r.product.name)} — "
            + (
                "нет в наличии"
                if r.product.stock <= 0
                else format_qty(product_type(r.product), r.product.stock)
            )
            for r in reorder[:15]
        ]
    else:
        lines += ["", "Нужно дозаказать: всё в порядке, остатков хватает."]
    return "\n".join(lines)
