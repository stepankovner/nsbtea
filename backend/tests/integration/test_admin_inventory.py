"""Склад (SPEC 10.4): поставка, инвентаризация, списание, история, «нужно дозаказать»,
уведомления об остатках (SPEC 11.1). Атомарность списания (CLAUDE.md, правило 3)."""

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import InsufficientStockError, NotFoundError
from app.domain.inventory import MovementReason
from app.models import InventoryMovement, NotificationRecipient, Product
from app.models.system import NotificationEvent
from app.services import inventory
from tests.factories import make_tea, make_unit
from tests.helpers import outbox, owner_client


async def add_recipient(db: AsyncSession, chat_id: int = 100) -> None:
    db.add(
        NotificationRecipient(
            chat_id=chat_id, name="Никита", events=[e.value for e in NotificationEvent]
        )
    )
    await db.commit()


class TestSupply:
    async def test_supply_increases_stock_and_writes_history(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао", stock=100)
        cup = await make_unit(db, "Чаша", stock=1)
        response = await client.post(
            "/api/admin/inventory/supplies",
            json={
                "comment": "Поставщик: Ли, Уишань",
                "lines": [
                    {"product_id": str(tea.id), "qty": 1_000},
                    {"product_id": str(cup.id), "qty": 6},
                ],
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["lines"][0]["balance_after"] == 1_100
        assert body["lines"][0]["qty_label"] == "1 000 г"
        assert body["lines"][1]["balance_after"] == 7

        await db.refresh(tea)
        assert tea.stock == 1_100
        history = (await client.get(f"/api/admin/inventory/movements?product_id={tea.id}")).json()
        assert history["items"][0]["reason_label"] == "Поставка"
        assert history["items"][0]["delta_label"] == "+1 000 г"
        assert history["items"][0]["comment"] == "Поставщик: Ли, Уишань"
        assert history["items"][0]["actor_name"] == "Никита"

    async def test_supply_validation(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        response = await client.post(
            "/api/admin/inventory/supplies",
            json={"lines": [{"product_id": str(tea.id), "qty": 0}]},
        )
        assert response.status_code == 422

    async def test_supply_requires_lines(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        response = await client.post("/api/admin/inventory/supplies", json={"lines": []})
        assert response.status_code == 422

    async def test_supplies_list(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        await client.post(
            "/api/admin/inventory/supplies",
            json={"comment": "Первая", "lines": [{"product_id": str(tea.id), "qty": 50}]},
        )
        listing = (await client.get("/api/admin/inventory/supplies")).json()
        assert listing["items"][0]["comment"] == "Первая"
        assert listing["items"][0]["lines_count"] == 1


class TestCountAndWriteoff:
    async def test_inventory_count_creates_adjustments(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, stock=200)
        same = await make_tea(db, "Шу", stock=50)
        response = await client.post(
            "/api/admin/inventory/count",
            json={
                "comment": "Пересчёт перед Новым годом",
                "lines": [
                    {"product_id": str(tea.id), "actual": 180},
                    {"product_id": str(same.id), "actual": 50},
                ],
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["changed"] == 1
        assert body["lines"][0]["delta"] == -20
        await db.refresh(tea)
        assert tea.stock == 180
        movements = (
            await db.scalars(
                select(InventoryMovement).where(InventoryMovement.product_id == same.id)
            )
        ).all()
        assert movements == []  # без расхождения — без записи

    async def test_writeoff(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, stock=150)
        response = await client.post(
            "/api/admin/inventory/writeoffs",
            json={
                "reason": "tasting",
                "comment": "Дегустация в субботу",
                "lines": [{"product_id": str(tea.id), "qty": 30}],
            },
        )
        assert response.status_code == 200, response.text
        await db.refresh(tea)
        assert tea.stock == 120
        movement = (await db.scalars(select(InventoryMovement))).one()
        assert movement.reason == MovementReason.WRITEOFF.value
        assert movement.comment == "Дегустация: Дегустация в субботу"

    async def test_writeoff_more_than_stock(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, "Шу", stock=150)
        response = await client.post(
            "/api/admin/inventory/writeoffs",
            json={"reason": "defect", "lines": [{"product_id": str(tea.id), "qty": 200}]},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "«Шу»: нельзя списать 200 г: на складе 150 г"
        await db.refresh(tea)
        assert tea.stock == 150


class TestReorder:
    async def test_reorder_list(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        await make_tea(db, "Много", stock=500)
        await make_tea(db, "Мало", stock=50)  # = порогу 50 г — уже «мало»
        await make_unit(db, "Закончилась", stock=0)
        await make_unit(db, "Своя граница", stock=4, low_stock_threshold=5)
        response = await client.get("/api/admin/inventory/reorder")
        names = [row["name"] for row in response.json()["items"]]
        assert names == ["Закончилась", "Мало", "Своя граница"]

    async def test_stock_table(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао", stock=40)
        await client.post(
            "/api/admin/inventory/supplies",
            json={"lines": [{"product_id": str(tea.id), "qty": 10}]},
        )
        rows = (await client.get("/api/admin/inventory")).json()["items"]
        assert rows[0]["stock_label"] == "50 г"
        assert rows[0]["threshold"] == 50
        assert rows[0]["level"] == "low"
        assert rows[0]["last_supply_at"] is not None


class TestAtomicity:
    async def test_cannot_go_negative_concurrently(
        self, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, stock=100)

        async def take(amount: int) -> bool:
            async with container.session_factory() as session:
                try:
                    await inventory.change_stock(
                        session, container, tea.id, -amount, MovementReason.SALE
                    )
                    await session.commit()
                    return True
                except InsufficientStockError:
                    await session.rollback()
                    return False

        results = await asyncio.gather(*(take(30) for _ in range(5)))
        assert results.count(True) == 3
        await db.refresh(tea)
        assert tea.stock == 10
        count = await db.scalar(select(func.count()).select_from(InventoryMovement))
        assert count == 3

    async def test_balance_after_is_recorded(self, db: AsyncSession, container: Container) -> None:
        tea = await make_tea(db, stock=100)
        async with container.session_factory() as session:
            movement = await inventory.change_stock(
                session, container, tea.id, -40, MovementReason.SALE
            )
            await session.commit()
        assert movement.balance_after == 60

    async def test_unknown_product(self, db: AsyncSession, container: Container) -> None:
        async with container.session_factory() as session:
            with pytest.raises(NotFoundError):
                await inventory.change_stock(
                    session, container, uuid.uuid4(), 10, MovementReason.SUPPLY
                )


class TestAlerts:
    async def test_low_stock_notifies_once(self, db: AsyncSession, container: Container) -> None:
        await add_recipient(db)
        tea = await make_tea(db, "Да Хун Пао", stock=80)
        for amount in (-40, -10):
            async with container.session_factory() as session:
                await inventory.change_stock(
                    session, container, tea.id, amount, MovementReason.SALE
                )
                await session.commit()
        messages = await outbox(db, channel="telegram")
        assert len(messages) == 1
        assert "Осталось мало" in messages[0].body
        assert "Да Хун Пао" in messages[0].body
        assert "40 г" in messages[0].body

    async def test_out_of_stock(self, db: AsyncSession, container: Container) -> None:
        await add_recipient(db)
        cup = await make_unit(db, "Чаша", stock=1)
        async with container.session_factory() as session:
            await inventory.change_stock(session, container, cup.id, -1, MovementReason.SALE)
            await session.commit()
        messages = await outbox(db, channel="telegram")
        assert len(messages) == 1
        assert "Закончился" in messages[0].body

    async def test_recipient_without_event_gets_nothing(
        self, db: AsyncSession, container: Container
    ) -> None:
        db.add(NotificationRecipient(chat_id=5, name="Только заказы", events=["new_order"]))
        await db.commit()
        tea = await make_tea(db, stock=60)
        async with container.session_factory() as session:
            await inventory.change_stock(session, container, tea.id, -30, MovementReason.SALE)
            await session.commit()
        assert await outbox(db) == []

    async def test_product_threshold_override(self, db: AsyncSession, container: Container) -> None:
        await add_recipient(db)
        tea = await make_tea(db, stock=300, low_stock_threshold=200)
        async with container.session_factory() as session:
            await inventory.change_stock(session, container, tea.id, -150, MovementReason.SALE)
            await session.commit()
        assert len(await outbox(db)) == 1
        product = await db.get(Product, tea.id)
        assert product is not None


class TestSupplyDetails:
    async def test_movements_of_one_supply(self, client: AsyncClient, db: AsyncSession) -> None:
        """«Поставки» → что пришло в этой поставке."""
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао", stock=0)
        cup = await make_unit(db, "Чаша", stock=0)
        first = await client.post(
            "/api/admin/inventory/supplies",
            json={
                "comment": "Ли",
                "lines": [
                    {"product_id": str(tea.id), "qty": 500},
                    {"product_id": str(cup.id), "qty": 3},
                ],
            },
        )
        await client.post(
            "/api/admin/inventory/supplies",
            json={"lines": [{"product_id": str(tea.id), "qty": 100}]},
        )
        supply_id = first.json()["id"]
        rows = (await client.get(f"/api/admin/inventory/movements?supply_id={supply_id}")).json()
        assert rows["total"] == 2
        assert {r["product_name"] for r in rows["items"]} == {"Да Хун Пао", "Чаша"}

    async def test_supply_audit_shows_units(self, client: AsyncClient, db: AsyncSession) -> None:
        """Журнал действий: «Остаток: 100 г → 600 г», а не голые числа."""
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао", stock=100)
        await client.post(
            "/api/admin/inventory/supplies",
            json={"lines": [{"product_id": str(tea.id), "qty": 500}]},
        )
        audit = (await client.get("/api/admin/audit?entity=supply")).json()["items"][0]
        assert audit["diff"] == {"Да Хун Пао": ["100 г", "600 г"]}
