"""Доставка сообщений: Telegram (владельцу) и email (покупателям).

Сервисы не шлют сообщения напрямую — они пишут их в outbox, а воркер доставляет
через эти отправители (services/outbox.py).
"""

import logging
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

logger = logging.getLogger(__name__)


class TelegramSender(Protocol):
    async def send(self, chat_id: int, text: str) -> None: ...


class Mailer(Protocol):
    async def send(self, *, to: str, subject: str, text: str, html: str | None) -> None: ...


class DeliveryError(Exception):
    pass


@dataclass(slots=True)
class SentTelegram:
    chat_id: int
    text: str


class FakeTelegramSender:
    def __init__(self) -> None:
        self.sent: list[SentTelegram] = []
        self.fail = False

    async def send(self, chat_id: int, text: str) -> None:
        if self.fail:
            raise DeliveryError("Telegram недоступен (тестовая ошибка)")
        self.sent.append(SentTelegram(chat_id, text))


class BotTelegramSender:
    def __init__(self, token: str) -> None:
        self._bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))

    @property
    def bot(self) -> Bot:
        return self._bot

    async def send(self, chat_id: int, text: str) -> None:
        try:
            await self._bot.send_message(chat_id, text, disable_web_page_preview=True)
        except Exception as exc:
            raise DeliveryError(str(exc)) from exc


class DisabledTelegramSender:
    """Бот не настроен (нет токена): сообщения пишем в лог, чтобы ничего не терять молча."""

    async def send(self, chat_id: int, text: str) -> None:
        logger.warning("Telegram не настроен, сообщение для %s:\n%s", chat_id, text)


@dataclass(slots=True)
class SentEmail:
    to: str
    subject: str
    text: str
    html: str | None


class FakeMailer:
    def __init__(self) -> None:
        self.sent: list[SentEmail] = []
        self.fail = False

    async def send(self, *, to: str, subject: str, text: str, html: str | None) -> None:
        if self.fail:
            raise DeliveryError("SMTP недоступен (тестовая ошибка)")
        self.sent.append(SentEmail(to, subject, text, html))


class ConsoleMailer:
    async def send(self, *, to: str, subject: str, text: str, html: str | None) -> None:
        logger.info("Письмо для %s: %s\n%s", to, subject, text)


class SmtpMailer:
    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: str | None,
        password: str | None,
        sender: str,
        starttls: bool,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._sender = sender
        self._starttls = starttls

    async def send(self, *, to: str, subject: str, text: str, html: str | None) -> None:
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = to
        message["Subject"] = subject
        message.set_content(text)
        if html:
            message.add_alternative(html, subtype="html")
        try:
            await aiosmtplib.send(
                message,
                hostname=self._host,
                port=self._port,
                username=self._username,
                password=self._password,
                start_tls=self._starttls,
                timeout=20,
            )
        except aiosmtplib.SMTPException as exc:
            raise DeliveryError(str(exc)) from exc
