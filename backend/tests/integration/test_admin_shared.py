"""Общие инструменты админки: загрузка картинок и выбор товаров из разных разделов."""

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminRole
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
    await make_tea(db, "Снятый в архив", archived_at=datetime(2026, 10, 1, tzinfo=UTC))
    cup = await make_unit(db, "Гайвань", stock=0)
    await staff(client, db, ["promotions"])

    found = (await client.get("/api/admin/lookup/products", params={"q": "хун"})).json()
    assert [p["name"] for p in found] == ["Да Хун Пао"]
    assert found[0]["id"] == str(tea.id)
    assert found[0]["slug"] == tea.slug  # для карточки товара в тексте страницы
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


async def test_product_lookup_gives_stock_number_and_all_requested_ids(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Склад: «было → станет» считается от числа, а выбранных товаров бывает больше 30."""
    teas = [await make_tea(db, f"Чай {i:02d}", stock=i * 10) for i in range(35)]
    await staff(client, db, ["inventory"])
    ids = ",".join(str(t.id) for t in teas)
    found = (await client.get("/api/admin/lookup/products", params={"ids": ids})).json()
    assert len(found) == 35
    by_name = {p["name"]: p for p in found}
    assert by_name["Чай 07"]["stock"] == 70
    assert by_name["Чай 07"]["stock_label"] == "70 г"


async def test_categories_are_visible_to_promotions_staff(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Акцию можно настроить на категорию — сотруднику раздела «Акции» нужен их список."""
    await make_tea(db)
    await staff(client, db, ["promotions"])
    assert (await client.get("/api/admin/categories")).status_code == 200


async def test_categories_are_hidden_from_unrelated_staff(
    client: AsyncClient, db: AsyncSession
) -> None:
    await staff(client, db, ["orders"])
    assert (await client.get("/api/admin/categories")).status_code == 403
