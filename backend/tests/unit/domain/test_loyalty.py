"""Баллы (SPEC 7.1): 1 балл = 1 ₽; начисление 5% от оплаченного деньгами за товары,
округление вниз; списание до 50% стоимости товаров после всех скидок."""

import pytest

from app.domain.errors import DomainError
from app.domain.loyalty import (
    LoyaltyRules,
    max_points_to_spend,
    points_to_earn,
    proportional_points,
    resolve_points_to_spend,
    revocable_points,
)

RULES = LoyaltyRules(earn_percent=5, max_spend_percent=50)


class TestRules:
    def test_defaults(self) -> None:
        rules = LoyaltyRules()
        assert rules.earn_percent == 5
        assert rules.max_spend_percent == 50

    @pytest.mark.parametrize(("earn", "spend"), [(-1, 50), (101, 50), (5, -1), (5, 101)])
    def test_invalid(self, earn: int, spend: int) -> None:
        with pytest.raises(DomainError):
            LoyaltyRules(earn_percent=earn, max_spend_percent=spend)


class TestMaxSpend:
    def test_half_of_items(self) -> None:
        assert (
            max_points_to_spend(items_after_discounts_kop=200_000, balance=5_000, rules=RULES)
            == 1_000
        )

    def test_limited_by_balance(self) -> None:
        assert (
            max_points_to_spend(items_after_discounts_kop=200_000, balance=300, rules=RULES) == 300
        )

    def test_rounds_down_to_whole_points(self) -> None:
        # 50% от 999 ₽ = 499,5 → 499 баллов
        assert (
            max_points_to_spend(items_after_discounts_kop=99_900, balance=5_000, rules=RULES) == 499
        )

    def test_zero_balance(self) -> None:
        assert max_points_to_spend(items_after_discounts_kop=100_000, balance=0, rules=RULES) == 0

    def test_negative_balance_treated_as_zero(self) -> None:
        assert max_points_to_spend(items_after_discounts_kop=100_000, balance=-10, rules=RULES) == 0


class TestResolveSpend:
    def test_within_limit(self) -> None:
        assert (
            resolve_points_to_spend(
                200, items_after_discounts_kop=100_000, balance=500, rules=RULES
            )
            == 200
        )

    def test_clamped_to_max(self) -> None:
        assert (
            resolve_points_to_spend(
                900, items_after_discounts_kop=100_000, balance=5_000, rules=RULES
            )
            == 500
        )

    def test_negative_rejected(self) -> None:
        with pytest.raises(DomainError):
            resolve_points_to_spend(-1, items_after_discounts_kop=100_000, balance=500, rules=RULES)


class TestEarn:
    def test_five_percent_of_money_paid(self) -> None:
        # 2 000 ₽ товаров, 300 баллами → деньгами 1 700 ₽ → 85 баллов
        assert (
            points_to_earn(items_after_discounts_kop=200_000, points_spent=300, rules=RULES) == 85
        )

    def test_rounds_down(self) -> None:
        # 5% от 999 ₽ = 49,95 → 49
        assert points_to_earn(items_after_discounts_kop=99_900, points_spent=0, rules=RULES) == 49

    def test_delivery_is_not_counted(self) -> None:
        # функция принимает только сумму товаров — доставка в неё не передаётся по определению
        assert points_to_earn(items_after_discounts_kop=0, points_spent=0, rules=RULES) == 0

    def test_zero_percent(self) -> None:
        rules = LoyaltyRules(earn_percent=0, max_spend_percent=50)
        assert points_to_earn(items_after_discounts_kop=100_000, points_spent=0, rules=rules) == 0


class TestRefundProportions:
    def test_full(self) -> None:
        assert proportional_points(points=333, part_kop=100_000, whole_kop=100_000) == 333

    def test_half(self) -> None:
        assert proportional_points(points=100, part_kop=50_000, whole_kop=100_000) == 50

    def test_rounding_half_up(self) -> None:
        # 3 балла × 1/2 = 1,5 → 2
        assert proportional_points(points=3, part_kop=1, whole_kop=2) == 2

    def test_part_cannot_exceed_whole(self) -> None:
        with pytest.raises(DomainError):
            proportional_points(points=10, part_kop=3, whole_kop=2)

    def test_zero_whole(self) -> None:
        assert proportional_points(points=10, part_kop=0, whole_kop=0) == 0


class TestRevocable:
    def test_cannot_take_more_than_balance(self) -> None:
        assert revocable_points(requested=100, balance=40) == 40

    def test_all(self) -> None:
        assert revocable_points(requested=100, balance=400) == 100

    def test_negative_balance(self) -> None:
        assert revocable_points(requested=100, balance=-5) == 0
