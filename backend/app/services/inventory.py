"""Склад: атомарное изменение остатка с записью в журнал движений (CLAUDE.md, правило 3).

Списание — `UPDATE ... SET stock = stock - :q WHERE id = :id AND stock >= :q`.
Отрицательного остатка быть не может (ещё и CHECK-ограничение в БД).
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import DomainError, InsufficientStockError, NotFoundError
from app.domain.inventory import (
    MOVEMENT_LABELS,
    AlertState,
    MovementReason,
    StockLevel,
    adjustment_delta,
    format_qty,
    stock_alerts,
    stock_level,
    validate_supply_qty,
    validate_writeoff,
)
from app.domain.pricing import ProductType
from app.models import AdminUser, InventoryMovement, Product, StockAlertState, Supply
from app.models.system import NotificationEvent
from app.services import audit
from app.services.notifications import admin_link, h, notify_owner
from app.services.settings import get_group
from app.services.settings_schema import CatalogSettings

WRITEOFF_REASONS = {
    "defect": "Брак",
    "tasting": "Дегустация",
    "personal": "Личное",
    "other": "Другое",
}


def product_type(product: Product) -> ProductType:
    return ProductType(product.type)


def threshold_for(product: Product, settings: CatalogSettings) -> int:
    if product.low_stock_threshold is not None:
        return product.low_stock_threshold
    if product.type == ProductType.TEA.value:
        return settings.low_stock_tea_grams
    return settings.low_stock_units


async def change_stock(
    db: AsyncSession,
    container: Container,
    product_id: uuid.UUID,
    delta: int,
    reason: MovementReason,
    *,
    order_id: uuid.UUID | None = None,
    supply_id: uuid.UUID | None = None,
    comment: str | None = None,
    actor: AdminUser | None = None,
) -> InventoryMovement:
    if delta == 0:
        raise DomainError("Изменение остатка не может быть нулевым")
    statement = (
        update(Product)
        .where(Product.id == product_id)
        .values(stock=Product.stock + delta)
        .returning(Product.stock)
    )
    if delta < 0:
        statement = statement.where(Product.stock >= -delta)
    new_stock = (await db.execute(statement)).scalar_one_or_none()
    product = await db.get(Product, product_id, populate_existing=True)
    if product is None:
        raise NotFoundError("Товар не найден")
    if new_stock is None:
        raise InsufficientStockError(
            f"«{product.name}»: нельзя списать {format_qty(product_type(product), -delta)}: "
            f"на складе {format_qty(product_type(product), product.stock)}"
        )
    movement = InventoryMovement(
        product_id=product_id,
        delta=delta,
        reason=reason.value,
        balance_after=new_stock,
        order_id=order_id,
        supply_id=supply_id,
        comment=comment,
        actor_id=actor.id if actor else None,
    )
    movement.product = product
    db.add(movement)
    await _check_alerts(db, container, product, before=new_stock - delta, after=new_stock)
    return movement


async def _check_alerts(
    db: AsyncSession, container: Container, product: Product, *, before: int, after: int
) -> None:
    settings = await get_group(db, CatalogSettings)
    threshold = threshold_for(product, settings)
    state_row = await db.get(StockAlertState, product.id, with_for_update=True)
    state = AlertState(
        low_notified=bool(state_row and state_row.low_notified_at),
        out_notified=bool(state_row and state_row.out_notified_at),
    )
    decision = stock_alerts(before=before, after=after, threshold=threshold, state=state)
    if decision.state != state:
        now = container.clock.now()
        if state_row is None:
            state_row = StockAlertState(product_id=product.id)
            db.add(state_row)
        state_row.low_notified_at = (
            (state_row.low_notified_at or now) if decision.state.low_notified else None
        )
        state_row.out_notified_at = (
            (state_row.out_notified_at or now) if decision.state.out_notified else None
        )
    if product.status != "published" or product.archived_at is not None:
        return
    link = admin_link(container, f"/products/{product.id}")
    qty = format_qty(product_type(product), after)
    if decision.notify_out:
        await notify_owner(
            db,
            container,
            NotificationEvent.OUT_OF_STOCK,
            f"⛔ <b>Закончился:</b> {h(product.name)}\n"
            f"На сайте он показан как «Нет в наличии».\n{link}",
        )
    elif decision.notify_low:
        await notify_owner(
            db,
            container,
            NotificationEvent.LOW_STOCK,
            f"⚠️ <b>Осталось мало:</b> {h(product.name)} — {qty}\n"
            f"Порог: {format_qty(product_type(product), threshold)}.\n{link}",
        )


@dataclass(frozen=True, slots=True)
class Line:
    product_id: uuid.UUID
    qty: int


async def _load_products(db: AsyncSession, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Product]:
    products = {
        p.id: p for p in (await db.scalars(select(Product).where(Product.id.in_(ids)))).all()
    }
    missing = set(ids) - set(products)
    if missing:
        raise NotFoundError("Некоторые товары не найдены — обновите страницу")
    return products


async def post_supply(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    *,
    lines: Sequence[Line],
    comment: str | None,
) -> tuple[Supply, list[InventoryMovement]]:
    if not lines:
        raise DomainError("Добавьте хотя бы один товар", field="lines")
    products = await _load_products(db, [line.product_id for line in lines])
    for line in lines:
        validate_supply_qty(product_type(products[line.product_id]), line.qty)
    supply = Supply(comment=comment or None, actor_id=actor.id, posted_at=container.clock.now())
    db.add(supply)
    await db.flush()
    movements = [
        await change_stock(
            db,
            container,
            line.product_id,
            line.qty,
            MovementReason.SUPPLY,
            supply_id=supply.id,
            comment=comment,
            actor=actor,
        )
        for line in lines
    ]
    await audit.record(
        db,
        actor,
        action="inventory.supply",
        entity="supply",
        entity_id=supply.id,
        summary=f"Принята поставка: {len(lines)} поз.",
        diff={
            products[m.product_id].name: [m.balance_after - m.delta, m.balance_after]
            for m in movements
        },
    )
    return supply, movements


@dataclass(frozen=True, slots=True)
class CountResult:
    product: Product
    before: int
    actual: int
    delta: int


async def inventory_count(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    *,
    lines: Sequence[tuple[uuid.UUID, int]],
    comment: str | None,
) -> list[CountResult]:
    if not lines:
        raise DomainError("Добавьте хотя бы один товар", field="lines")
    products = await _load_products(db, [pid for pid, _ in lines])
    results: list[CountResult] = []
    for product_id, actual in lines:
        product = products[product_id]
        before = await db.scalar(
            select(Product.stock).where(Product.id == product_id).with_for_update()
        )
        assert before is not None
        delta = adjustment_delta(current=before, actual=actual)
        if delta:
            await change_stock(
                db,
                container,
                product_id,
                delta,
                MovementReason.ADJUSTMENT,
                comment=comment or "Инвентаризация",
                actor=actor,
            )
        results.append(CountResult(product=product, before=before, actual=actual, delta=delta))
    changed = [r for r in results if r.delta]
    if changed:
        await audit.record(
            db,
            actor,
            action="inventory.count",
            entity="inventory",
            summary=f"Инвентаризация: исправлено {len(changed)} поз.",
            diff={r.product.name: [r.before, r.actual] for r in changed},
        )
    return results


async def write_off(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    *,
    reason: str,
    lines: Sequence[Line],
    comment: str | None,
) -> list[InventoryMovement]:
    if reason not in WRITEOFF_REASONS:
        raise DomainError("Выберите причину списания", field="reason")
    if not lines:
        raise DomainError("Добавьте хотя бы один товар", field="lines")
    products = await _load_products(db, [line.product_id for line in lines])
    label = WRITEOFF_REASONS[reason]
    full_comment = f"{label}: {comment}" if comment else label
    movements: list[InventoryMovement] = []
    for line in lines:
        product = products[line.product_id]
        try:
            validate_writeoff(product_type(product), current=product.stock, qty=line.qty)
        except InsufficientStockError as exc:
            raise InsufficientStockError(
                f"«{product.name}»: {exc.message[0].lower()}{exc.message[1:]}"
            ) from exc
        movements.append(
            await change_stock(
                db,
                container,
                line.product_id,
                -line.qty,
                MovementReason.WRITEOFF,
                comment=full_comment,
                actor=actor,
            )
        )
    await audit.record(
        db,
        actor,
        action="inventory.writeoff",
        entity="inventory",
        summary=f"Списание ({label.lower()}): {len(lines)} поз.",
        diff={
            products[m.product_id].name: [m.balance_after - m.delta, m.balance_after]
            for m in movements
        },
    )
    return movements


@dataclass(frozen=True, slots=True)
class StockRow:
    product: Product
    threshold: int
    level: StockLevel
    last_supply_at: datetime | None


async def stock_rows(
    db: AsyncSession,
    *,
    q: str | None = None,
    level: StockLevel | None = None,
    category_id: uuid.UUID | None = None,
    only_attention: bool = False,
) -> list[StockRow]:
    settings = await get_group(db, CatalogSettings)
    last_supply = (
        select(
            InventoryMovement.product_id,
            func.max(InventoryMovement.created_at).label("last_supply_at"),
        )
        .where(InventoryMovement.reason == MovementReason.SUPPLY.value)
        .group_by(InventoryMovement.product_id)
        .subquery()
    )
    query = (
        select(Product, last_supply.c.last_supply_at)
        .outerjoin(last_supply, last_supply.c.product_id == Product.id)
        .where(Product.archived_at.is_(None), Product.status != "draft")
        .order_by(Product.name)
    )
    if q:
        query = query.where(Product.search_text.ilike(f"%{q.strip().lower()}%"))
    if category_id:
        query = query.where(Product.category_id == category_id)
    rows: list[StockRow] = []
    for product, last_supply_at in (await db.execute(query)).all():
        threshold = threshold_for(product, settings)
        row_level = stock_level(product.stock, threshold)
        if level is not None and row_level is not level:
            continue
        if only_attention and row_level is StockLevel.OK:
            continue
        rows.append(StockRow(product, threshold, row_level, last_supply_at))
    if only_attention:
        rows.sort(key=lambda r: (r.level is not StockLevel.OUT, r.product.name))
    return rows


def movement_label(reason: str) -> str:
    try:
        return MOVEMENT_LABELS[MovementReason(reason)]
    except ValueError:
        return reason
