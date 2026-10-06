"""Ограничение частоты: вход, коды, формы заявок (SPEC 13: rate limiting)."""

import math
from collections import defaultdict
from typing import Protocol

from redis.asyncio import Redis

from app.core.clock import Clock
from app.domain.errors import DomainError


class TooManyRequestsError(DomainError):
    code = "too_many_requests"
    http_status = 429


def _message(retry_after: int) -> str:
    minutes = max(1, math.ceil(retry_after / 60))
    return f"Слишком много попыток. Попробуйте через {minutes} мин."


class RateLimiter(Protocol):
    async def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        """Засчитать попытку; если лимит исчерпан — TooManyRequestsError."""

    async def reset(self, key: str) -> None: ...


class MemoryRateLimiter:
    """Для тестов и разработки без Redis."""

    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        now = self._clock.now().timestamp()
        hits = [t for t in self._hits[key] if t > now - window_seconds]
        if len(hits) >= limit:
            self._hits[key] = hits
            raise TooManyRequestsError(_message(int(hits[0] + window_seconds - now)))
        hits.append(now)
        self._hits[key] = hits

    async def reset(self, key: str) -> None:
        self._hits.pop(key, None)


class RedisRateLimiter:
    """Фиксированное окно в Redis: INCR + EXPIRE."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        full_key = f"rl:{key}"
        count = await self._redis.incr(full_key)
        if count == 1:
            await self._redis.expire(full_key, window_seconds)
        if count > limit:
            ttl = await self._redis.ttl(full_key)
            raise TooManyRequestsError(_message(ttl if ttl > 0 else window_seconds))

    async def reset(self, key: str) -> None:
        await self._redis.delete(f"rl:{key}")
