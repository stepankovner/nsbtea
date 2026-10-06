"""Остатки: проверки списаний, корзины, инвентаризации и уведомлений (SPEC 3.3, 10.4, 11.1)."""

import uuid

import pytest

from app.domain.errors import DomainError, InsufficientStockError
from app.domain.inventory import (
    AlertState,
    CartQuantity,
    StockLevel,
    adjustment_delta,
    check_cart_against_stock,
    format_qty,
    stock_alerts,
    stock_level,
    validate_supply_qty,
    validate_writeoff,
)
from app.domain.pricing import ProductType

TEA = ProductType.TEA
UNIT = ProductType.UNIT


class TestFormatQty:
    def test_tea(self) -> None:
        assert format_qty(TEA, 150) == "150 г"

    def test_tea_kilograms_stay_grams(self) -> None:
        assert format_qty(TEA, 1500) == "1 500 г"

    def test_unit(self) -> None:
        assert format_qty(UNIT, 3) == "3 шт."


class TestWriteoff:
    def test_ok(self) -> None:
        validate_writeoff(TEA, current=150, qty=100)

    def test_more_than_stock(self) -> None:
        with pytest.raises(InsufficientStockError) as exc:
            validate_writeoff(TEA, current=150, qty=200)
        assert exc.value.message == "Нельзя списать 200 г: на складе 150 г"

    def test_units_message(self) -> None:
        with pytest.raises(InsufficientStockError) as exc:
            validate_writeoff(UNIT, current=1, qty=2)
        assert exc.value.message == "Нельзя списать 2 шт.: на складе 1 шт."

    def test_non_positive(self) -> None:
        with pytest.raises(DomainError, match="больше нуля"):
            validate_writeoff(TEA, current=150, qty=0)


class TestSupply:
    def test_positive_ok(self) -> None:
        validate_supply_qty(TEA, 500)

    def test_zero_rejected(self) -> None:
        with pytest.raises(DomainError, match="больше нуля"):
            validate_supply_qty(TEA, 0)

    def test_absurdly_large_rejected(self) -> None:
        # защита от опечатки: 1 000 000 г за одну поставку — скорее ошибка ввода
        with pytest.raises(DomainError, match="проверьте"):
            validate_supply_qty(TEA, 1_000_001)


class TestAdjustment:
    def test_positive_difference(self) -> None:
        assert adjustment_delta(current=100, actual=130) == 30

    def test_negative_difference(self) -> None:
        assert adjustment_delta(current=100, actual=40) == -60

    def test_no_difference(self) -> None:
        assert adjustment_delta(current=100, actual=100) == 0

    def test_actual_cannot_be_negative(self) -> None:
        with pytest.raises(DomainError, match="меньше нуля"):
            adjustment_delta(current=100, actual=-1)


class TestStockLevel:
    @pytest.mark.parametrize(
        ("stock", "threshold", "expected"),
        [
            (0, 50, StockLevel.OUT),
            (1, 50, StockLevel.LOW),
            (50, 50, StockLevel.LOW),  # «столько или меньше» — мало
            (51, 50, StockLevel.OK),
            (3, 2, StockLevel.OK),
            (2, 2, StockLevel.LOW),
        ],
    )
    def test_levels(self, stock: int, threshold: int, expected: StockLevel) -> None:
        assert stock_level(stock, threshold) is expected


class TestCartAgainstStock:
    def test_sum_of_lines_for_same_tea(self) -> None:
        pid = uuid.uuid4()
        lines = [
            CartQuantity(product_id=pid, product_name="Да Хун Пао", type=TEA, amount=100),
            CartQuantity(product_id=pid, product_name="Да Хун Пао", type=TEA, amount=50),
        ]
        problems = check_cart_against_stock(lines, {pid: 120})
        assert len(problems) == 1
        assert problems[0].product_id == pid
        assert problems[0].available == 120
        assert problems[0].requested == 150
        assert problems[0].message == "«Да Хун Пао»: доступно не больше 120 г, в корзине 150 г"

    def test_ok(self) -> None:
        pid = uuid.uuid4()
        lines = [CartQuantity(product_id=pid, product_name="Чашка", type=UNIT, amount=2)]
        assert check_cart_against_stock(lines, {pid: 2}) == []

    def test_missing_product_means_zero(self) -> None:
        pid = uuid.uuid4()
        lines = [CartQuantity(product_id=pid, product_name="Чашка", type=UNIT, amount=1)]
        problems = check_cart_against_stock(lines, {})
        assert problems[0].available == 0
        assert problems[0].message == "«Чашка»: нет в наличии"


class TestStockAlerts:
    def test_crossing_threshold_notifies_once(self) -> None:
        state = AlertState(low_notified=False, out_notified=False)
        decision = stock_alerts(before=60, after=40, threshold=50, state=state)
        assert decision.notify_low
        assert not decision.notify_out
        assert decision.state == AlertState(low_notified=True, out_notified=False)

        again = stock_alerts(before=40, after=30, threshold=50, state=decision.state)
        assert not again.notify_low

    def test_resets_after_replenish_above_threshold(self) -> None:
        state = AlertState(low_notified=True, out_notified=False)
        decision = stock_alerts(before=30, after=500, threshold=50, state=state)
        assert decision.state == AlertState(low_notified=False, out_notified=False)
        assert not decision.notify_low

    def test_replenish_still_below_threshold_does_not_renotify(self) -> None:
        state = AlertState(low_notified=True, out_notified=True)
        decision = stock_alerts(before=0, after=20, threshold=50, state=state)
        assert not decision.notify_low
        assert decision.state == AlertState(low_notified=True, out_notified=False)

    def test_out_of_stock(self) -> None:
        state = AlertState(low_notified=False, out_notified=False)
        decision = stock_alerts(before=100, after=0, threshold=50, state=state)
        assert decision.notify_out
        assert not decision.notify_low  # сразу «закончился», без «осталось мало»
        assert decision.state == AlertState(low_notified=True, out_notified=True)

    def test_out_twice_notifies_once(self) -> None:
        state = AlertState(low_notified=True, out_notified=True)
        decision = stock_alerts(before=0, after=0, threshold=50, state=state)
        assert not decision.notify_out

    def test_out_again_after_partial_restock(self) -> None:
        state = AlertState(low_notified=True, out_notified=False)
        decision = stock_alerts(before=20, after=0, threshold=50, state=state)
        assert decision.notify_out
