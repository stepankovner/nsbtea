"""Клиенты (SPEC 10.6), акции, промокоды и календарь четвергов (SPEC 10.7)."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import AuditLog, Customer, PointsTransaction, ThursdayPlan
from app.models.admin import AdminRole
from tests.factories import make_category, make_tea
from tests.helpers import create_admin, login, owner_client
from tests.orders_helpers import buy


class TestCustomers:
    async def test_list_and_card(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100], stock=5000)
        await buy(client, container, [(tea.id, "preset", 100, 1)])
        await buy(client, container, [(tea.id, "preset", 100, 2)])
        await owner_client(client, db)

        listing = (await client.get("/api/admin/customers")).json()
        assert listing["total"] == 1
        row = listing["items"][0]
        assert row["email"] == "anna@mail.ru"
        assert row["orders_count"] == 2
        found = (await client.get("/api/admin/customers?q=anna")).json()
        assert found["total"] == 1

        card = (await client.get(f"/api/admin/customers/{row['id']}")).json()
        assert card["orders_count"] == 2
        assert (
            card["total_spent_kop"]
            == card["orders"][0]["total_kop"] + card["orders"][1]["total_kop"]
        )
        assert card["average_check_kop"] == card["total_spent_kop"] // 2

    async def test_notes_and_manual_points(self, client: AsyncClient, db: AsyncSession) -> None:
        customer = Customer(email="anna@mail.ru", name="Анна")
        db.add(customer)
        await db.commit()
        await owner_client(client, db)

        notes = await client.patch(
            f"/api/admin/customers/{customer.id}", json={"notes": "Любит шу, брал на ДР жены"}
        )
        assert notes.status_code == 200
        assert notes.json()["notes"] == "Любит шу, брал на ДР жены"

        no_comment = await client.post(
            f"/api/admin/customers/{customer.id}/points", json={"delta": 100, "comment": " "}
        )
        assert no_comment.status_code == 422

        added = await client.post(
            f"/api/admin/customers/{customer.id}/points",
            json={"delta": 300, "comment": "Компенсация за задержку"},
        )
        assert added.status_code == 200, added.text
        assert added.json()["points_balance"] == 300

        too_much = await client.post(
            f"/api/admin/customers/{customer.id}/points",
            json={"delta": -500, "comment": "Ошибка"},
        )
        assert too_much.status_code == 409
        assert "Недостаточно баллов" in too_much.json()["detail"]

        entry = (await db.scalars(select(PointsTransaction))).one()
        assert entry.kind == "manual"
        assert entry.actor_id is not None
        audit = (
            await db.scalars(select(AuditLog).where(AuditLog.action == "customer.points"))
        ).one()
        assert audit.diff["points_balance"] == [0, 300]


class TestPromotions:
    async def test_crud_and_stats(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        cat = await make_category(db, "Улун")
        tea = await make_tea(db, category=cat, price_per_gram_kop=1_000, presets=[100], stock=5000)
        await owner_client(client, db)
        now = container.clock.now()
        created = await client.post(
            "/api/admin/promotions",
            json={
                "title": "Осенние улуны",
                "percent": 15,
                "category_ids": [str(cat.id)],
                "starts_at": (now - timedelta(days=1)).isoformat(),
                "ends_at": (now + timedelta(days=7)).isoformat(),
            },
        )
        assert created.status_code == 201, created.text
        promo_id = created.json()["id"]
        assert created.json()["status_label"] == "Действует"

        client.cookies.delete("nsb_admin")
        await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)

        listing = (await client.get("/api/admin/promotions")).json()
        stats = listing[0]["stats"]
        assert stats["uses"] == 1
        assert stats["discount_kop"] == 15_000

        both = await client.patch(
            f"/api/admin/promotions/{promo_id}", json={"percent": 10, "amount_kop": 5_000}
        )
        assert both.status_code == 422

        archived = await client.delete(f"/api/admin/promotions/{promo_id}")
        assert archived.status_code == 200
        assert (await client.get("/api/admin/promotions")).json() == []

    async def test_dates_validation(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await owner_client(client, db)
        now = container.clock.now()
        response = await client.post(
            "/api/admin/promotions",
            json={
                "title": "Кривые даты",
                "percent": 10,
                "starts_at": now.isoformat(),
                "ends_at": (now - timedelta(days=1)).isoformat(),
            },
        )
        assert response.status_code == 422
        assert "позже" in response.json()["detail"]


class TestPromoCodes:
    async def test_crud_uppercase_and_stats(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100], stock=5000)
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/promo-codes",
            json={"code": " chai15 ", "percent": 15, "max_uses_per_customer": 1},
        )
        assert created.status_code == 201, created.text
        assert created.json()["code"] == "CHAI15"
        duplicate = await client.post(
            "/api/admin/promo-codes", json={"code": "Chai15", "percent": 5}
        )
        assert duplicate.status_code == 409

        client.cookies.delete("nsb_admin")
        await client.put("/api/cart/promo-code", json={"code": "CHAI15"})
        await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        listing = (await client.get("/api/admin/promo-codes")).json()
        assert listing[0]["stats"] == {"uses": 1, "discount_kop": 15_000}

    async def test_bad_code_format(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        response = await client.post(
            "/api/admin/promo-codes", json={"code": "чай 10", "percent": 5}
        )
        assert response.status_code == 422


class TestThursdays:
    async def test_calendar_shows_eight_upcoming(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        body = (await client.get("/api/admin/thursdays")).json()
        assert len(body["upcoming"]) == 8
        assert body["upcoming"][0]["date"] == "2026-10-08"
        assert body["upcoming"][0]["planned"] is False
        assert body["default_percent"] == 20
        assert body["mode"] == "week"

    async def test_plan_and_clear(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Да Хун Пао")
        await owner_client(client, db)
        saved = await client.put(
            "/api/admin/thursdays/2026-10-08",
            json={"product_ids": [str(tea.id)], "percent": 25, "note": "Утёсные улуны"},
        )
        assert saved.status_code == 200, saved.text
        upcoming = (await client.get("/api/admin/thursdays")).json()["upcoming"][0]
        assert upcoming["planned"] is True
        assert upcoming["percent"] == 25
        assert [p["name"] for p in upcoming["products"]] == ["Да Хун Пао"]

        assert (await client.delete("/api/admin/thursdays/2026-10-08")).status_code == 200
        assert (await db.scalars(select(ThursdayPlan))).all() == []

    async def test_not_thursday_or_past(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db)
        await owner_client(client, db)
        friday = await client.put(
            "/api/admin/thursdays/2026-10-09", json={"product_ids": [str(tea.id)]}
        )
        assert friday.status_code == 422
        assert "не четверг" in friday.json()["detail"]
        past = await client.put(
            f"/api/admin/thursdays/{date(2026, 9, 24).isoformat()}",
            json={"product_ids": [str(tea.id)]},
        )
        assert past.status_code == 422
        assert "прошёл" in past.json()["detail"]

    async def test_welcome_stats(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100], stock=5000)
        await buy(client, container, [(tea.id, "preset", 100, 1)])
        await owner_client(client, db)
        stats = (await client.get("/api/admin/promotions/welcome-stats")).json()
        assert stats == {"uses": 1, "discount_kop": 10_000}


async def _staff(client: AsyncClient, db: AsyncSession, permissions: list[str]) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=permissions,
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")


class TestFollowUps:
    async def test_manual_points_are_owner_only(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """SPEC 7.1: «Владелец может вручную начислить или списать баллы»; у сотрудника нет
        финансов (SPEC 10.9) — карточку клиента он видит, баллы не меняет."""
        customer = Customer(email="anna@mail.ru", name="Анна")
        db.add(customer)
        await db.commit()
        await _staff(client, db, ["customers"])
        assert (await client.get(f"/api/admin/customers/{customer.id}")).status_code == 200
        response = await client.post(
            f"/api/admin/customers/{customer.id}/points",
            json={"delta": 300, "comment": "Подарок"},
        )
        assert response.status_code == 403
        assert (await db.scalars(select(PointsTransaction))).all() == []

    async def test_promotion_archive_and_restore(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Удаление — в архив с возможностью восстановить (SPEC 10.1)."""
        tea = await make_tea(db)
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/promotions",
            json={"title": "Осень", "percent": 10, "product_ids": [str(tea.id)]},
        )
        promo_id = created.json()["id"]
        await client.delete(f"/api/admin/promotions/{promo_id}")

        assert (await client.get("/api/admin/promotions")).json() == []
        archived = (await client.get("/api/admin/promotions?archived=true")).json()
        assert [p["title"] for p in archived] == ["Осень"]
        assert archived[0]["archived"] is True

        restored = await client.post(f"/api/admin/promotions/{promo_id}/restore")
        assert restored.status_code == 200, restored.text
        # возвращается выключенной: включить — осознанное действие
        assert restored.json()["is_active"] is False
        assert restored.json()["archived"] is False
        assert [p["title"] for p in (await client.get("/api/admin/promotions")).json()] == ["Осень"]
        actions = (await db.scalars(select(AuditLog.action))).all()
        assert "promotion.restore" in actions

    async def test_promo_code_archive_is_logged_and_restorable(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        created = await client.post(
            "/api/admin/promo-codes", json={"code": "chai10", "percent": 10}
        )
        code_id = created.json()["id"]
        await client.delete(f"/api/admin/promo-codes/{code_id}")
        actions = (await db.scalars(select(AuditLog.action))).all()
        assert "promo_code.archive" in actions  # CLAUDE.md, правило 12

        archived = (await client.get("/api/admin/promo-codes?archived=true")).json()
        assert [c["code"] for c in archived] == ["CHAI10"]

        # тот же код заново — подсказываем, что он в архиве
        again = await client.post("/api/admin/promo-codes", json={"code": "CHAI10", "percent": 5})
        assert again.status_code == 409
        assert "в архиве" in again.json()["detail"]

        restored = await client.post(f"/api/admin/promo-codes/{code_id}/restore")
        assert restored.status_code == 200, restored.text
        assert restored.json()["is_active"] is False
        assert [c["code"] for c in (await client.get("/api/admin/promo-codes")).json()] == [
            "CHAI10"
        ]
        assert "promo_code.restore" in (await db.scalars(select(AuditLog.action))).all()

    async def test_running_week_is_shown_in_calendar(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Понедельник 5 октября, режим «неделя»: чай недели с четверга 1 октября ещё идёт —
        он показывается отдельно, а 8 ближайших четвергов — как раньше."""
        tea = await make_tea(db, "Да Хун Пао")
        db.add(ThursdayPlan(date=date(2026, 10, 1), products=[tea], percent=None))
        await db.commit()
        await owner_client(client, db)

        body = (await client.get("/api/admin/thursdays")).json()
        assert body["current"]["date"] == "2026-10-01"
        assert body["current"]["running"] is True
        assert [p["name"] for p in body["current"]["products"]] == ["Да Хун Пао"]
        assert len(body["upcoming"]) == 8
        assert body["upcoming"][0]["date"] == "2026-10-08"
        assert body["upcoming"][0]["running"] is False

        day_mode = await client.put(
            "/api/admin/settings/thursday", json={"percent": 20, "mode": "day"}
        )
        assert day_mode.status_code == 200, day_mode.text
        assert (await client.get("/api/admin/thursdays")).json()["current"] is None
