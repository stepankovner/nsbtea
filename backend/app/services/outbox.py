"""Outbox: сообщения пишутся в БД в транзакции события, воркер доставляет с повторами."""

import logging
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.integrations.messaging import DeliveryError
from app.models import OutboxMessage
from app.models.system import OutboxChannel, OutboxStatus

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 8
BATCH_SIZE = 50


def enqueue_telegram(db: AsyncSession, *, chat_id: int, text: str, event: str) -> OutboxMessage:
    message = OutboxMessage(
        channel=OutboxChannel.TELEGRAM.value, event=event, recipient=str(chat_id), body=text
    )
    db.add(message)
    return message


def enqueue_email(
    db: AsyncSession, *, to: str, subject: str, text: str, html: str | None, event: str
) -> OutboxMessage:
    message = OutboxMessage(
        channel=OutboxChannel.EMAIL.value,
        event=event,
        recipient=to,
        subject=subject,
        body=text,
        html=html,
    )
    db.add(message)
    return message


def _backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(3600, 15 * 2 ** (attempts - 1)))


async def deliver_pending(container: Container) -> int:
    """Доставить накопившиеся сообщения. Возвращает число успешно отправленных."""
    sent = 0
    async with container.session_factory() as db:
        now = container.clock.now()
        messages = (
            await db.scalars(
                select(OutboxMessage)
                .where(
                    OutboxMessage.status == OutboxStatus.PENDING.value,
                    or_(
                        OutboxMessage.next_attempt_at.is_(None),
                        OutboxMessage.next_attempt_at <= now,
                    ),
                )
                .order_by(OutboxMessage.created_at)
                .limit(BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )
        ).all()
        for message in messages:
            try:
                if message.channel == OutboxChannel.TELEGRAM.value:
                    await container.telegram.send(int(message.recipient), message.body)
                else:
                    await container.mailer.send(
                        to=message.recipient,
                        subject=message.subject or "",
                        text=message.body,
                        html=message.html,
                    )
            except DeliveryError as exc:
                message.attempts += 1
                message.last_error = str(exc)[:2000]
                if message.attempts >= MAX_ATTEMPTS:
                    message.status = OutboxStatus.FAILED.value
                    logger.error("Сообщение %s не доставлено: %s", message.id, exc)
                else:
                    message.next_attempt_at = now + _backoff(message.attempts)
                continue
            message.attempts += 1
            message.status = OutboxStatus.SENT.value
            message.sent_at = now
            sent += 1
        await db.commit()
    return sent
