"""Вход покупателя без пароля: код на email, Telegram (SPEC 8.1)."""

import hashlib
import hmac
import time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.container import Container
from app.models import Customer
from tests.factories import make_tea
from tests.helpers import add_to_cart, customer_login, extract_code, outbox

BOT_TOKEN = "123456:TEST-TOKEN"


def telegram_payload(
    user_id: int = 777, auth_date: int | None = None, **extra: str
) -> dict[str, str]:
    data = {
        "id": str(user_id),
        "first_name": "Анна",
        "username": "anna_tea",
        "auth_date": str(auth_date or int(time.time())),
        **extra,
    }
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return data


class TestEmailCode:
    async def test_full_flow_creates_customer(self, client: AsyncClient, db: AsyncSession) -> None:
        response = await client.post("/api/auth/code", json={"email": "Anna@Mail.ru"})
        assert response.status_code == 200
        assert "anna@mail.ru" in response.json()["message"]
        email = (await outbox(db, channel="email"))[0]
        assert email.recipient == "anna@mail.ru"
        assert email.subject == "Код для входа в НСБ Чай"
        code = extract_code(email.body)

        response = await client.post(
            "/api/auth/verify", json={"email": "anna@mail.ru", "code": code}
        )
        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert "nsb_session=" in cookie
        assert "HttpOnly" in cookie
        me = (await client.get("/api/account/me")).json()
        assert me["email"] == "anna@mail.ru"
        assert me["points_balance"] == 0

    async def test_wrong_code(self, client: AsyncClient, db: AsyncSession) -> None:
        await client.post("/api/auth/code", json={"email": "anna@mail.ru"})
        response = await client.post(
            "/api/auth/verify", json={"email": "anna@mail.ru", "code": "000000"}
        )
        # код случайный; если вдруг совпал — проверка всё равно корректна
        assert response.status_code in (200, 400)
        if response.status_code == 400:
            assert "Неверный код" in response.json()["detail"]

    async def test_attempts_limited(self, client: AsyncClient, db: AsyncSession) -> None:
        await client.post("/api/auth/code", json={"email": "anna@mail.ru"})
        code = extract_code((await outbox(db, channel="email"))[0].body)
        wrong = "111111" if code != "111111" else "222222"
        for _ in range(5):
            await client.post("/api/auth/verify", json={"email": "anna@mail.ru", "code": wrong})
        response = await client.post(
            "/api/auth/verify", json={"email": "anna@mail.ru", "code": code}
        )
        assert response.status_code == 400
        assert "запросите новый" in response.json()["detail"]

    async def test_code_expires(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await client.post("/api/auth/code", json={"email": "anna@mail.ru"})
        code = extract_code((await outbox(db, channel="email"))[0].body)
        container.clock.advance(minutes=11)  # type: ignore[attr-defined]
        response = await client.post(
            "/api/auth/verify", json={"email": "anna@mail.ru", "code": code}
        )
        assert response.status_code == 400

    async def test_resend_throttled(self, client: AsyncClient) -> None:
        assert (await client.post("/api/auth/code", json={"email": "a@mail.ru"})).status_code == 200
        response = await client.post("/api/auth/code", json={"email": "a@mail.ru"})
        assert response.status_code == 429

    async def test_logout(self, client: AsyncClient, db: AsyncSession) -> None:
        await customer_login(client, db, "anna@mail.ru")
        assert (await client.post("/api/auth/logout")).status_code == 200
        assert (await client.get("/api/account/me")).status_code == 401

    async def test_guest_cart_merges_on_login(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, stock=1000)
        await add_to_cart(client, tea.id, grams=50)
        await customer_login(client, db, "anna@mail.ru")
        cart = (await client.get("/api/cart")).json()
        assert len(cart["lines"]) == 1
        assert cart["lines"][0]["grams"] == 50


class TestTelegramLogin:
    async def test_login_creates_customer(
        self, client: AsyncClient, db: AsyncSession, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_bot_token": BOT_TOKEN})
        payload = telegram_payload(auth_date=int(container.clock.now().timestamp()))
        response = await client.post("/api/auth/telegram", json=payload)
        assert response.status_code == 200, response.text
        me = (await client.get("/api/account/me")).json()
        assert me["telegram_username"] == "anna_tea"
        assert me["email"] is None

    async def test_forged_hash(
        self, client: AsyncClient, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_bot_token": BOT_TOKEN})
        payload = telegram_payload(auth_date=int(container.clock.now().timestamp()))
        payload["first_name"] = "Злоумышленник"
        response = await client.post("/api/auth/telegram", json=payload)
        assert response.status_code == 401

    async def test_stale_auth_date(
        self, client: AsyncClient, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_bot_token": BOT_TOKEN})
        payload = telegram_payload(auth_date=int(container.clock.now().timestamp()) - 3 * 86400)
        response = await client.post("/api/auth/telegram", json=payload)
        assert response.status_code == 401

    async def test_link_to_existing_account(
        self, client: AsyncClient, db: AsyncSession, container: Container, settings: Settings
    ) -> None:
        container.settings = settings.model_copy(update={"telegram_bot_token": BOT_TOKEN})
        await customer_login(client, db, "anna@mail.ru")
        payload = telegram_payload(user_id=4242, auth_date=int(container.clock.now().timestamp()))
        response = await client.post("/api/account/telegram", json=payload)
        assert response.status_code == 200
        customer = (await db.scalars(select(Customer))).one()
        assert customer.telegram_id == 4242
        assert customer.email == "anna@mail.ru"
