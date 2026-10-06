"""Telegram-бот магазина: привязка чата владельца/сотрудника по коду из админки.

Бот отвечает только на команды; уведомления рассылаются через outbox
только чатам из списка получателей (SPEC 11.1).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
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
