"""Готовность сайта к подключению интернет-эквайринга (требования Точки к сайту, docs/ACQUIRING.md).

Банк проверяет живой сайт до одобрения заявки, а ключи API выдаёт только после — поэтому
сайт должен работать на боевом адресе с выключенной онлайн-оплатой (TOCHKA_MODE=off)
и без СДЭК, пока нет договора (CDEK_MODE=off): способ просто недоступен покупателю.
"""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import IntegrationMode
from app.container import Container
from app.models import Order, Page, Setting, WebhookEvent
from app.services.seed import seed_content
from tests.factories import make_tea
from tests.helpers import add_to_cart, owner_client

PVZ = {
    "method": "cdek_pvz",
    "city_code": 44,
    "city_name": "Москва",
    "pvz_code": "MSK123",
    "pvz_address": "Москва, ул. Тверская, 1",
}


def checkout_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Анна",
        "phone": "+7 900 123-45-67",
        "email": "anna@mail.ru",
        "delivery": {"method": "pickup"},
        "consent_offer": True,
        "consent_pd": True,
        "payment_method": "online",
    }
    payload.update(overrides)
    return payload


def switch(container: Container, **modes: IntegrationMode) -> None:
    container.settings = container.settings.model_copy(update=modes)


class TestOnlinePaymentOff:
    async def test_site_tells_storefront_payment_is_not_connected(
        self, client: AsyncClient, container: Container
    ) -> None:
        assert (await client.get("/api/site")).json()["online_payment_available"] is True
        switch(container, tochka_mode=IntegrationMode.OFF)
        assert (await client.get("/api/site")).json()["online_payment_available"] is False

    async def test_online_order_is_refused_before_anything_is_reserved(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        switch(container, tochka_mode=IntegrationMode.OFF)
        tea = await make_tea(db, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)

        response = await client.post("/api/checkout", json=checkout_payload())

        assert response.status_code == 409
        assert "Онлайн-оплата" in response.json()["detail"]
        assert await db.scalar(select(func.count()).select_from(Order)) == 0
        cart = (await client.get("/api/cart")).json()
        assert len(cart["items"]) == 1  # корзина не потерялась

    async def test_pay_on_delivery_still_works(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        switch(container, tochka_mode=IntegrationMode.OFF)
        db.add(Setting(key="payment", value={"allow_pay_on_delivery": True}))
        await db.commit()
        tea = await make_tea(db, presets=[100], stock=500)
        await add_to_cart(client, tea.id, grams=100)

        response = await client.post(
            "/api/checkout", json=checkout_payload(payment_method="on_delivery")
        )

        assert response.status_code == 201, response.text
        assert response.json()["payment_url"] is None


class TestCdekOff:
    async def test_cdek_is_hidden_from_storefront(
        self, client: AsyncClient, container: Container
    ) -> None:
        assert (await client.get("/api/site")).json()["delivery"]["cdek_enabled"] is True
        switch(container, cdek_mode=IntegrationMode.OFF)
        assert (await client.get("/api/site")).json()["delivery"]["cdek_enabled"] is False

    async def test_cdek_quote_is_refused(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        switch(container, cdek_mode=IntegrationMode.OFF)
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)

        response = await client.post("/api/delivery/quote", json={"delivery": PVZ})

        assert response.status_code == 422
        assert response.json()["detail"] == "Этот способ доставки сейчас недоступен"


class TestBankWebhookCheck:
    async def test_any_request_gets_200_but_only_signed_ones_are_processed(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Точка регистрирует вебхук, только если тестовый запрос получил ответ 200,
        и повторяет не-200 тридцать раз. Подпись проверяется всё равно: неподписанное
        тело отвечает 200, но ничего не меняет и в журнал не пишется."""
        response = await client.post(
            "/api/webhooks/tochka", content=b"garbage", headers={"content-type": "text/plain"}
        )
        assert response.status_code == 200
        assert await db.scalar(select(func.count()).select_from(WebhookEvent)) == 0


class TestLaunchChecklist:
    async def checklist(self, client: AsyncClient, db: AsyncSession) -> dict[str, dict[str, Any]]:
        await owner_client(client, db)
        body = (await client.get("/api/admin/dashboard")).json()
        return {item["key"]: item for item in body["launch_checklist"]}

    async def test_requisites_need_every_field_the_bank_checks(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        db.add(Setting(key="store", value={"legal_name": "ИП Булич Н. С.", "inn": "330500000000"}))
        await db.commit()
        assert (await self.checklist(client, db))["requisites"]["done"] is False

        store = await db.get(Setting, "store")
        assert store is not None
        store.value = store.value | {"ogrnip": "324330000000000", "legal_address": "Владимир"}
        await db.commit()
        assert (await self.checklist(client, db))["requisites"]["done"] is True

    async def test_buyer_info_pages_must_be_published(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await seed_content(db)
        await db.commit()
        item = (await self.checklist(client, db))["buyer_pages"]
        assert item["done"] is False  # «Обмен и возврат» после seed — черновик
        assert item["href"] == "/admin/content/pages"

        returns = await db.scalar(select(Page).where(Page.slug == "returns"))
        assert returns is not None
        returns.is_published = True
        await db.commit()
        assert (await self.checklist(client, db))["buyer_pages"]["done"] is True

    async def test_online_payment_item_follows_tochka_mode(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        switch(container, tochka_mode=IntegrationMode.OFF)
        item = (await self.checklist(client, db))["online_payment"]
        assert item["done"] is False
        assert item["href"] == "/admin/settings/payment"

        switch(container, tochka_mode=IntegrationMode.PRODUCTION)
        assert (await self.checklist(client, db))["online_payment"]["done"] is True


class TestBuyerPagesSeed:
    async def test_returns_page_is_seeded_as_draft(self, db: AsyncSession) -> None:
        await seed_content(db)
        page = await db.scalar(select(Page).where(Page.slug == "returns"))
        assert page is not None
        assert page.title == "Обмен и возврат"
        assert page.kind == "page"
        assert page.is_published is False  # текст проверяет владелец, потом публикует
        text = str(page.content)
        assert "7 дней" in text
        assert "10 дней" in text

    async def test_delivery_page_describes_payment_like_the_bank_asks(
        self, db: AsyncSession
    ) -> None:
        await seed_content(db)
        page = await db.scalar(select(Page).where(Page.slug == "delivery"))
        assert page is not None
        text = str(page.content)
        for needle in ("МИР", "Visa", "Mastercard", "СБП", "чек", "Возврат"):
            assert needle in text, needle


class TestProductStorageInfo:
    async def test_storage_and_shelf_life_are_shown_to_buyers(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db)
        await owner_client(client, db)
        response = await client.patch(
            f"/api/admin/products/{tea.id}",
            json={
                "attributes": {
                    "region": "Уишань",
                    "storage": "В сухом месте без посторонних запахов",
                    "shelf_life": "3 года",
                }
            },
        )
        assert response.status_code == 200, response.text

        page = (await client.get(f"/api/catalog/products/{tea.slug}")).json()
        labels = {a["label"]: a["value"] for a in page["attributes"]}
        assert labels["Условия хранения"] == "В сухом месте без посторонних запахов"
        assert labels["Срок годности"] == "3 года"
