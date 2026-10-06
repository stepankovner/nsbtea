"""Базовые утилиты: UUID v7, пароли, токены, коды."""

import time
import uuid
from datetime import UTC, datetime

import pytest

from app.core.clock import FrozenClock
from app.core.ids import uuid7
from app.core.security import (
    hash_password,
    hash_token,
    new_human_code,
    new_numeric_code,
    new_token,
    tokens_equal,
    verify_password,
)


class TestUuid7:
    def test_version_and_variant(self) -> None:
        value = uuid7()
        assert value.version == 7
        assert value.variant == uuid.RFC_4122

    def test_sortable_by_time(self) -> None:
        first = uuid7()
        time.sleep(0.002)
        second = uuid7()
        assert first < second

    def test_unique(self) -> None:
        assert len({uuid7() for _ in range(1000)}) == 1000


class TestPasswords:
    def test_roundtrip(self) -> None:
        hashed = hash_password("чайный-пароль-123")
        assert hashed != "чайный-пароль-123"
        assert verify_password(hashed, "чайный-пароль-123")
        assert not verify_password(hashed, "другой")

    def test_garbage_hash(self) -> None:
        assert not verify_password("not-a-hash", "x")


class TestTokens:
    def test_token_entropy(self) -> None:
        assert len(new_token()) >= 40
        assert new_token() != new_token()

    def test_hash_depends_on_secret(self) -> None:
        assert hash_token("abc", "s1") != hash_token("abc", "s2")
        assert hash_token("abc", "s1") == hash_token("abc", "s1")

    def test_numeric_code(self) -> None:
        code = new_numeric_code()
        assert len(code) == 6
        assert code.isdigit()

    def test_human_code_has_no_ambiguous_chars(self) -> None:
        for _ in range(200):
            code = new_human_code()
            assert not set(code) & set("01OI")

    def test_equal(self) -> None:
        assert tokens_equal("a", "a")
        assert not tokens_equal("a", "b")


class TestClock:
    def test_frozen_requires_tz(self) -> None:
        with pytest.raises(ValueError, match="пояс"):
            FrozenClock(datetime(2026, 1, 1))  # noqa: DTZ001

    def test_advance(self) -> None:
        clock = FrozenClock(datetime(2026, 1, 1, tzinfo=UTC))
        clock.advance(minutes=31)
        assert clock.now() == datetime(2026, 1, 1, 0, 31, tzinfo=UTC)
