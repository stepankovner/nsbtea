"""Вход покупателя без пароля: код на email (6 цифр, 10 минут), Telegram Login Widget."""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from pydantic import SecretStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.security import hash_token, new_numeric_code, new_token, tokens_equal
from app.domain.contacts import normalize_email
from app.domain.errors import AuthRequiredError, ConflictError, InvalidCodeError
from app.models import Customer, CustomerSession, LoginCode
from app.services.emails import login_code_email
from app.services.outbox import enqueue_email

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
TELEGRAM_MAX_AGE = timedelta(days=1)


@dataclass(frozen=True, slots=True)
class CustomerTokens:
    token: str
    customer: Customer
    expires_at: datetime


async def request_code(
    db: AsyncSession, container: Container, *, email: str, ip: str | None
) -> str:
    email = normalize_email(email)
    await container.rate_limiter.hit(f"login-code-min:{email}", limit=1, window_seconds=60)
    await container.rate_limiter.hit(f"login-code-hour:{email}", limit=5, window_seconds=3600)
    await container.rate_limiter.hit(f"login-code-ip:{ip}", limit=20, window_seconds=3600)
    code = new_numeric_code()
    db.add(
        LoginCode(
            email=email,
            code_hash=hash_token(code, container.secret),
            expires_at=container.clock.now() + CODE_TTL,
        )
    )
    subject, text, html = login_code_email(code, container.settings.public_base_url)
    enqueue_email(db, to=email, subject=subject, text=text, html=html, event="login_code")
    await container.kicker.kick("deliver_outbox")
    return email


async def _open_session(
    db: AsyncSession, container: Container, customer: Customer
) -> CustomerTokens:
    now = container.clock.now()
    token = new_token()
    expires_at = now + timedelta(days=container.settings.customer_session_days)
    db.add(
        CustomerSession(
            customer_id=customer.id,
            token_hash=hash_token(token, container.secret),
            expires_at=expires_at,
        )
    )
    customer.last_login_at = now
    return CustomerTokens(token=token, customer=customer, expires_at=expires_at)


async def verify_code(
    db: AsyncSession, container: Container, *, email: str, code: str
) -> CustomerTokens:
    email = normalize_email(email)
    now = container.clock.now()
    record = await db.scalar(
        select(LoginCode)
        .where(LoginCode.email == email, LoginCode.consumed_at.is_(None))
        .order_by(LoginCode.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if record is None or record.expires_at <= now:
        raise InvalidCodeError("Код устарел — запросите новый")
    if record.attempts >= MAX_ATTEMPTS:
        raise InvalidCodeError("Слишком много попыток — запросите новый код")
    if not tokens_equal(record.code_hash, hash_token(code.strip(), container.secret)):
        record.attempts += 1
        await db.commit()
        left = MAX_ATTEMPTS - record.attempts
        if left <= 0:
            raise InvalidCodeError("Слишком много попыток — запросите новый код")
        raise InvalidCodeError(f"Неверный код. Осталось попыток: {left}")
    record.consumed_at = now
    customer = await db.scalar(select(Customer).where(Customer.email == email))
    if customer is None:
        customer = Customer(email=email)
        db.add(customer)
        await db.flush()
    return await _open_session(db, container, customer)


def verify_telegram_payload(data: dict[str, Any], bot_token: str, now: datetime) -> dict[str, Any]:
    """Проверка подписи Telegram Login Widget (HMAC-SHA256 от SHA256(токена бота))."""
    received = str(data.get("hash", ""))
    fields = {k: str(v) for k, v in data.items() if k != "hash" and v is not None}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hashlib.sha256(bot_token.encode()).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not received or not hmac.compare_digest(expected, received):
        raise AuthRequiredError("Не удалось подтвердить вход через Telegram")
    try:
        auth_date = datetime.fromtimestamp(int(fields["auth_date"]), tz=now.tzinfo)
    except (KeyError, ValueError) as exc:
        raise AuthRequiredError("Не удалось подтвердить вход через Telegram") from exc
    if now - auth_date > TELEGRAM_MAX_AGE:
        raise AuthRequiredError("Вход через Telegram устарел — попробуйте ещё раз")
    return fields


def _bot_token(container: Container) -> str:
    token = container.settings.telegram_bot_token
    if not token:
        raise AuthRequiredError("Вход через Telegram пока не настроен")
    return token.get_secret_value() if isinstance(token, SecretStr) else str(token)


async def login_telegram(
    db: AsyncSession, container: Container, data: dict[str, Any]
) -> CustomerTokens:
    fields = verify_telegram_payload(data, _bot_token(container), container.clock.now())
    telegram_id = int(fields["id"])
    customer = await db.scalar(select(Customer).where(Customer.telegram_id == telegram_id))
    if customer is None:
        name = " ".join(filter(None, [fields.get("first_name"), fields.get("last_name")]))
        customer = Customer(
            telegram_id=telegram_id,
            telegram_username=fields.get("username"),
            name=name or None,
        )
        db.add(customer)
        await db.flush()
    elif fields.get("username"):
        customer.telegram_username = fields["username"]
    return await _open_session(db, container, customer)


async def link_telegram(
    db: AsyncSession, container: Container, customer: Customer, data: dict[str, Any]
) -> Customer:
    fields = verify_telegram_payload(data, _bot_token(container), container.clock.now())
    telegram_id = int(fields["id"])
    other = await db.scalar(
        select(Customer).where(Customer.telegram_id == telegram_id, Customer.id != customer.id)
    )
    if other is not None:
        if other.email or other.points_balance:
            raise ConflictError("Этот Telegram уже привязан к другому аккаунту")
        other.telegram_id = None  # пустой аккаунт, созданный входом через Telegram
        await db.flush()
    customer.telegram_id = telegram_id
    customer.telegram_username = fields.get("username")
    return customer


async def resolve_session(db: AsyncSession, container: Container, token: str) -> Customer | None:
    session = await db.scalar(
        select(CustomerSession).where(
            CustomerSession.token_hash == hash_token(token, container.secret)
        )
    )
    if session is None or session.revoked_at is not None:
        return None
    if session.expires_at <= container.clock.now():
        return None
    if session.customer.anonymized_at is not None:
        return None
    return session.customer


async def logout(db: AsyncSession, container: Container, token: str) -> None:
    await db.execute(
        update(CustomerSession)
        .where(CustomerSession.token_hash == hash_token(token, container.secret))
        .values(revoked_at=container.clock.now())
    )


async def revoke_all(db: AsyncSession, container: Container, customer: Customer) -> None:
    await db.execute(
        update(CustomerSession)
        .where(CustomerSession.customer_id == customer.id, CustomerSession.revoked_at.is_(None))
        .values(revoked_at=container.clock.now())
    )
