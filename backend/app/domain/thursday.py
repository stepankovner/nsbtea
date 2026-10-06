"""Акция четверга / «Чай недели».

Владелец заранее отмечает товары на конкретные четверги. Скидка действует:
- режим DAY  — в сам четверг, 00:00–23:59 по Москве (так в ТЗ);
- режим WEEK — с четверга 00:00 до следующего четверга 00:00 по Москве (так в дизайне).
Режим — настройка магазина.
"""

from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

from app.domain.errors import DomainError

MSK = ZoneInfo("Europe/Moscow")
THURSDAY = 3  # date.weekday(): понедельник = 0


class ThursdayMode(StrEnum):
    DAY = "day"
    WEEK = "week"


def upcoming_thursdays(today: date, count: int = 8) -> list[date]:
    first = today + timedelta(days=(THURSDAY - today.weekday()) % 7)
    return [first + timedelta(weeks=i) for i in range(count)]


def _msk_midnight_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=MSK).astimezone(UTC)


def thursday_window(thursday: date, mode: ThursdayMode) -> tuple[datetime, datetime]:
    if thursday.weekday() != THURSDAY:
        raise DomainError(f"{thursday:%d.%m.%Y} — не четверг")
    days = 1 if mode is ThursdayMode.DAY else 7
    return _msk_midnight_utc(thursday), _msk_midnight_utc(thursday + timedelta(days=days))


def active_thursday(now: datetime, planned: Iterable[date], mode: ThursdayMode) -> date | None:
    for thursday in sorted(set(planned), reverse=True):
        start, end = thursday_window(thursday, mode)
        if start <= now < end:
            return thursday
    return None


def promo_ends_on(thursday: date, mode: ThursdayMode) -> date:
    """Дата для подписи «до …»: в режиме недели — следующий четверг, в режиме дня — сам четверг."""
    return thursday if mode is ThursdayMode.DAY else thursday + timedelta(weeks=1)


def needs_planning_reminder(today: date, planned: Iterable[date]) -> bool:
    """Нужно напомнить владельцу: впереди не запланировано ни одного четверга."""
    return not any(day >= today for day in planned)


def msk_today(now: datetime) -> date:
    return now.astimezone(MSK).date()
