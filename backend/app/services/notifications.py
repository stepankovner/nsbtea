"""Уведомления владельцу (SPEC 11.1): Telegram — получателям из списка и только по событиям,
на которые они подписаны; важные события — ещё и письмом на «Почту для уведомлений».

Telegram — иностранный сервис, поэтому туда — без персональных данных покупателя (номер,
сумма, состав, ссылка в админку). Контакты — только в письме (docs/legal/README.md).
"""

import re
from html import escape, unescape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import NotificationRecipient
from app.models.system import NotificationEvent
from app.services.outbox import enqueue_email, enqueue_telegram
from app.services.settings import get_group
from app.services.settings_schema import StoreSettings

# О чём владелец узнаёт и письмом: без этого заказ можно пропустить, если Telegram недоступен
EMAIL_EVENTS = frozenset(
    {
        NotificationEvent.NEW_ORDER,
        NotificationEvent.ORDER_ATTENTION,
        NotificationEvent.NEW_APPLICATION,
        NotificationEvent.OUT_OF_STOCK,
    }
)


def admin_link(container: Container, path: str) -> str:
    return f"{container.settings.public_base_url.rstrip('/')}/admin{path}"


def plain_text(html_text: str) -> str:
    """Текст Telegram (HTML-разметка) → обычный текст письма."""
    return unescape(re.sub(r"</?[a-z][^>]*>", "", html_text))


async def notify_owner(
    db: AsyncSession,
    container: Container,
    event: NotificationEvent,
    text: str,
    *,
    email: tuple[str, str] | None = None,
) -> int:
    """`text` — для Telegram (без персональных данных); `email` — (тема, текст) письма
    с подробностями. Без `email` письмо — тот же текст, тема — его первая строка."""
    if event in EMAIL_EVENTS:
        address = (await get_group(db, StoreSettings)).notify_email.strip()
        if address:
            subject, body = email or (plain_text(text.split("\n", 1)[0]), plain_text(text))
            enqueue_email(
                db,
                to=address,
                subject=re.sub(r"^\W+\s*", "", subject)[:300],
                text=body,
                html=None,
                event=event.value,
            )
            await container.kicker.kick("deliver_outbox")
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
