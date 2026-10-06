"""Баллы лояльности (SPEC 7.1). 1 балл = 1 ₽."""

from dataclasses import dataclass
from enum import StrEnum

from app.domain.errors import DomainError
from app.domain.money import round_half_up_div


class PointsKind(StrEnum):
    EARN_PENDING = "earn_pending"  # информационно: «ожидают начисления» (на баланс не влияет)
    EARN = "earn"
    SPEND_RESERVE = "spend_reserve"
    SPEND = "spend"
    RELEASE = "release"
    REVERT = "revert"
    MANUAL = "manual"
    EXPIRE = "expire"


POINTS_KIND_LABELS: dict[PointsKind, str] = {
    PointsKind.EARN_PENDING: "Ожидают начисления",
    PointsKind.EARN: "Начислено за заказ",
    PointsKind.SPEND_RESERVE: "Списано в заказе",
    PointsKind.SPEND: "Списано в заказе",
    PointsKind.RELEASE: "Возвращено (заказ отменён)",
    PointsKind.REVERT: "Отменено начисление (возврат заказа)",
    PointsKind.MANUAL: "Изменено магазином",
    PointsKind.EXPIRE: "Сгорели",
}


@dataclass(frozen=True, slots=True)
class LoyaltyRules:
    earn_percent: int = 5
    max_spend_percent: int = 50

    def __post_init__(self) -> None:
        if not 0 <= self.earn_percent <= 100:
            raise DomainError("Процент начисления — от 0 до 100")
        if not 0 <= self.max_spend_percent <= 100:
            raise DomainError("Максимальная доля оплаты баллами — от 0 до 100%")


def max_points_to_spend(
    *, items_after_discounts_kop: int, balance: int, rules: LoyaltyRules
) -> int:
    limit = items_after_discounts_kop * rules.max_spend_percent // (100 * 100)
    return max(0, min(balance, limit))


def resolve_points_to_spend(
    requested: int, *, items_after_discounts_kop: int, balance: int, rules: LoyaltyRules
) -> int:
    if requested < 0:
        raise DomainError("Количество баллов не может быть отрицательным")
    allowed = max_points_to_spend(
        items_after_discounts_kop=items_after_discounts_kop, balance=balance, rules=rules
    )
    return min(requested, allowed)


def points_to_earn(
    *, items_after_discounts_kop: int, points_spent: int, rules: LoyaltyRules
) -> int:
    paid_with_money = max(0, items_after_discounts_kop - points_spent * 100)
    return paid_with_money * rules.earn_percent // (100 * 100)


def proportional_points(*, points: int, part_kop: int, whole_kop: int) -> int:
    """Доля баллов при частичном возврате: points × part / whole (half-up)."""
    if whole_kop == 0:
        return 0
    if part_kop > whole_kop or part_kop < 0:
        raise DomainError("Сумма возврата больше суммы заказа")
    if part_kop == whole_kop:
        return points
    return round_half_up_div(points * part_kop, whole_kop)


def revocable_points(*, requested: int, balance: int) -> int:
    """Сколько начисленных баллов реально можно забрать — баланс не уходит в минус."""
    return max(0, min(requested, balance))
