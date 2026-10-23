"""Письма сайта через SMTP.

Почтовый сервис Selectel только отправляет письма — ящика у адреса отправителя может не быть.
Ответ покупателя на письмо сайта («Заказ оформлен») должен попасть в ящик, который читает
владелец: для этого — заголовок Reply-To из `SMTP_REPLY_TO`.
"""

from email.message import EmailMessage
from pathlib import Path
from typing import Any

import pytest

from app.config import EmailMode, Settings
from app.container import build_container
from app.integrations import messaging
from app.integrations.messaging import SmtpMailer

Sent = list[tuple[EmailMessage, dict[str, Any]]]


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> Sent:
    captured: Sent = []

    async def fake_send(message: EmailMessage, **kwargs: Any) -> None:
        captured.append((message, kwargs))

    monkeypatch.setattr(messaging.aiosmtplib, "send", fake_send)
    return captured


def mailer(**overrides: Any) -> SmtpMailer:
    values: dict[str, Any] = {
        "host": "smtp.mail.selcloud.ru",
        "port": 1126,
        "username": "14000",
        "password": "secret",
        "sender": "НСБ Чай <noreply@nsbtea.ru>",
        "starttls": True,
    }
    values.update(overrides)
    return SmtpMailer(**values)


async def test_replies_go_to_the_owner_inbox(sent: Sent) -> None:
    await mailer(reply_to="owner@example.ru").send(
        to="anna@mail.ru", subject="Заказ оформлен", text="Спасибо!", html=None
    )
    message, kwargs = sent[0]
    assert message["Reply-To"] == "owner@example.ru"
    assert message["From"] == "НСБ Чай <noreply@nsbtea.ru>"
    assert message["To"] == "anna@mail.ru"
    assert kwargs["hostname"] == "smtp.mail.selcloud.ru"
    assert kwargs["port"] == 1126
    assert kwargs["start_tls"] is True


async def test_without_reply_to_there_is_no_header(sent: Sent) -> None:
    await mailer().send(to="anna@mail.ru", subject="Код входа", text="123456", html=None)
    assert sent[0][0]["Reply-To"] is None


async def test_reply_to_comes_from_settings(sent: Sent, tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        email_mode=EmailMode.SMTP,
        smtp_host="smtp.mail.selcloud.ru",
        smtp_port=1126,
        smtp_from="НСБ Чай <noreply@nsbtea.ru>",
        smtp_reply_to="owner@example.ru",
        media_local_dir=str(tmp_path),
    )
    container = build_container(settings)
    await container.mailer.send(to="anna@mail.ru", subject="Заказ", text="Спасибо!", html=None)
    assert sent[0][0]["Reply-To"] == "owner@example.ru"
