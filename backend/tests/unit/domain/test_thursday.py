"""«Чай недели» / акция четверга (SPEC 7.2, дизайн).

Режим «день»: скидка действует в четверг 00:00–23:59 МСК (как в ТЗ).
Режим «неделя»: с четверга 00:00 МСК до следующего четверга 00:00 МСК (как в дизайне).
"""

from datetime import UTC, date, datetime

import pytest

from app.domain.errors import DomainError
from app.domain.thursday import (
    ThursdayMode,
    active_thursday,
    needs_planning_reminder,
    promo_ends_on,
    thursday_window,
    upcoming_thursdays,
)


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


class TestUpcoming:
    def test_from_monday(self) -> None:
        # 5 октября 2026 — понедельник
        assert upcoming_thursdays(date(2026, 10, 5), count=3) == [
            date(2026, 10, 8),
            date(2026, 10, 15),
            date(2026, 10, 22),
        ]

    def test_today_thursday_included(self) -> None:
        assert upcoming_thursdays(date(2026, 10, 8), count=1) == [date(2026, 10, 8)]

    def test_default_eight(self) -> None:
        assert len(upcoming_thursdays(date(2026, 10, 5))) == 8


class TestWindow:
    def test_day_mode_in_moscow_time(self) -> None:
        start, end = thursday_window(date(2026, 10, 8), ThursdayMode.DAY)
        # МСК = UTC+3
        assert start == utc(2026, 10, 7, 21, 0)
        assert end == utc(2026, 10, 8, 21, 0)

    def test_week_mode(self) -> None:
        start, end = thursday_window(date(2026, 10, 8), ThursdayMode.WEEK)
        assert start == utc(2026, 10, 7, 21, 0)
        assert end == utc(2026, 10, 14, 21, 0)

    def test_not_thursday(self) -> None:
        with pytest.raises(DomainError, match="четверг"):
            thursday_window(date(2026, 10, 9), ThursdayMode.DAY)


class TestActive:
    PLANNED = (date(2026, 10, 8), date(2026, 10, 22))

    def test_thursday_morning_moscow(self) -> None:
        # 8 октября 00:30 МСК = 7 октября 21:30 UTC
        assert active_thursday(utc(2026, 10, 7, 21, 30), self.PLANNED, ThursdayMode.DAY) == date(
            2026, 10, 8
        )

    def test_wednesday_late_utc_but_thursday_not_started(self) -> None:
        assert active_thursday(utc(2026, 10, 7, 20, 59), self.PLANNED, ThursdayMode.DAY) is None

    def test_day_mode_friday_inactive(self) -> None:
        assert active_thursday(utc(2026, 10, 9, 12, 0), self.PLANNED, ThursdayMode.DAY) is None

    def test_week_mode_friday_active(self) -> None:
        assert active_thursday(utc(2026, 10, 9, 12, 0), self.PLANNED, ThursdayMode.WEEK) == date(
            2026, 10, 8
        )

    def test_week_mode_next_week_not_planned(self) -> None:
        # 15 октября не запланирован — с 15-го скидки нет
        assert active_thursday(utc(2026, 10, 15, 12, 0), self.PLANNED, ThursdayMode.WEEK) is None


class TestEndsOn:
    def test_day(self) -> None:
        assert promo_ends_on(date(2026, 10, 8), ThursdayMode.DAY) == date(2026, 10, 8)

    def test_week_is_next_thursday(self) -> None:
        # «до 15 октября» — как в дизайне: до следующего четверга
        assert promo_ends_on(date(2026, 10, 8), ThursdayMode.WEEK) == date(2026, 10, 15)


class TestReminder:
    def test_nothing_planned(self) -> None:
        assert needs_planning_reminder(date(2026, 10, 5), []) is True

    def test_only_past_planned(self) -> None:
        assert needs_planning_reminder(date(2026, 10, 5), [date(2026, 10, 1)]) is True

    def test_upcoming_planned(self) -> None:
        assert needs_planning_reminder(date(2026, 10, 5), [date(2026, 10, 8)]) is False
