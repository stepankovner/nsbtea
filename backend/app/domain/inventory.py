"""Остатки и движения склада (SPEC 3.3, 10.4).

Остаток весового чая — в граммах, штучного товара — в штуках.
Здесь только правила; атомарное изменение остатка делает сервис в БД.
"""

import uuid
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum

from app.domain.errors import DomainError, InsufficientStockError
from app.domain.money import NBSP
from app.domain.pricing import ProductType

MAX_SINGLE_SUPPLY = 1_000_000


class MovementReason(StrEnum):
    SUPPLY = "supply"
    SALE = "sale"
    CANCEL = "cancel"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"
    WRITEOFF = "writeoff"


MOVEMENT_LABELS: dict[MovementReason, str] = {
    MovementReason.SUPPLY: "Поставка",
    MovementReason.SALE: "Продажа",
    MovementReason.CANCEL: "Отмена заказа",
    MovementReason.REFUND: "Возврат",
    MovementReason.ADJUSTMENT: "Инвентаризация",
    MovementReason.WRITEOFF: "Списание",
}


class StockLevel(StrEnum):
    OK = "ok"
    LOW = "low"
    OUT = "out"


def format_qty(product_type: ProductType, qty: int) -> str:
    digits = f"{qty:,}".replace(",", NBSP)
    return f"{digits} г" if product_type is ProductType.TEA else f"{digits} шт."


def _ensure_positive(qty: int) -> None:
    if qty <= 0:
        raise DomainError("Количество должно быть больше нуля", field="qty")


def validate_supply_qty(product_type: ProductType, qty: int) -> None:
    _ensure_positive(qty)
    if qty > MAX_SINGLE_SUPPLY:
        raise DomainError(
            f"Слишком много для одной поставки ({format_qty(product_type, qty)}) — проверьте число",
            field="qty",
        )


def validate_writeoff(product_type: ProductType, *, current: int, qty: int) -> None:
    _ensure_positive(qty)
    if qty > current:
        raise InsufficientStockError(
            f"Нельзя списать {format_qty(product_type, qty)}: "
            f"на складе {format_qty(product_type, current)}"
        )


def adjustment_delta(*, current: int, actual: int) -> int:
    if actual < 0:
        raise DomainError("Фактический остаток не может быть меньше нуля", field="actual")
    return actual - current


def stock_level(stock: int, threshold: int) -> StockLevel:
    if stock <= 0:
        return StockLevel.OUT
    if stock <= threshold:
        return StockLevel.LOW
    return StockLevel.OK


@dataclass(frozen=True, slots=True)
class CartQuantity:
    product_id: uuid.UUID
    product_name: str
    type: ProductType
    amount: int  # граммы (чай) или штуки


@dataclass(frozen=True, slots=True)
class StockProblem:
    product_id: uuid.UUID
    product_name: str
    available: int
    requested: int
    message: str


def check_cart_against_stock(
    lines: Iterable[CartQuantity], stock: Mapping[uuid.UUID, int]
) -> list[StockProblem]:
    """Суммарное количество одного товара по всем строкам не может превышать остаток."""
    totals: dict[uuid.UUID, int] = defaultdict(int)
    meta: dict[uuid.UUID, CartQuantity] = {}
    for line in lines:
        totals[line.product_id] += line.amount
        meta.setdefault(line.product_id, line)

    problems: list[StockProblem] = []
    for product_id, requested in totals.items():
        available = max(stock.get(product_id, 0), 0)
        if requested <= available:
            continue
        info = meta[product_id]
        if available == 0:
            message = f"«{info.product_name}»: нет в наличии"
        else:
            message = (
                f"«{info.product_name}»: доступно не больше {format_qty(info.type, available)}, "
                f"в корзине {format_qty(info.type, requested)}"
            )
        problems.append(
            StockProblem(
                product_id=product_id,
                product_name=info.product_name,
                available=available,
                requested=requested,
                message=message,
            )
        )
    return problems


@dataclass(frozen=True, slots=True)
class AlertState:
    low_notified: bool
    out_notified: bool


@dataclass(frozen=True, slots=True)
class AlertDecision:
    notify_low: bool
    notify_out: bool
    state: AlertState


def stock_alerts(*, before: int, after: int, threshold: int, state: AlertState) -> AlertDecision:
    """Решить, слать ли уведомление «осталось мало» / «закончился».

    «Мало» — один раз при пересечении порога; повторно — только после пополнения выше порога.
    «Закончился» — сразу при обнулении; повторно — только после пополнения.
    """
    del before  # решение зависит только от нового значения и памяти о прошлых уведомлениях
    level = stock_level(after, threshold)
    if level is StockLevel.OK:
        return AlertDecision(False, False, AlertState(low_notified=False, out_notified=False))
    if level is StockLevel.OUT:
        notify_out = not state.out_notified
        return AlertDecision(False, notify_out, AlertState(low_notified=True, out_notified=True))
    notify_low = not state.low_notified
    return AlertDecision(notify_low, False, AlertState(low_notified=True, out_notified=False))
