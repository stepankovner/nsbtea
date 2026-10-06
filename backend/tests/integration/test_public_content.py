"""Витрина: настройки сайта, главная, страницы, события, заявки (SPEC 9)."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import (
    Application,
    Event,
    HomeBlock,
    NotificationRecipient,
    Page,
    Setting,
    ThursdayPlan,
)
from app.models.catalog import ProductStatus
from app.services.seed import seed_content
from tests.factories import make_tea
from tests.helpers import outbox


async def make_event(
    db: AsyncSession,
    container: Container,
    title: str = "Шэн и шу: два возраста пуэра",
    *,
    days: int = 5,
    seats: int | None = 8,
    published: bool = True,
    type_: str = "ceremony",
) -> Event:
    event = Event(
        type=type_,
        title=title,
        slug=f"event-{abs(hash(title)) % 100000}-{days}",
        starts_at=container.clock.now() + timedelta(days=days),
        place="Владимир",
        duration_text="2 часа",
        price_kop=120_000,
        seats_total=seats,
        is_published=published,
    )
    db.add(event)
    await db.commit()
    return event


class TestSite:
    async def test_site_settings(self, client: AsyncClient, db: AsyncSession) -> None:
        db.add(
            Setting(
                key="store", value={"phone": "+7 900 000-00-00", "legal_name": "ИП Булич Н. С."}
            )
        )
        db.add(Setting(key="seo", value={"metrika_id": "12345678"}))
        await db.commit()
        body = (await client.get("/api/site")).json()
        assert body["store"]["phone"] == "+7 900 000-00-00"
        assert body["store"]["legal_name"] == "ИП Булич Н. С."
        assert body["metrika_id"] == "12345678"
        assert body["welcome"] == {"enabled": True, "percent": 10}
        assert body["delivery"]["pickup_enabled"] is True
        assert "secret" not in str(body).lower()
        assert body["yandex_maps_api_key"] is None  # не задан — витрина покажет список ПВЗ

    async def test_yandex_maps_key_is_public(
        self, client: AsyncClient, container: Container
    ) -> None:
        container.settings = container.settings.model_copy(
            update={"yandex_maps_api_key": "maps-key"}
        )
        body = (await client.get("/api/site")).json()
        assert body["yandex_maps_api_key"] == "maps-key"


class TestHome:
    async def test_seeded_home(self, client: AsyncClient, db: AsyncSession) -> None:
        await seed_content(db)
        await db.commit()
        body = (await client.get("/api/home")).json()
        kinds = [b["kind"] for b in body["blocks"]]
        assert kinds[0] == "hero"
        assert "thursday" in kinds
        assert "services" in kinds
        assert "featured" in kinds
        assert "events" in kinds
        hero = body["blocks"][0]
        assert hero["data"]["title_line1"] == "Китайский чай"

    async def test_seed_is_idempotent(self, db: AsyncSession) -> None:
        await seed_content(db)
        await seed_content(db)
        await db.commit()
        count = len((await db.scalars(select(HomeBlock))).all())
        assert count == len({b.kind for b in (await db.scalars(select(HomeBlock))).all()})

    async def test_hidden_block_not_shown(self, client: AsyncClient, db: AsyncSession) -> None:
        await seed_content(db)
        block = await db.scalar(select(HomeBlock).where(HomeBlock.kind == "about"))
        assert block is not None
        block.is_visible = False
        await db.commit()
        kinds = [b["kind"] for b in (await client.get("/api/home")).json()["blocks"]]
        assert "about" not in kinds

    async def test_featured_products_and_events(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await seed_content(db)
        await db.commit()
        await make_tea(db, "В наличии")
        await make_tea(db, "Закончился", stock=0)
        await make_event(db, container, "Ближайшая", days=2)
        await make_event(db, container, "Прошедшая", days=-2)
        blocks = {b["kind"]: b for b in (await client.get("/api/home")).json()["blocks"]}
        assert [p["name"] for p in blocks["featured"]["products"]] == ["В наличии"]
        assert [e["title"] for e in blocks["events"]["events"]] == ["Ближайшая"]

    async def test_thursday_block(self, client: AsyncClient, db: AsyncSession) -> None:
        await seed_content(db)
        tea = await make_tea(
            db,
            "Да Хун Пао",
            brewing={
                "methods": [
                    {"method": "gongfu", "temp_c": 95, "grams": 6, "volume_ml": 100, "steeps": 7}
                ]
            },
        )
        plan = ThursdayPlan(date=date(2026, 10, 1))
        plan.products = [tea]
        db.add(plan)
        await db.commit()
        blocks = {b["kind"]: b for b in (await client.get("/api/home")).json()["blocks"]}
        thursday = blocks["thursday"]
        assert thursday["thursday"]["ends_on_label"] == "8 октября"
        assert thursday["thursday"]["percent"] == 20
        assert thursday["products"][0]["brewing_summary"]["temp"] == "95°"


class TestPages:
    async def test_published_page(self, client: AsyncClient, db: AsyncSession) -> None:
        db.add(
            Page(
                slug="about",
                title="О магазине",
                content={"type": "doc", "content": []},
                is_published=True,
            )
        )
        db.add(Page(slug="draft", title="Черновик", is_published=False))
        await db.commit()
        assert (await client.get("/api/pages/about")).json()["title"] == "О магазине"
        assert (await client.get("/api/pages/draft")).status_code == 404

    async def test_guides_list(self, client: AsyncClient, db: AsyncSession) -> None:
        db.add(Page(slug="gongfu", title="Пролив", kind="guide", is_published=True, sort_order=2))
        db.add(Page(slug="termos", title="Термос", kind="guide", is_published=True, sort_order=1))
        await db.commit()
        guides = (await client.get("/api/pages?kind=guide")).json()
        assert [g["title"] for g in guides] == ["Термос", "Пролив"]

    async def test_product_cards_in_text_get_current_data(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Карточка товара внутри статьи показывает актуальные цену и наличие."""
        tea = await make_tea(db, "Шу пуэр Менхай", price_per_gram_kop=1_200, presets=[50])
        hidden = await make_tea(db, "Снятый", status=ProductStatus.HIDDEN)

        def card(slug: str) -> dict[str, object]:
            return {"type": "productCard", "attrs": {"slug": slug, "name": "старое название"}}

        content = {"type": "doc", "content": [card(tea.slug), card(hidden.slug), card("net")]}
        db.add(
            Page(slug="termos", title="Термос", kind="guide", content=content, is_published=True)
        )
        await db.commit()
        body = (await client.get("/api/pages/termos")).json()
        assert set(body["products"]) == {tea.slug}
        assert body["products"][tea.slug]["name"] == "Шу пуэр Менхай"
        assert body["products"][tea.slug]["price_kop"] == 60_000


