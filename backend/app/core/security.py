"""Пароли, токены сессий, одноразовые коды."""

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 10


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str, secret: str) -> str:
    """Токены и коды храним только в виде HMAC — утечка БД не даёт войти."""
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def new_numeric_code(digits: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(digits))


def new_human_code(length: int = 8) -> str:
    """Код для ввода руками/в Telegram: без похожих символов (0/O, 1/I)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def tokens_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
