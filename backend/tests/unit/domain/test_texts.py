"""Русские даты и склонения для интерфейса."""

from datetime import date

import pytest

from app.domain.texts import day_month, normalize_search, plural, weekday_short


@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (1, "место"),
        (2, "места"),
        (4, "места"),
        (5, "мест"),
        (11, "мест"),
        (12, "мест"),
        (21, "место"),
        (22, "места"),
        (25, "мест"),
        (101, "место"),
        (111, "мест"),
        (0, "мест"),
    ],
)
def test_plural(n: int, expected: str) -> None:
    assert plural(n, "место", "места", "мест") == expected


def test_day_month() -> None:
    assert day_month(date(2026, 10, 8)) == "8 октября"
    assert day_month(date(2026, 3, 1)) == "1 марта"


def test_weekday_short() -> None:
    assert weekday_short(date(2026, 10, 10)) == "Сб"
    assert weekday_short(date(2026, 10, 5)) == "Пн"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Шу Пуэр", "шу пуер"),
        ("Жёлтый  чай", "желтый чай"),
        ("  ПУЭР ", "пуер"),
    ],
)
def test_normalize_search(raw: str, expected: str) -> None:
    assert normalize_search(raw) == expected
