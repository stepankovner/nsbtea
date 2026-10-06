"""Уведомления владельцу в Telegram (SPEC 11.1). Только получателям из списка и только
по событиям, на которые они подписаны. Тексты — короткие, со ссылкой в админку."""

from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import NotificationRecipient
from app.models.system import NotificationEvent
from app.services.outbox import enqueue_telegram


def admin_link(container: Container, path: str) -> str:
    return f"{container.settings.public_base_url.rstrip('/')}/admin{path}"


async def notify_owner(
    db: AsyncSession, container: Container, event: NotificationEvent, text: str
) -> int:
    recipients = (
        await db.scalars(
            select(NotificationRecipient).where(
                NotificationRecipient.is_active.is_(True),
                NotificationRecipient.events.contains([event.value]),
            )
        )
    ).all()
    for recipient in recipients:
        enqueue_telegram(db, chat_id=recipient.chat_id, text=text, event=event.value)
    if recipients:
        await container.kicker.kick("deliver_outbox")
    return len(recipients)


def h(text: object) -> str:
    """Экранирование для HTML-разметки Telegram."""
    return escape(str(text), quote=False)
