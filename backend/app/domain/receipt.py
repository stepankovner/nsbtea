"""Позиции чека 54-ФЗ (SPEC 5).

Каждая строка заказа — отдельная позиция, количество 1, цена = итог строки.
Скидки и баллы распределяются по позициям пропорционально так, чтобы сумма позиций
равнялась сумме оплаты; остаток копеек — на самую дорогую позицию.
Доставка — отдельная позиция-услуга.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.errors import DomainError

DELIVERY_ITEM_NAME = "Доставка"


def allocate(total: int, weights: Sequence[int]) -> list[int]:
    """Разделить `total` пропорционально `weights` в целых единицах.

    Остаток после округления вниз отдаётся самой «тяжёлой» позиции; если ей не хватает
    ёмкости (доля не может превышать вес), — следующей по весу.
    """
    if total < 0 or any(w < 0 for w in weights):
        raise DomainError("Суммы для распределения не могут быть отрицательными")
    weight_sum = sum(weights)
    if total > weight_sum:
        raise DomainError("Скидка больше суммы, на которую она распределяется")
    if total == 0:
        return [0] * len(weights)

    shares = [total * w // weight_sum for w in weights]
    remainder = total - sum(shares)
    order = sorted(range(len(weights)), key=lambda i: (-weights[i], i))
    for i in order:
        if remainder == 0:
            break
        room = weights[i] - shares[i]
        add = min(room, remainder)
        shares[i] += add
        remainder -= add
    return shares


@dataclass(frozen=True, slots=True)
class ReceiptSource:
    name: str
    amount_kop: int  # итог строки после товарной скидки и скидки на заказ


@dataclass(frozen=True, slots=True)
class ReceiptItem:
    name: str
    amount_kop: int
    is_service: bool = False


def build_receipt(
    lines: Sequence[ReceiptSource], *, points_kop: int, delivery_kop: int
) -> list[ReceiptItem]:
    goods_total = sum(line.amount_kop for line in lines)
    if points_kop > goods_total:
        raise DomainError("Баллами нельзя оплатить больше стоимости товаров")
    points_shares = allocate(points_kop, [line.amount_kop for line in lines])
    items = [
        ReceiptItem(name=line.name, amount_kop=line.amount_kop - share)
        for line, share in zip(lines, points_shares, strict=True)
        if line.amount_kop - share > 0
    ]
    if delivery_kop > 0:
        items.append(ReceiptItem(name=DELIVERY_ITEM_NAME, amount_kop=delivery_kop, is_service=True))
    return items
