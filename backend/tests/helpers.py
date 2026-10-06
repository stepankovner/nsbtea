"""Вспомогательные функции для интеграционных тестов."""

import re
from datetime import datetime

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import AdminUser, OutboxMessage
from app.models.admin import AdminRole

OWNER_EMAIL = "nikita@nsbtea.test"
OWNER_PASSWORD = "очень-надёжный-пароль"


async def create_admin(
    db: AsyncSession,
    *,
    email: str = OWNER_EMAIL,
    password: str = OWNER_PASSWORD,
    name: str = "Никита",
    role: AdminRole = AdminRole.OWNER,
    permissions: list[str] | None = None,
    telegram_chat_id: int | None = None,
    expires_at: datetime | None = None,
) -> AdminUser:
    user = AdminUser(
        email=email,
        name=name,
        password_hash=hash_password(password),
        role=role.value,
        permissions=permissions or [],
        telegram_chat_id=telegram_chat_id,
        expires_at=expires_at,
    )
    db.add(user)
    await db.commit()
    return user


async def login(
    client: AsyncClient, email: str = OWNER_EMAIL, password: str = OWNER_PASSWORD
) -> str:
    """Войти в админку (без второго фактора). Возвращает CSRF-токен и ставит заголовок клиенту."""
    response = await client.post(
        "/api/admin/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    csrf = str(body["csrf_token"])
    client.headers["X-CSRF-Token"] = csrf
    return csrf


async def owner_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    await create_admin(db)
    await login(client)
    return client


async def outbox(db: AsyncSession, *, channel: str | None = None) -> list[OutboxMessage]:
    query = select(OutboxMessage).order_by(OutboxMessage.created_at, OutboxMessage.id)
    if channel:
        query = query.where(OutboxMessage.channel == channel)
    return list((await db.scalars(query)).all())


def extract_code(text: str, digits: int = 6) -> str:
    match = re.search(rf"\b(\d{{{digits}}})\b", text)
    assert match, f"в сообщении нет кода: {text!r}"
    return match.group(1)
