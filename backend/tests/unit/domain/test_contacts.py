"""Нормализация контактов и ЧПУ."""

import pytest

from app.domain.contacts import normalize_email, normalize_phone, normalize_telegram
from app.domain.errors import DomainError
from app.domain.slugs import slugify


class TestPhone:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("+7 900 000-00-00", "+79000000000"),
            ("8 (900) 123-45-67", "+79001234567"),
            ("9001234567", "+79001234567"),
            ("7 900 123 45 67", "+79001234567"),
            (" +7(900)1234567 ", "+79001234567"),
        ],
    )
    def test_ok(self, raw: str, expected: str) -> None:
        assert normalize_phone(raw) == expected

    @pytest.mark.parametrize("raw", ["", "123", "+1 202 555 0100 55", "abc", "900123456"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(DomainError, match="телефон"):
            normalize_phone(raw)


class TestEmail:
    def test_lower_and_strip(self) -> None:
        assert normalize_email("  Nikita@Example.RU ") == "nikita@example.ru"

    @pytest.mark.parametrize("raw", ["", "nikita", "a@b", "a b@c.ru", "@c.ru"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(DomainError, match="почт"):
            normalize_email(raw)


class TestTelegram:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("@nikita_tea", "nikita_tea"),
            ("nikita_tea", "nikita_tea"),
            ("https://t.me/nikita_tea", "nikita_tea"),
            ("t.me/nikita_tea", "nikita_tea"),
        ],
    )
    def test_ok(self, raw: str, expected: str) -> None:
        assert normalize_telegram(raw) == expected

    @pytest.mark.parametrize("raw", ["", "@", "ab", "имя", "has space"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(DomainError, match="Telegram"):
            normalize_telegram(raw)


class TestSlugify:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Шу пуэр", "shu-puer"),
            ("Шэн пуэр «Иу» 2021", "shen-puer-iu-2021"),
            ("Да Хун Пао", "da-hun-pao"),
            ("Menghai 7572 (2019)", "menghai-7572-2019"),
            ("Чай   ---  недели", "chai-nedeli"),
            ("Жёлтый чай", "zheltyi-chai"),
            ("Щедрый ёж", "shchedryi-ezh"),
        ],
    )
    def test_values(self, raw: str, expected: str) -> None:
        assert slugify(raw) == expected

    def test_empty_gets_fallback(self) -> None:
        assert slugify("!!!") == "item"

    def test_max_length(self) -> None:
        assert len(slugify("а" * 300)) <= 80
