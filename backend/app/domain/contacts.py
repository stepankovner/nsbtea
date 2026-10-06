"""Нормализация контактов: телефон, email, Telegram."""

import re

from app.domain.errors import DomainError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
_TELEGRAM_RE = re.compile(r"^[A-Za-z0-9_]{4,32}$")


def normalize_phone(raw: str) -> str:
    """Российский номер → +7XXXXXXXXXX."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10 or digits[0] not in "3456789":
        raise DomainError("Проверьте номер телефона: нужно 10 цифр после +7", field="phone")
    return f"+7{digits}"


def normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not _EMAIL_RE.match(email):
        raise DomainError("Проверьте адрес почты — например, name@mail.ru", field="email")
    return email


def normalize_telegram(raw: str) -> str:
    value = (raw or "").strip()
    value = re.sub(r"^(https?://)?(t\.me|telegram\.me)/", "", value)
    value = value.lstrip("@")
    if not _TELEGRAM_RE.match(value):
        raise DomainError("Проверьте ник в Telegram — например, @nsbtea", field="telegram")
    return value


def phone_digits(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")
