"""Уведомления владельцу на почту и без персональных данных в Telegram.

Пока бот недоступен с сервера, о заказе владелец узнаёт из письма на почту из настроек
(«Почта для уведомлений»). Telegram — иностранный сервис: имя, телефон, почту и адрес
покупателя туда не отправляем — только номер, сумму, состав и ссылку в админку;
полные данные — в письме (почта — российская, docs/legal/README.md).
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import NotificationRecipient, OutboxMessage, Setting
from app.services.orders import notify_attention
from tests.factories import make_tea
from tests.helpers import outbox
from tests.orders_helpers import buy, get_order

OWNER_MAIL = "nikita@mail.ru"
COURIER = {"method": "courier", "address": "Владимир, ул. Мира, 5"}


async def setup(db: AsyncSession, *, email: str | None = OWNER_MAIL) -> None:
    events = ["new_order", "order_attention", "new_application"]
    db.add(NotificationRecipient(chat_id=1, name="Никита", events=events))
    if email is not None:
        db.add(Setting(key="store", value={"notify_email": email}))
    await db.commit()


def owner_emails(messages: list[OutboxMessage], subject_part: str) -> list[OutboxMessage]:
    return [m for m in messages if m.recipient == OWNER_MAIL and subject_part in (m.subject or "")]


class TestNewOrder:
    async def test_owner_gets_full_order_by_email(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await setup(db)
        tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=500)
        await buy(client, container, [(tea.id, "preset", 100, 1)], delivery=COURIER)

        emails = owner_emails(await outbox(db, channel="email"), "Новый заказ NSB-10001")
        assert len(emails) == 1
        body = emails[0].body
        for needle in (
            "Да Хун Пао, 100 г",
            "Анна",
            "+79001234567",
            "anna@mail.ru",
            "/admin/orders/",
        ):
            assert needle in body, needle
        assert "<b>" not in body  # письмо — обычный текст, без разметки Telegram

    async def test_telegram_has_no_personal_data(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await setup(db)
        tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=500)
        await buy(client, container, [(tea.id, "preset", 100, 1)], delivery=COURIER)

        telegram = await outbox(db, channel="telegram")
        assert len(telegram) == 1
        text = telegram[0].body
        assert "Новый заказ NSB-10001" in text
        assert "Да Хун Пао, 100 г" in text
        assert "/admin/orders/" in text
        for secret in ("Анна", "+79001234567", "anna@mail.ru", COURIER["address"]):
            assert secret not in text, secret

    async def test_no_email_without_address_in_settings(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await setup(db, email=None)
        tea = await make_tea(db, presets=[100], stock=500)
        await buy(client, container, [(tea.id, "preset", 100, 1)])

        emails = [
            m for m in await outbox(db, channel="email") if "Новый заказ" in (m.subject or "")
        ]
        assert emails == []

    async def test_attention_is_emailed(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await setup(db)
        tea = await make_tea(db, presets=[100], stock=500)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        order = await get_order(db, order_id)

        await notify_attention(db, container, order, "Оплата пришла после отмены")
        await db.commit()

        emails = owner_emails(await outbox(db, channel="email"), "Требует внимания")
        assert len(emails) == 1
        assert "Оплата пришла после отмены" in emails[0].body


class TestApplication:
    async def test_application_contacts_only_in_email(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await setup(db)
        response = await client.post(
            "/api/applications",
            json={
                "type": "wholesale",
                "name": "Олег",
                "phone": "+7 900 555-44-33",
                "consent": True,
                "data": {"company": "Кофейня «Ромашка»", "comment": "Позвоните после 18"},
            },
        )
        assert response.status_code in (200, 201), response.text

        telegram = await outbox(db, channel="telegram")
        assert len(telegram) == 1
        assert "Новая заявка" in telegram[0].body
        for secret in ("Олег", "+79005554433", "555-44-33", "Позвоните после 18"):
            assert secret not in telegram[0].body, secret

        emails = owner_emails(await outbox(db, channel="email"), "Новая заявка")
        assert len(emails) == 1
        assert "Олег" in emails[0].body
        assert "Позвоните после 18" in emails[0].body


async def test_notify_email_is_not_public(client: AsyncClient, db: AsyncSession) -> None:
    await setup(db)
    store = (await client.get("/api/site")).json()["store"]
    assert "notify_email" not in store
    assert OWNER_MAIL not in str(store)
