"""Русские тексты: склонения, даты, нормализация для поиска."""

from datetime import date

MONTHS_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
WEEKDAYS_SHORT = ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")


def plural(n: int, one: str, few: str, many: str) -> str:
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def day_month(value: date) -> str:
    return f"{value.day} {MONTHS_GENITIVE[value.month - 1]}"


def weekday_short(value: date) -> str:
    return WEEKDAYS_SHORT[value.weekday()]


def normalize_search(text: str) -> str:
    """Для поиска «ё», «э» и «е» считаем одной буквой: «пуер» найдёт «пуэр»."""
    lowered = text.lower().replace("ё", "е").replace("э", "е")
    return " ".join(lowered.split())
