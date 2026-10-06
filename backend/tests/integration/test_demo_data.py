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
    assert teas
    assert all(p["hanzi"] for p in teas)
    assert any(p["type"] == "unit" for p in page["items"])

    # остатки заведены через журнал движения (правило 3): остаток = сумма движений
    sums = dict(
        (
            await db.execute(
                select(InventoryMovement.product_id, func.sum(InventoryMovement.delta)).group_by(
                    InventoryMovement.product_id
                )
            )
        ).all()
    )
    for product in (await db.scalars(select(Product))).all():
        assert product.stock == sums.get(product.id, 0), product.name
    assert any(p["in_stock"] is False for p in page["items"])  # есть пример «нет в наличии»
