"""Настройки магазина в админке (SPEC 10.10)."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog
from app.models.admin import AdminRole
from app.services.settings import get_group
from app.services.settings_schema import CatalogSettings, LoyaltySettings
from tests.helpers import create_admin, login, owner_client


async def test_defaults_without_saved_values(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    response = await client.get("/api/admin/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["loyalty"]["earn_percent"] == 5
    assert body["loyalty"]["max_spend_percent"] == 50
    assert body["loyalty"]["welcome_percent"] == 10
    assert body["catalog"]["weight_presets"] == [25, 50, 100, 200]
    assert body["catalog"]["low_stock_tea_grams"] == 50
    assert body["catalog"]["low_stock_units"] == 2
    assert body["thursday"]["percent"] == 20
    assert body["delivery"]["packaging_grams"] == 50
    assert body["delivery"]["origin_city_code"] == 94
    assert body["payment"]["vat_type"] == "none"


async def test_update_group(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    response = await client.put(
        "/api/admin/settings/loyalty",
        json={
            "earn_percent": 7,
            "max_spend_percent": 30,
            "welcome_enabled": True,
            "welcome_percent": 15,
            "points_ttl_days": None,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["earn_percent"] == 7

    loyalty = await get_group(db, LoyaltySettings)
    assert loyalty.earn_percent == 7
    assert loyalty.welcome_percent == 15

    entry = (await db.scalars(select(AuditLog).where(AuditLog.action == "settings.update"))).one()
    assert entry.diff["earn_percent"] == [5, 7]


async def test_validation_message(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    response = await client.put(
        "/api/admin/settings/loyalty",
        json={"earn_percent": 150, "max_spend_percent": 50, "welcome_percent": 10},
    )
    assert response.status_code == 422
    errors = {e["field"]: e["message"] for e in response.json()["errors"]}
    assert errors["earn_percent"] == "Должно быть не больше 100"


async def test_presets_are_cleaned(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    response = await client.put(
        "/api/admin/settings/catalog",
        json={
            "weight_presets": [100, 25, 50, 25],
            "low_stock_tea_grams": 40,
            "low_stock_units": 1,
            "new_badge_days": 21,
            "out_of_stock_last": True,
        },
    )
    assert response.status_code == 200, response.text
    catalog = await get_group(db, CatalogSettings)
    assert catalog.weight_presets == [25, 50, 100]


async def test_unknown_group(client: AsyncClient, db: AsyncSession) -> None:
    await owner_client(client, db)
    response = await client.put("/api/admin/settings/hack", json={})
    assert response.status_code == 404


async def test_staff_has_no_access(client: AsyncClient, db: AsyncSession) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=["orders", "inventory", "products"],
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")
    assert (await client.get("/api/admin/settings")).status_code == 403
