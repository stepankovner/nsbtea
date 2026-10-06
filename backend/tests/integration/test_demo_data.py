"""Демо-каталог для тестового сервера: владелец видит, как выглядит витрина, до наполнения."""

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import InventoryMovement, Product
from app.services.seed import seed_categories, seed_content, seed_demo_catalog


async def test_demo_catalog_is_visible_and_idempotent(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    await seed_categories(db)
    await seed_content(db)
    created = await seed_demo_catalog(db, container)
    await db.commit()
    assert created >= 8

    again = await seed_demo_catalog(db, container)
    await db.commit()
    assert again == 0  # повторный запуск ничего не дублирует

    page = (await client.get("/api/catalog/products?per_page=100")).json()
    assert page["total"] == created
    teas = [p for p in page["items"] if p["type"] == "tea"]
    assert teas and all(p["hanzi"] for p in teas)
    assert any(p["type"] == "unit" for p in page["items"])

    # остатки заведены через журнал движения, как требует правило 3
    products = int(await db.scalar(select(func.count()).select_from(Product)) or 0)
    movements = int(await db.scalar(select(func.count()).select_from(InventoryMovement)) or 0)
    assert movements == products
