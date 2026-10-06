"""Telegram-бот магазина: привязка чата владельца/сотрудника по коду из админки.

Бот отвечает только на команды; уведомления рассылаются через outbox
только чатам из списка получателей (SPEC 11.1).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.security import hash_token
from app.models import AdminChallenge, NotificationRecipient
from app.models.admin import ChallengePurpose
from app.models.system import NotificationEvent
from app.services import admin_auth

WELCOME = (
    "Это бот магазина «НСБ Чай». Он присылает владельцу уведомления о заказах "
    "и коды для входа в админку.\n\n"
    "Чтобы подключить Telegram, откройте в админке «Ещё → Настройки → Telegram» "
    "и нажмите «Подключить»."
)
CODE_REJECTED = (
    "Код не подошёл или устарел. Получите новый в админке: «Ещё → Настройки → Telegram»."
)


async def handle_start_command(
    db: AsyncSession, container: Container, *, chat_id: int, payload: str | None, from_name: str
) -> str:
    code = (payload or "").strip()
    if not code:
        return WELCOME
    await container.rate_limiter.hit(f"tg-link:{chat_id}", limit=10, window_seconds=3600)
    if await link_recipient_by_code(db, container, code=code, chat_id=chat_id, name=from_name):
        return (
            "Готово! Этот чат добавлен в получатели уведомлений «НСБ Чай». "
            "Какие события присылать, владелец настраивает в админке."
        )
    user = await admin_auth.link_telegram_by_code(
        db, container, code=code, chat_id=chat_id, chat_name=from_name
    )
    if user is None:
        return CODE_REJECTED
    if user.is_owner:
        return (
            f"Готово, {user.name}! Telegram подключён к админке «НСБ Чай».\n"
            "Сюда будут приходить новые заказы, заявки, остатки и коды входа."
        )
    return (
        f"Готово, {user.name}! Telegram подключён к админке «НСБ Чай».\n"
        "Сюда будут приходить коды для входа."
    )


async def link_recipient_by_code(
    db: AsyncSession, container: Container, *, code: str, chat_id: int, name: str
) -> bool:
    challenge = await db.scalar(
        select(AdminChallenge)
        .where(
            AdminChallenge.code_hash == hash_token(code.strip().upper(), container.secret),
            AdminChallenge.purpose == ChallengePurpose.RECIPIENT_LINK.value,
            AdminChallenge.consumed_at.is_(None),
        )
        .with_for_update()
    )
    now = container.clock.now()
    if challenge is None or challenge.expires_at <= now:
        return False
    challenge.consumed_at = now
    recipient = await db.scalar(
        select(NotificationRecipient).where(NotificationRecipient.chat_id == chat_id)
    )
    if recipient is None:
        db.add(
            NotificationRecipient(
                chat_id=chat_id,
                name=name or f"Чат {chat_id}",
                events=[e.value for e in NotificationEvent],
            )
        )
    else:
        recipient.is_active = True
    return True


def help_text() -> str:
    return WELCOME
