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
