"""Доставка (SPEC 6): вес посылки, выбор коробки, бесплатная доставка от порога."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.domain.errors import DomainError
from app.domain.money import ceil_to_rub


@dataclass(frozen=True, slots=True)
class Box:
    code: str
    name: str
    max_weight_grams: int
    length_cm: int
    width_cm: int
    height_cm: int


def parcel_weight(
    *, tea_grams: int, unit_weights_grams: Iterable[int], packaging_grams: int
) -> int:
    units = list(unit_weights_grams)
    if tea_grams < 0 or packaging_grams < 0 or any(w < 0 for w in units):
        raise DomainError("Вес не может быть отрицательным")
    return tea_grams + sum(units) + packaging_grams


def choose_box(boxes: Sequence[Box], weight_grams: int) -> Box:
    """Самая маленькая коробка, в которую помещается вес; если ни одна — самая большая."""
    if not boxes:
        raise DomainError("В настройках доставки не задано ни одной коробки")
    by_capacity = sorted(boxes, key=lambda b: b.max_weight_grams)
    for box in by_capacity:
        if weight_grams <= box.max_weight_grams:
            return box
    return by_capacity[-1]


def delivery_price(*, base_kop: int, items_kop: int, free_from_kop: int | None) -> int:
    if free_from_kop is not None and items_kop >= free_from_kop:
        return 0
    return ceil_to_rub(base_kop)
