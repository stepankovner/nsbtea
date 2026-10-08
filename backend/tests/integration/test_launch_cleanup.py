"""Очистка тестовых данных перед запуском (ROADMAP, M6).

Владелец наполняет каталог на тестовом сервере и проходит пробные покупки. Перед запуском
пробные заказы, покупатели, баллы, корзины и письма удаляются, а товары, тексты, настройки,
сотрудники, акции и поставки остаются. Остатки возвращаются так, будто пробных заказов не было,
причём только через журнал движений (CLAUDE.md, правило 3): баланс = сумма журнала.
"""

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.inventory import MovementReason
from app.models import (
    AdminUser,
    Application,
    AuditLog,
    Cart,
    Customer,
    InventoryMovement,
    LoginCode,
    Order,
    OutboxMessage,
    Page,
    Payment,
    PointsTransaction,
    Product,
    Supply,
    WebhookEvent,
)
from app.services.inventory import Line, post_supply
from app.services.launch_cleanup import clear_test_data
from tests.factories import make_tea, make_unit
from tests.helpers import OWNER_EMAIL, owner_client
from tests.orders_helpers import buy

PICKUP = {"method": "pickup"}


async def _count(db: AsyncSession, model: type) -> int:
    return int(await db.scalar(select(func.count()).select_from(model)) or 0)


async def _journal_sum(db: AsyncSession, product: Product) -> int:
    total = await db.scalar(
        select(func.coalesce(func.sum(InventoryMovement.delta), 0)).where(
            InventoryMovement.product_id == product.id
        )
    )
    return int(total or 0)


async def _shop_with_test_orders(
    client: AsyncClient, db: AsyncSession, container: Container
) -> tuple[Product, Product]:
    tea = await make_tea(db, "Да Хун Пао", presets=[100], stock=0)
    unit = await make_unit(db, "Гайвань", stock=0)
    await owner_client(client, db)
    owner = await db.scalar(select(AdminUser).where(AdminUser.email == OWNER_EMAIL))
    assert owner is not None
    await post_supply(
        db,
        container,
        owner,
        lines=[Line(tea.id, 1000), Line(unit.id, 10)],
        comment="Первая поставка",
    )
    await db.commit()

    # оплачен и выполнен — у покупателя баллы
    done = await buy(client, container, [(tea.id, "preset", 100, 1)], delivery=PICKUP)
    for step in ("assembling", "shipped", "completed"):
        response = await client.post(f"/api/admin/orders/{done}/status", json={"to": step})
        assert response.status_code == 200, response.text
    # оплачен, ещё не собран
    await buy(
        client, container, [(tea.id, "preset", 100, 2)], email="b@mail.ru", delivery=PICKUP
    )
    # не оплачен — товар в резерве
    await buy(
        client, container, [(unit.id, "unit", 0, 1)], email="c@mail.ru", delivery=PICKUP, pay=False
    )
    # отменён с возвратом на склад — остаток уже на месте
    cancelled = await buy(
        client, container, [(unit.id, "unit", 0, 2)], email="d@mail.ru", delivery=PICKUP
    )
    response = await client.post(f"/api/admin/orders/{cancelled}/cancel", json={"restock": True})
    assert response.status_code == 200, response.text

    db.add(Application(type="wholesale", name="Тест", phone="+79001234567"))
    await db.commit()
    return tea, unit


async def test_removes_test_orders_and_customers_keeps_shop(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    tea, unit = await _shop_with_test_orders(client, db, container)
    assert await _count(db, PointsTransaction) > 0
    assert await _count(db, OutboxMessage) > 0
    pages_before = await _count(db, Page)

    report = await clear_test_data(db, container)
    await db.commit()

    assert report.orders == 4
    assert report.customers == 4
    assert report.applications == 1
    for model in (
        Order,
        Payment,
        Customer,
        PointsTransaction,
        Cart,
        LoginCode,
        Application,
        OutboxMessage,
        WebhookEvent,
    ):
        assert await _count(db, model) == 0, model.__name__

    # магазин на месте
    assert await _count(db, Product) == 2
    assert await _count(db, Supply) == 1
    assert await _count(db, Page) == pages_before
    assert await db.scalar(select(AdminUser).where(AdminUser.email == OWNER_EMAIL)) is not None


async def test_stock_returns_to_supplied_amount_through_journal(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    tea, unit = await _shop_with_test_orders(client, db, container)
    await db.refresh(tea)
    await db.refresh(unit)
    assert tea.stock == 700  # 100 выполнен + 200 оплачен
    assert unit.stock == 9  # 1 в резерве, 2 отменены с возвратом

    report = await clear_test_data(db, container)
    await db.commit()

    await db.refresh(tea)
    await db.refresh(unit)
    assert tea.stock == 1000
    assert unit.stock == 10
    assert report.restocked == {"Да Хун Пао": 300, "Гайвань": 1}
    # баланс = сумма журнала, возврат записан понятной строкой
    assert await _journal_sum(db, tea) == tea.stock
    assert await _journal_sum(db, unit) == unit.stock
    returned = await db.scalar(
        select(InventoryMovement).where(
            InventoryMovement.product_id == tea.id,
            InventoryMovement.reason == MovementReason.ADJUSTMENT.value,
        )
    )
    assert returned is not None
    assert returned.delta == 300
    assert returned.comment is not None and "тестовых заказов" in returned.comment


async def test_keep_applications_and_audit_entry(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    await _shop_with_test_orders(client, db, container)

    report = await clear_test_data(db, container, keep_applications=True)
    await db.commit()

    assert report.applications == 0
    assert await _count(db, Application) == 1
    entry = await db.scalar(select(AuditLog).where(AuditLog.action == "system.clear_test_data"))
    assert entry is not None
    assert "4" in entry.summary


async def test_empty_shop_is_a_no_op(db: AsyncSession, container: Container) -> None:
    report = await clear_test_data(db, container)
    await db.commit()
    assert report.orders == 0
    assert report.customers == 0
    assert report.restocked == {}
