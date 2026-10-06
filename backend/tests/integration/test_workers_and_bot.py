"""Фоновые задачи (SPEC 11.1, 10.5) и вебхук Telegram-бота."""

from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.container import Container
from app.integrations.messaging import FakeMailer, FakeTelegramSender
from app.models import NotificationRecipient, OutboxMessage, ThursdayPlan
from app.services.outbox import enqueue_email, enqueue_telegram
from app.workers import jobs
from tests.factories import make_tea
from tests.helpers import outbox, owner_client
from tests.orders_helpers import buy, get_order


async def recipient(db: AsyncSession) -> None:
    db.add(
        NotificationRecipient(
            chat_id=7, name="Никита", events=["weekly_summary", "thursday_reminder"]
        )
    )
    await db.commit()


class TestOutbox:
    async def test_delivers_and_retries(self, db: AsyncSession, container: Container) -> None:
        enqueue_telegram(db, chat_id=7, text="Привет", event="test")
        enqueue_email(db, to="a@mail.ru", subject="Тема", text="Текст", html=None, event="test")
        await db.commit()
        telegram = container.telegram
        mailer = container.mailer
        assert isinstance(telegram, FakeTelegramSender)
        assert isinstance(mailer, FakeMailer)

        telegram.fail = True
        assert await jobs.deliver_outbox(container) == 1  # письмо ушло, телеграм — нет
        message = (
            await db.scalars(select(OutboxMessage).where(OutboxMessage.channel == "telegram"))
        ).one()
        await db.refresh(message)
        assert message.status == "pending"
        assert message.attempts == 1

        telegram.fail = False
        container.clock.advance(minutes=1)  # type: ignore[attr-defined]
        assert await jobs.deliver_outbox(container) == 1
        assert telegram.sent[0].text == "Привет"
        assert mailer.sent[0].subject == "Тема"


class TestAutoComplete:
    async def test_shipped_order_completes_after_n_days(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100], stock=5000)
        order_id = await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        await client.post(f"/api/admin/orders/{order_id}/status", json={"to": "assembling"})
        await client.post(
            f"/api/admin/orders/{order_id}/status", json={"to": "shipped", "tracking_number": "1"}
        )
        container.clock.advance(days=13)  # type: ignore[attr-defined]
        assert await jobs.auto_complete_orders(container) == 0
        container.clock.advance(days=2)  # type: ignore[attr-defined]
        assert await jobs.auto_complete_orders(container) == 1
        order = await get_order(db, order_id)
        assert order.status == "completed"
        assert order.points_earned > 0


class TestMondayReports:
    async def test_thursday_reminder_when_nothing_planned(
        self, db: AsyncSession, container: Container
    ) -> None:
        await recipient(db)
        assert await jobs.thursday_reminder(container) is True
        messages = await outbox(db, channel="telegram")
        assert "не запланирован" in messages[0].body.lower()

    async def test_no_reminder_when_planned(self, db: AsyncSession, container: Container) -> None:
        await recipient(db)
        tea = await make_tea(db)
        plan = ThursdayPlan(date=date(2026, 10, 8), products=[tea])
        db.add(plan)
        await db.commit()
        assert await jobs.thursday_reminder(container) is False

    async def test_weekly_summary(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await recipient(db)
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=1_000, presets=[100], stock=5000)
        # заказ на прошлой неделе (сейчас понедельник 5 октября)
        container.clock.set(datetime(2026, 10, 1, 12, 0, tzinfo=UTC))  # type: ignore[attr-defined]
        await buy(client, container, [(tea.id, "preset", 100, 2)])
        container.clock.set(datetime(2026, 10, 5, 7, 0, tzinfo=UTC))  # type: ignore[attr-defined]
        await jobs.weekly_summary(container)
        text = (await outbox(db, channel="telegram"))[-1].body
        assert "Сводка за неделю" in text
        assert "Заказов: 1" in text
        assert "Да Хун Пао" in text
        assert "Нужно дозаказать" in text


class TestCleanup:
    async def test_removes_stale_codes_and_guest_carts(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db)
        await client.post(
            "/api/cart/items",
            json={"product_id": str(tea.id), "kind": "preset", "grams": 50, "qty": 1},
        )
        await client.post("/api/auth/code", json={"email": "a@mail.ru"})
        container.clock.advance(days=91)  # type: ignore[attr-defined]
        removed = await jobs.cleanup(container)
        assert removed["login_codes"] == 1
        assert removed["carts"] == 1  # гостевая корзина без изменений дольше 60 дней


class TestTelegramWebhook:
    async def test_secret_required(
        self, client: AsyncClient, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_webhook_secret": "s3cret"})
        response = await client.post("/api/webhooks/telegram", json={"update_id": 1})
        assert response.status_code == 403

    async def test_start_with_unknown_code_replies(
        self, client: AsyncClient, db: AsyncSession, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_webhook_secret": "s3cret"})
        update = {
            "update_id": 10,
            "message": {
                "message_id": 1,
                "date": int(container.clock.now().timestamp()),
                "chat": {"id": 555, "type": "private"},
                "from": {"id": 555, "is_bot": False, "first_name": "Никита"},
                "text": "/start WRONGCODE",
            },
        }
        response = await client.post(
            "/api/webhooks/telegram",
            json=update,
            headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"},
        )
        assert response.status_code == 200
        replies = await outbox(db, channel="telegram")
        assert replies[0].recipient == "555"
        assert "не подошёл" in replies[0].body

    async def test_unrelated_message_gets_help(
        self, client: AsyncClient, db: AsyncSession, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_webhook_secret": "s3cret"})
        update = {
            "update_id": 11,
            "message": {
                "message_id": 2,
                "date": int((container.clock.now() - timedelta(minutes=1)).timestamp()),
                "chat": {"id": 556, "type": "private"},
                "from": {"id": 556, "is_bot": False, "first_name": "Гость"},
                "text": "привет",
            },
        }
        await client.post(
            "/api/webhooks/telegram",
            json=update,
            headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"},
        )
        replies = await outbox(db, channel="telegram")
        assert "бот магазина" in replies[0].body
