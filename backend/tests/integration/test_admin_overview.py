"""Дашборд (SPEC 10.2), глобальный поиск, журнал действий, получатели уведомлений."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import Application, NotificationRecipient
from app.models.admin import AdminRole
from app.services.seed import seed_content
from tests.factories import make_tea
from tests.helpers import create_admin, login, owner_client
from tests.orders_helpers import buy


async def test_dashboard(client: AsyncClient, db: AsyncSession, container: Container) -> None:
    await seed_content(db)
    tea = await make_tea(db, "Мало осталось", price_per_gram_kop=1_000, presets=[100], stock=150)
    await buy(client, container, [(tea.id, "preset", 100, 1)])
    db.add(Application(type="wholesale", name="Кофейня", phone="+79001234567"))
    await db.commit()
    await owner_client(client, db)

    body = (await client.get("/api/admin/dashboard")).json()
    assert body["attention"]["new_orders"] == 1
    assert body["new_orders"][0]["number"] == "NSB-10001"
    assert body["revenue"]["today_kop"] == body["new_orders"][0]["total_kop"]
    assert body["revenue"]["today_orders"] == 1
    assert [p["name"] for p in body["low_stock"]] == ["Мало осталось"]
    assert body["thursdays"][0]["planned"] is False
    assert body["thursdays"][0]["label"] == "8 октября"
    assert body["new_applications"][0]["name"] == "Кофейня"
    checklist = {item["key"]: item["done"] for item in body["launch_checklist"]}
    assert checklist["telegram"] is False
    assert checklist["legal_pages"] is False
    assert checklist["products"] is True
    # ссылки ведут на существующие экраны админки
    hrefs = {item["key"]: item["href"] for item in body["launch_checklist"]}
    assert hrefs == {
        "telegram": "/admin/profile",
        "requisites": "/admin/settings/store",
        "legal_pages": "/admin/content/pages",
        "products": "/admin/products/new",
        "contacts": "/admin/settings/store",
    }


async def test_staff_dashboard_hides_revenue(client: AsyncClient, db: AsyncSession) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=["orders"],
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")
    body = (await client.get("/api/admin/dashboard")).json()
    assert body["revenue"] is None
    assert body["launch_checklist"] == []


async def test_global_search(client: AsyncClient, db: AsyncSession, container: Container) -> None:
    tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=5000)
    await buy(client, container, [(tea.id, "preset", 100, 1)])
    await owner_client(client, db)
    by_name = (await client.get("/api/admin/search?q=хун")).json()
    assert by_name["products"][0]["name"] == "Да Хун Пао"
    by_number = (await client.get("/api/admin/search?q=10001")).json()
    assert by_number["orders"][0]["number"] == "NSB-10001"
    by_phone = (await client.get("/api/admin/search?q=9001234567")).json()
    assert by_phone["customers"][0]["email"] == "anna@mail.ru"


async def test_audit_log(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    await client.post("/api/admin/categories", json={"name": "Улун"})
    body = (await client.get("/api/admin/audit")).json()
    actions = [e["action"] for e in body["items"]]
    assert "category.create" in actions
    entry = next(e for e in body["items"] if e["action"] == "category.create")
    assert entry["actor_name"] == "Никита"
    assert entry["summary"] == "Создана категория «Улун»"


async def test_audit_is_owner_only(client: AsyncClient, db: AsyncSession) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=["orders", "products"],
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")
    assert (await client.get("/api/admin/audit")).status_code == 403


async def test_notification_recipients(client: AsyncClient, db: AsyncSession) -> None:
    db.add(NotificationRecipient(chat_id=42, name="Никита", events=["new_order"]))
    await db.commit()
    await owner_client(client, db)
    listing = (await client.get("/api/admin/notifications")).json()
    assert listing["recipients"][0]["chat_id"] == 42
    assert any(e["value"] == "weekly_summary" for e in listing["events"])
    recipient_id = listing["recipients"][0]["id"]
    updated = await client.patch(
        f"/api/admin/notifications/{recipient_id}",
        json={"events": ["new_order", "weekly_summary"], "is_active": True},
    )
    assert updated.json()["events"] == ["new_order", "weekly_summary"]
    link = await client.post("/api/admin/notifications/link")
    assert link.json()["deep_link"].startswith("https://t.me/nsbtea_test_bot?start=")
    assert (await client.delete(f"/api/admin/notifications/{recipient_id}")).status_code == 200


async def test_audit_log_period_filter(client: AsyncClient, db: AsyncSession) -> None:
    """Фильтр «за период» — дни по Москве, обе границы включительно."""
    from datetime import UTC, datetime

    from app.models import AuditLog

    await owner_client(client, db)
    for at, summary in [
        (datetime(2026, 10, 1, 20, 59, tzinfo=UTC), "1 октября, 23:59 МСК"),
        (datetime(2026, 10, 1, 21, 0, tzinfo=UTC), "2 октября, 00:00 МСК"),
        (datetime(2026, 10, 3, 20, 59, tzinfo=UTC), "3 октября, 23:59 МСК"),
        (datetime(2026, 10, 3, 21, 0, tzinfo=UTC), "4 октября, 00:00 МСК"),
    ]:
        db.add(AuditLog(at=at, actor_name="Никита", action="x", entity="test", summary=summary))
    await db.commit()
    body = (
        await client.get(
            "/api/admin/audit",
            params={"entity": "test", "date_from": "2026-10-02", "date_to": "2026-10-03"},
        )
    ).json()
    assert [e["summary"] for e in body["items"]] == ["3 октября, 23:59 МСК", "2 октября, 00:00 МСК"]
    assert body["total"] == 2
