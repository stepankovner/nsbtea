"""Общие инструменты админки: загрузка картинок и выбор товаров из разных разделов."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminRole
from app.models.catalog import ProductStatus
from tests.factories import jpeg_bytes, make_tea, make_unit
from tests.helpers import create_admin, login


async def staff(client: AsyncClient, db: AsyncSession, permissions: list[str]) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=permissions,
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")


async def test_content_editor_can_upload_images(client: AsyncClient, db: AsyncSession) -> None:
    await staff(client, db, ["content"])
    response = await client.post(
        "/api/admin/media", files={"file": ("cover.jpg", jpeg_bytes(), "image/jpeg")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["srcset"]["640"].endswith(".webp")


async def test_orders_only_staff_cannot_upload_images(
    client: AsyncClient, db: AsyncSession
) -> None:
    await staff(client, db, ["orders"])
    response = await client.post(
        "/api/admin/media", files={"file": ("x.jpg", jpeg_bytes(), "image/jpeg")}
    )
    assert response.status_code == 403


async def test_product_lookup_for_promotions(client: AsyncClient, db: AsyncSession) -> None:
    tea = await make_tea(db, "Да Хун Пао", stock=40)
    await make_tea(db, "Снятый в архив", status=ProductStatus.ARCHIVED)
    cup = await make_unit(db, "Гайвань", stock=0)
    await staff(client, db, ["promotions"])

    found = (await client.get("/api/admin/lookup/products", params={"q": "хун"})).json()
    assert [p["name"] for p in found] == ["Да Хун Пао"]
    assert found[0]["id"] == str(tea.id)
    assert found[0]["type"] == "tea"
    assert found[0]["stock_label"] == "40 г"

    everything = (await client.get("/api/admin/lookup/products")).json()
    assert {p["name"] for p in everything} == {"Да Хун Пао", "Гайвань"}  # без архива

    by_ids = (
        await client.get("/api/admin/lookup/products", params={"ids": f"{cup.id},{tea.id}"})
    ).json()
    assert {p["name"] for p in by_ids} == {"Да Хун Пао", "Гайвань"}


async def test_product_lookup_needs_some_catalog_related_access(
    client: AsyncClient, db: AsyncSession
) -> None:
    await staff(client, db, ["applications"])
    assert (await client.get("/api/admin/lookup/products")).status_code == 403