class TestEvents:
    async def test_upcoming_and_archive(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await make_event(db, container, "Позже", days=10)
        await make_event(db, container, "Раньше", days=3, type_="rafting")
        await make_event(db, container, "Было", days=-3)
        await make_event(db, container, "Скрыто", days=4, published=False)
        upcoming = (await client.get("/api/events")).json()
        assert [e["title"] for e in upcoming] == ["Раньше", "Позже"]
        assert upcoming[0]["type_label"] == "Сплав на сапах"
        rafting = (await client.get("/api/events?type=rafting")).json()
        assert [e["title"] for e in rafting] == ["Раньше"]
        archive = (await client.get("/api/events?period=past")).json()
        assert [e["title"] for e in archive] == ["Было"]

    async def test_seats_left(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        event = await make_event(db, container, seats=4)
        db.add(
            Application(type="event", event_id=event.id, name="А", phone="+79000000000", guests=3)
        )
        db.add(
            Application(
                type="event",
                event_id=event.id,
                name="Б",
                phone="+79000000001",
                guests=1,
                status="cancelled",
            )
        )
        await db.commit()
        body = (await client.get(f"/api/events/{event.slug}")).json()
        assert body["seats_left"] == 1
        assert body["seats_label"] == "Осталось 1 место"


class TestApplications:
    async def test_wholesale(self, client: AsyncClient, db: AsyncSession) -> None:
        db.add(NotificationRecipient(chat_id=9, name="Никита", events=["new_application"]))
        await db.commit()
        response = await client.post(
            "/api/applications",
            json={
                "type": "wholesale",
                "name": "Анна",
                "phone": "8 900 123-45-67",
                "data": {"organization": "Кофейня «Ромашка»", "city": "Владимир"},
                "consent": True,
            },
        )
        assert response.status_code == 201, response.text
        saved = (await db.scalars(select(Application))).one()
        assert saved.phone == "+79001234567"
        assert saved.data["organization"] == "Кофейня «Ромашка»"
        messages = await outbox(db, channel="telegram")
        assert "Новая заявка" in messages[0].body
        assert "Кофейня «Ромашка»" in messages[0].body

    async def test_contact_required(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/applications",
            json={"type": "private_ceremony", "name": "Анна", "consent": True},
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "Укажите телефон или ник в Telegram"

    async def test_consent_required(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/applications",
            json={"type": "wholesale", "name": "Анна", "telegram": "@anna_tea", "consent": False},
        )
        assert response.status_code == 422
        assert "согласие" in response.json()["detail"]

    async def test_honeypot_silently_ignored(self, client: AsyncClient, db: AsyncSession) -> None:
        response = await client.post(
            "/api/applications",
            json={
                "type": "wholesale",
                "name": "Бот",
                "phone": "+79001234567",
                "consent": True,
                "website": "http://spam.example",
            },
        )
        assert response.status_code == 201
        assert (await db.scalars(select(Application))).all() == []

    async def test_rate_limit(self, client: AsyncClient) -> None:
        payload = {"type": "wholesale", "name": "А", "phone": "+79001234567", "consent": True}
        for _ in range(5):
            assert (await client.post("/api/applications", json=payload)).status_code == 201
        response = await client.post("/api/applications", json=payload)
        assert response.status_code == 429

    async def test_event_booking_respects_seats(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        event = await make_event(db, container, seats=2)
        payload = {
            "type": "event",
            "event_id": str(event.id),
            "name": "Анна",
            "phone": "+79001234567",
            "guests": 3,
            "consent": True,
        }
        response = await client.post("/api/applications", json=payload)
        assert response.status_code == 422
        assert response.json()["detail"] == "Осталось мест: 2"
        payload["guests"] = 2
        assert (await client.post("/api/applications", json=payload)).status_code == 201

    async def test_past_event_booking_rejected(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        event = await make_event(db, container, days=-1)
        response = await client.post(
            "/api/applications",
            json={
                "type": "event",
                "event_id": str(event.id),
                "name": "Анна",
                "phone": "+79001234567",
                "consent": True,
            },
        )
        assert response.status_code == 422
        assert "уже прошло" in response.json()["detail"]
