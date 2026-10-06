"""Вебхук Telegram-бота. Проверяется секрет из заголовка X-Telegram-Bot-Api-Secret-Token."""

import logging
from typing import Any

from aiogram.types import Update
from fastapi import APIRouter, Request
from pydantic import SecretStr, ValidationError

from app.api.deps import Db, Deps
from app.core.security import tokens_equal
from app.domain.errors import PermissionDeniedError
from app.schemas.common import Ok
from app.services import telegram_bot
from app.services.outbox import enqueue_telegram

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", include_in_schema=False)


def _secret(value: Any) -> str | None:
    if value is None:
        return None
    return value.get_secret_value() if isinstance(value, SecretStr) else str(value)


@router.post("/telegram", response_model=Ok)
async def telegram_webhook(request: Request, db: Db, container: Deps) -> Ok:
    expected = _secret(container.settings.telegram_webhook_secret)
    received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not expected or not tokens_equal(expected, received):
        raise PermissionDeniedError("Нет доступа")
    try:
        update = Update.model_validate(await request.json())
    except (ValidationError, ValueError):
        logger.warning("Непонятное обновление Telegram")
        return Ok()
    message = update.message
    if message is None or message.chat.type != "private" or not message.text:
        return Ok()
    chat_id = message.chat.id
    text = message.text.strip()
    name = (message.from_user.full_name if message.from_user else "") or ""
    if text.startswith("/start"):
        payload = text.removeprefix("/start").strip() or None
        reply = await telegram_bot.handle_start_command(
            db, container, chat_id=chat_id, payload=payload, from_name=name
        )
    else:
        reply = telegram_bot.help_text()
    enqueue_telegram(db, chat_id=chat_id, text=reply, event="bot_reply")
    await container.kicker.kick("deliver_outbox")
    return Ok()
