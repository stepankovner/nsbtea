"""Деньги: только целые копейки, округление half-up до рубля."""

import pytest

from app.domain.money import (
    format_rub,
    percent_of_rub,
    round_half_up_div,
    round_to_rub,
)


class TestRoundHalfUpDiv:
    @pytest.mark.parametrize(
        ("num", "den", "expected"),
        [
            (0, 7, 0),
            (10, 5, 2),
            (5, 2, 3),  # 2.5 → 3
            (4, 3, 1),  # 1.33 → 1
            (5, 3, 2),  # 1.67 → 2
            (149, 100, 1),
            (150, 100, 2),  # ровно половина — вверх
            (250, 100, 3),  # «банковское» округление дало бы 2
        ],
    )
    def test_values(self, num: int, den: int, expected: int) -> None:
        assert round_half_up_div(num, den) == expected

    def test_rejects_negative(self) -> None:
        with pytest.raises(ValueError, match="отрицательн"):
            round_half_up_div(-1, 2)

    def test_rejects_zero_denominator(self) -> None:
        with pytest.raises(ValueError, match="делитель"):
            round_half_up_div(1, 0)


class TestRoundToRub:
    @pytest.mark.parametrize(
        ("kop", "expected"),
        [
            (0, 0),
            (49, 0),
            (50, 100),  # 0,50 ₽ → 1 ₽
            (12_345, 12_300),
            (12_350, 12_400),
            (99_999, 100_000),
        ],
    )
    def test_values(self, kop: int, expected: int) -> None:
        assert round_to_rub(kop) == expected


class TestPercentOfRub:
    def test_percent_rounded_to_whole_rubles(self) -> None:
        # 20% от 1 255 ₽ = 251 ₽
        assert percent_of_rub(125_500, 20) == 25_100

    def test_half_rouble_rounds_up(self) -> None:
        # 10% от 125 ₽ = 12,5 ₽ → 13 ₽
        assert percent_of_rub(12_500, 10) == 1_300

    def test_zero_percent(self) -> None:
        assert percent_of_rub(100_000, 0) == 0

    def test_hundred_percent(self) -> None:
        assert percent_of_rub(100_000, 100) == 100_000

    def test_percent_out_of_range(self) -> None:
        with pytest.raises(ValueError, match="процент"):
            percent_of_rub(100, 101)
        with pytest.raises(ValueError, match="процент"):
            percent_of_rub(100, -1)


class TestFormatRub:
    @pytest.mark.parametrize(
        ("kop", "expected"),
        [
            (0, "0 ₽"),
            (90_000, "900 ₽"),
            (120_000, "1 200 ₽"),
            (1_234_567_00, "1 234 567 ₽"),
            (12_350, "123,50 ₽"),
            (5, "0,05 ₽"),
        ],
    )
    def test_format(self, kop: int, expected: str) -> None:
        # Разделитель тысяч — неразрывный пробел, как принято в русской типографике
        assert format_rub(kop) == expected.replace(" ", " ")

    def test_negative(self) -> None:
        assert format_rub(-50_000) == "−500 ₽"
