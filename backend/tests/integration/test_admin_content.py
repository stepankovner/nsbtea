"""Контент в админке (SPEC 10.8): страницы, блоки главной, события, заявки."""

from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import Application
from app.services.seed import seed_content
from tests.helpers import owner_client

DOC = {
    "type": "doc",
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Текст"}]}],
}


class TestPages:
    async def test_create_publish_archive(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/pages",
            json={"title": "Как заваривать пуэр", "kind": "guide", "content": DOC},
        )
        assert created.status_code == 201, created.text
        page = created.json()
        assert page["slug"] == "kak-zavarivat-puer"
        assert page["is_published"] is False
        assert (await client.get(f"/api/pages/{page['slug']}")).status_code == 404

        published = await client.patch(
            f"/api/admin/pages/{page['id']}", json={"is_published": True}
        )
        assert published.json()["is_published"] is True
        assert (await client.get(f"/api/pages/{page['slug']}")).status_code == 200

        assert (await client.delete(f"/api/admin/pages/{page['id']}")).status_code == 200
        assert (await client.get(f"/api/pages/{page['slug']}")).status_code == 404
        listing = (await client.get("/api/admin/pages")).json()
        assert listing == []

    async def test_bad_document(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        response = await client.post(
            "/api/admin/pages",
            json={"title": "Х", "content": {"type": "doc", "content": [{"type": "script"}]}},
        )
        assert response.status_code == 422

    async def test_legal_pages_warning(self, client: AsyncClient, db: AsyncSession) -> None:
        await seed_content(db)
        await db.commit()
        await owner_client(client, db)
        pages = (await client.get("/api/admin/pages")).json()
        offer = next(p for p in pages if p["slug"] == "offer")
        assert offer["is_published"] is False
        assert offer["required"] is True


class TestHomeBlocks:
    async def test_edit_reorder_hide(self, client: AsyncClient, db: AsyncSession) -> None:
        await seed_content(db)
        await db.commit()
        await owner_client(client, db)
        blocks = (await client.get("/api/admin/home-blocks")).json()
        hero = next(b for b in blocks if b["kind"] == "hero")
        assert hero["label"] == "Главный баннер"

        data = dict(hero["data"]) | {"title_line1": "Чай с характером"}
        saved = await client.patch("/api/admin/home-blocks/hero", json={"data": data})
        assert saved.status_code == 200
        home = (await client.get("/api/home")).json()
        assert home["blocks"][0]["data"]["title_line1"] == "Чай с характером"

        kinds = [b["kind"] for b in blocks]
        reordered = [kinds[1], kinds[0], *kinds[2:]]
        assert (
            await client.post("/api/admin/home-blocks/reorder", json={"kinds": reordered})
        ).status_code == 200
        hidden = await client.patch("/api/admin/home-blocks/hero", json={"is_visible": False})
        assert hidden.json()["is_visible"] is False
        public = [b["kind"] for b in (await client.get("/api/home")).json()["blocks"]]
        assert "hero" not in public


class TestEvents:
    async def test_crud(self, client: AsyncClient, db: AsyncSession, container: Container) -> None:
        await owner_client(client, db)
        starts = container.clock.now() + timedelta(days=5)
        created = await client.post(
            "/api/admin/events",
            json={
                "type": "rafting",
                "title": "Сплав по Клязьме",
                "starts_at": starts.isoformat(),
                "place": "Клязьма",
                "duration_text": "около 4 часов",
                "price_kop": 350_000,
                "seats_total": 8,
                "note": "Закрытие сезона",
                "is_published": True,
            },
        )
        assert created.status_code == 201, created.text
        event = created.json()
        assert event["slug"] == "splav-po-klyazme"
        assert event["seats_left"] == 8

        public = (await client.get("/api/events")).json()
        assert public[0]["title"] == "Сплав по Клязьме"

        updated = await client.patch(f"/api/admin/events/{event['id']}", json={"seats_total": 6})
        assert updated.json()["seats_total"] == 6
        assert (await client.delete(f"/api/admin/events/{event['id']}")).status_code == 200
        assert (await client.get("/api/events")).json() == []


class TestApplications:
    async def test_list_and_update(self, client: AsyncClient, db: AsyncSession) -> None:
        db.add(
            Application(
                type="wholesale", name="Кофейня", phone="+79001234567", data={"city": "Владимир"}
            )
        )
        db.add(
            Application(type="private_ceremony", name="Ира", telegram="ira_tea", status="closed")
        )
        await db.commit()
        await owner_client(client, db)
        listing = (await client.get("/api/admin/applications")).json()
        assert listing["total"] == 2
        assert listing["counts"]["new"] == 1
        new = (await client.get("/api/admin/applications?status=new")).json()["items"]
        assert new[0]["type_label"] == "Опт"
        assert new[0]["status_label"] == "Новая"
        updated = await client.patch(
            f"/api/admin/applications/{new[0]['id']}",
            json={"status": "in_progress", "admin_comment": "Отправил прайс"},
        )
        assert updated.json()["status"] == "in_progress"
        assert updated.json()["admin_comment"] == "Отправил прайс"


class TestContentFollowUps:
    async def test_site_url_matches_storefront_paths(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Страницы магазина открываются по /{адрес}, гайды — /guides/…, документы — /legal/…"""
        await seed_content(db)
        await db.commit()
        await owner_client(client, db)
        pages = {p["slug"]: p for p in (await client.get("/api/admin/pages")).json()}
        assert pages["about"]["site_url"].endswith("/about")
        assert "/pages/" not in pages["about"]["site_url"]
        assert pages["gongfu"]["site_url"].endswith("/guides/gongfu")
        assert pages["offer"]["site_url"].endswith("/legal/offer")

    async def test_event_archive_restore_and_audit(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        """Удаление — в архив с возможностью восстановить (SPEC 10.1), всё — в журнале."""
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/events",
            json={
                "title": "Церемония",
                "starts_at": (container.clock.now() + timedelta(days=3)).isoformat(),
                "is_published": True,
            },
        )
        event_id = created.json()["id"]
        await client.delete(f"/api/admin/events/{event_id}")
        archived = (await client.get("/api/admin/events?period=archived")).json()
        assert [e["title"] for e in archived] == ["Церемония"]
        assert (await client.get("/api/admin/events")).json() == []

        restored = await client.post(f"/api/admin/events/{event_id}/restore")
        assert restored.status_code == 200, restored.text
        assert restored.json()["is_published"] is False  # вернуть на сайт — осознанно
        assert [e["title"] for e in (await client.get("/api/admin/events")).json()] == ["Церемония"]
        actions = [e["action"] for e in (await client.get("/api/admin/audit")).json()["items"]]
        assert "event.archive" in actions
        assert "event.restore" in actions

    async def test_page_restore_and_blocks_reorder_are_audited(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await seed_content(db)
        await db.commit()
        await owner_client(client, db)
        page = (
            await client.post("/api/admin/pages", json={"title": "Временная", "content": DOC})
        ).json()
        await client.delete(f"/api/admin/pages/{page['id']}")
        await client.post(f"/api/admin/pages/{page['id']}/restore")
        kinds = [b["kind"] for b in (await client.get("/api/admin/home-blocks")).json()]
        await client.post("/api/admin/home-blocks/reorder", json={"kinds": kinds[::-1]})
        actions = [e["action"] for e in (await client.get("/api/admin/audit")).json()["items"]]
        assert "page.restore" in actions
        assert "home_blocks.reorder" in actions

    async def test_event_patch_rejects_empty_required_fields(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/events",
            json={
                "title": "Церемония",
                "starts_at": (container.clock.now() + timedelta(days=3)).isoformat(),
            },
        )
        event_id = created.json()["id"]
        for field in ("title", "starts_at", "slug", "type"):
            response = await client.patch(f"/api/admin/events/{event_id}", json={field: None})
            assert response.status_code == 422, (field, response.text)

    async def test_applications_of_one_event(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        from app.models import Event

        first = Event(
            type="ceremony",
            title="Первая",
            slug="pervaya",
            starts_at=container.clock.now() + timedelta(days=2),
        )
        second = Event(
            type="ceremony",
            title="Вторая",
            slug="vtoraya",
            starts_at=container.clock.now() + timedelta(days=4),
        )
        db.add_all([first, second])
        await db.flush()
        db.add(Application(type="event", event_id=first.id, name="Аня"))
        db.add(Application(type="event", event_id=second.id, name="Борис"))
        await db.commit()
        await owner_client(client, db)
        listing = (await client.get(f"/api/admin/applications?event_id={first.id}")).json()
        assert [a["name"] for a in listing["items"]] == ["Аня"]
        assert listing["total"] == 1
