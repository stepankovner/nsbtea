"""Источник текущего времени. Время хранится в UTC; в тестах подменяется."""

from datetime import UTC, datetime, timedelta


class Clock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FrozenClock(Clock):
    def __init__(self, at: datetime) -> None:
        if at.tzinfo is None:
            raise ValueError("время должно быть с часовым поясом")
        self._at = at

    def now(self) -> datetime:
        return self._at

    def set(self, at: datetime) -> None:
        self._at = at

    def advance(self, **kwargs: float) -> None:
        self._at += timedelta(**kwargs)
