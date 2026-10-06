"""Распределение скидок и баллов по позициям чека (SPEC 5).

Сумма позиций = сумме оплаты; остаток копеек — на самую дорогую позицию.
"""

import pytest

from app.domain.errors import DomainError
from app.domain.receipt import ReceiptSource, allocate, build_receipt


class TestAllocate:
    def test_exact(self) -> None:
        assert allocate(300, [100, 200]) == [100, 200]

    def test_remainder_goes_to_most_expensive(self) -> None:
        assert allocate(20_000, [100_000, 50_000, 30_000]) == [11_112, 5_555, 3_333]

    def test_remainder_to_most_expensive_regardless_of_order(self) -> None:
        assert allocate(20_000, [30_000, 100_000, 50_000]) == [3_333, 11_112, 5_555]

    def test_never_exceeds_weight(self) -> None:
        # почти 100% скидка: остаток не может «переполнить» самую дорогую позицию
        weights = [1, 1, 1, 1, 5]
        result = allocate(8, weights)
        assert sum(result) == 8
        assert all(r <= w for r, w in zip(result, weights, strict=True))

    def test_zero_total(self) -> None:
        assert allocate(0, [10, 20]) == [0, 0]

    def test_empty(self) -> None:
        assert allocate(0, []) == []

    def test_total_bigger_than_weights(self) -> None:
        with pytest.raises(DomainError):
            allocate(31, [10, 20])

    def test_zero_weights_with_positive_total(self) -> None:
        with pytest.raises(DomainError):
            allocate(1, [0, 0])

    @pytest.mark.parametrize("total", [1, 7, 99, 1_000, 33_333])
    def test_sum_property(self, total: int) -> None:
        weights = [33_300, 77_700, 300_300, 1]
        result = allocate(total, weights)
        assert sum(result) == total
        assert all(0 <= r <= w for r, w in zip(result, weights, strict=True))


class TestBuildReceipt:
    def test_points_spread_and_delivery_separate(self) -> None:
        items = build_receipt(
            [
                ReceiptSource(name="Да Хун Пао, 100 г", amount_kop=100_000),
                ReceiptSource(name="Шу пуэр, 50 г", amount_kop=50_000),
                ReceiptSource(name="Чашка", amount_kop=30_000),
            ],
            points_kop=20_000,
            delivery_kop=35_000,
        )
        assert [(i.name, i.amount_kop, i.is_service) for i in items] == [
            ("Да Хун Пао, 100 г", 88_888, False),
            ("Шу пуэр, 50 г", 44_445, False),
            ("Чашка", 26_667, False),
            ("Доставка", 35_000, True),
        ]
        assert sum(i.amount_kop for i in items) == 180_000 - 20_000 + 35_000

    def test_free_delivery_not_in_receipt(self) -> None:
        items = build_receipt([ReceiptSource(name="Шу", amount_kop=100_000)], points_kop=0, delivery_kop=0)
        assert len(items) == 1

    def test_points_cannot_exceed_goods(self) -> None:
        with pytest.raises(DomainError):
            build_receipt([ReceiptSource(name="Шу", amount_kop=100)], points_kop=200, delivery_kop=0)

    def test_zero_amount_lines_are_dropped(self) -> None:
        # позиция, полностью покрытая скидкой, не может уйти в чек с нулевой суммой
        items = build_receipt(
            [ReceiptSource(name="Подарок", amount_kop=0), ReceiptSource(name="Шу", amount_kop=1_000)],
            points_kop=0,
            delivery_kop=0,
        )
        assert [i.name for i in items] == ["Шу"]
