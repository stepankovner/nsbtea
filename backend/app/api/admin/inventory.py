"""Админка: склад — поставки, инвентаризация, списания, история, «нужно дозаказать»."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.api.admin.catalog import main_image_url
from app.api.deps import Db, Deps, InventoryAccess
from app.domain.inventory import StockLevel, format_qty
from app.domain.pricing import ProductType
from app.models import AdminUser, InventoryMovement, Order, Product, Supply
from app.schemas.inventory import (
    CountIn,
    CountLineOut,
    CountOut,
    MovementLineOut,
    MovementListOut,
    MovementOut,
    StockListOut,
    StockRowOut,
    SupplyIn,
    SupplyListItem,
    SupplyListOut,
    SupplyOut,
    WriteoffIn,
    WriteoffOut,
)
from app.services import inventory as svc

router = APIRouter(prefix="/admin/inventory", tags=["admin: склад"])
Inventory = InventoryAccess

LEVEL_LABELS = {
    StockLevel.OK: "В наличии",
    StockLevel.LOW: "Осталось мало",
    StockLevel.OUT: "Нет в наличии",
}


def _qty(product: Product, qty: int, *, signed: bool = False) -> str:
    label = format_qty(ProductType(product.type), abs(qty))
    if not signed:
        return label
    return f"+{label}" if qty > 0 else f"−{label}"


def _movement_line(movement: InventoryMovement) -> MovementLineOut:
    return MovementLineOut(
        product_id=movement.product_id,
        product_name=movement.product.name,
        delta=movement.delta,
        qty_label=_qty(movement.product, movement.delta),
        balance_after=movement.balance_after,
        balance_label=_qty(movement.product, movement.balance_after),
    )


@router.get("", response_model=StockListOut, summary="Таблица остатков")
async def stock_table(
    _: Inventory,
    db: Db,
    container: Deps,
    q: str | None = None,
    level: StockLevel | None = None,
    category_id: uuid.UUID | None = None,
) -> StockListOut:
    rows = await svc.stock_rows(db, q=q, level=level, category_id=category_id)
    return StockListOut(items=[_stock_row(container, r) for r in rows])


@router.get("/reorder", response_model=StockListOut, summary="Нужно дозаказать")
async def reorder_list(_: Inventory, db: Db, container: Deps) -> StockListOut:
    rows = await svc.stock_rows(db, only_attention=True)
    return StockListOut(items=[_stock_row(container, r) for r in rows])


def _stock_row(container: Deps, row: svc.StockRow) -> StockRowOut:
    p = row.product
    return StockRowOut(
        product_id=p.id,
        name=p.name,
        type=p.type,
        status=p.status,
        stock=p.stock,
        stock_label=_qty(p, p.stock),
        threshold=row.threshold,
        threshold_label=_qty(p, row.threshold),
        level=row.level.value,
        level_label=LEVEL_LABELS[row.level],
        last_supply_at=row.last_supply_at,
        image_url=main_image_url(container, p),
    )


@router.post(
    "/supplies",
    response_model=SupplyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Принять поставку",
)
async def post_supply(payload: SupplyIn, context: Inventory, db: Db, container: Deps) -> SupplyOut:
    supply, movements = await svc.post_supply(
        db,
        container,
        context.user,
        lines=[svc.Line(line.product_id, line.qty) for line in payload.lines],
        comment=payload.comment,
    )
    return SupplyOut(
        id=supply.id,
        comment=supply.comment,
        posted_at=supply.posted_at,
        lines=[_movement_line(m) for m in movements],
    )


@router.get("/supplies", response_model=SupplyListOut, summary="История поставок")
async def list_supplies(
    _: Inventory,
    db: Db,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 30,
) -> SupplyListOut:
    lines_count = (
        select(InventoryMovement.supply_id, func.count().label("n"))
        .where(InventoryMovement.supply_id.is_not(None))
        .group_by(InventoryMovement.supply_id)
        .subquery()
    )
    query = (
        select(Supply, AdminUser.name, lines_count.c.n)
        .outerjoin(AdminUser, AdminUser.id == Supply.actor_id)
        .outerjoin(lines_count, lines_count.c.supply_id == Supply.id)
        .order_by(Supply.posted_at.desc())
    )
    total = await db.scalar(select(func.count()).select_from(Supply)) or 0
    rows = (await db.execute(query.offset((page - 1) * per_page).limit(per_page))).all()
    return SupplyListOut(
        items=[
            SupplyListItem(
                id=supply.id,
                comment=supply.comment,
                posted_at=supply.posted_at,
                actor_name=actor_name,
                lines_count=int(n or 0),
            )
            for supply, actor_name, n in rows
        ],
        total=total,
    )


@router.post("/count", response_model=CountOut, summary="Инвентаризация")
async def inventory_count(
    payload: CountIn, context: Inventory, db: Db, container: Deps
) -> CountOut:
    results = await svc.inventory_count(
        db,
        container,
        context.user,
        lines=[(line.product_id, line.actual) for line in payload.lines],
        comment=payload.comment,
    )
    return CountOut(
        changed=sum(1 for r in results if r.delta),
        lines=[
            CountLineOut(
                product_id=r.product.id,
                product_name=r.product.name,
                before=r.before,
                actual=r.actual,
                delta=r.delta,
                delta_label=_qty(r.product, r.delta, signed=True) if r.delta else "без изменений",
            )
            for r in results
        ],
    )


@router.post("/writeoffs", response_model=WriteoffOut, summary="Списание")
async def write_off(
    payload: WriteoffIn, context: Inventory, db: Db, container: Deps
) -> WriteoffOut:
    movements = await svc.write_off(
        db,
        container,
        context.user,
        reason=payload.reason,
        lines=[svc.Line(line.product_id, line.qty) for line in payload.lines],
        comment=payload.comment,
    )
    return WriteoffOut(lines=[_movement_line(m) for m in movements])


@router.get("/movements", response_model=MovementListOut, summary="История движения")
async def movements(
    _: Inventory,
    db: Db,
    product_id: uuid.UUID | None = None,
    supply_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=200)] = 50,
) -> MovementListOut:
    filters = []
    if product_id:
        filters.append(InventoryMovement.product_id == product_id)
    if supply_id:
        filters.append(InventoryMovement.supply_id == supply_id)
    base = select(InventoryMovement).where(*filters)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    query = (
        select(InventoryMovement, AdminUser.name, Order.number)
        .outerjoin(AdminUser, AdminUser.id == InventoryMovement.actor_id)
        .outerjoin(Order, Order.id == InventoryMovement.order_id)
        .order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    query = query.where(*filters)
    rows = (await db.execute(query)).all()
    return MovementListOut(
        items=[
            MovementOut(
                id=m.id,
                product_id=m.product_id,
                product_name=m.product.name,
                reason=m.reason,
                reason_label=svc.movement_label(m.reason),
                delta=m.delta,
                delta_label=_qty(m.product, m.delta, signed=True),
                balance_after=m.balance_after,
                balance_label=_qty(m.product, m.balance_after),
                comment=m.comment,
                order_id=m.order_id,
                order_number=f"NSB-{number}" if number else None,
                supply_id=m.supply_id,
                actor_name=actor_name or ("Система" if m.order_id else None),
                created_at=m.created_at,
            )
            for m, actor_name, number in rows
        ],
        total=total,
    )
