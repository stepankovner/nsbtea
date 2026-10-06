"""Корзина (SPEC 4.1): граммовки, остатки, скидки, промокод, баллы."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import Customer, PointsTransaction, PromoCode, ThursdayPlan
from app.models.catalog import ProductStatus
from tests.factories import make_category, make_tea, make_unit
from tests.helpers import add_to_cart, customer_login


async def promo_code(db: AsyncSession, code: str = "CHAI10", **fields: object) -> PromoCode:
    promo = PromoCode(code=code, **({"percent": 10} | fields))
    db.add(promo)
    await db.commit()
    return promo


class TestItems:
    async def test_add_tea_with_grams(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=2_800, presets=[50, 100])
        cart = await add_to_cart(client, tea.id, grams=100)
        assert client.cookies.get("nsb_cart")
        line = cart["lines"][0]  # type: ignore[index]
        assert line["variant_label"] == "100 г"
        assert line["unit_price_kop"] == 280_000
        assert line["total_kop"] == 280_000
        assert cart["items_total_kop"] == 280_000
        assert cart["count"] == 1

    async def test_same_variant_merges(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[50])
        await add_to_cart(client, tea.id, grams=50)
        cart = await add_to_cart(client, tea.id, grams=50)
        assert len(cart["lines"]) == 1  # type: ignore[arg-type]
        assert cart["lines"][0]["qty"] == 2  # type: ignore[index]

    async def test_cake_and_custom(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(
            db,
            presets=[50],
            stock=1000,
            cake_weight_grams=357,
            cake_price_kop=300_000,
            custom_weight_enabled=True,
        )
        await add_to_cart(client, tea.id, kind="cake", grams=357)
        cart = await add_to_cart(client, tea.id, kind="custom", grams=70)
        labels = sorted(line["variant_label"] for line in cart["lines"])  # type: ignore[attr-defined]
        assert labels == ["70 г", "Весь блин, 357 г"]

    async def test_invalid_variant(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[50])
        response = await client.post(
            "/api/cart/items",
            json={"product_id": str(tea.id), "kind": "custom", "grams": 70, "qty": 1},
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "Свой вес для этого чая недоступен"

    async def test_sum_of_lines_cannot_exceed_stock(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db, "Шу", presets=[50, 100], stock=120)
        await add_to_cart(client, tea.id, grams=100)
        response = await client.post(
            "/api/cart/items",
            json={"product_id": str(tea.id), "kind": "preset", "grams": 50, "qty": 1},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "«Шу»: доступно не больше 120 г, в корзине 150 г"

    async def test_unit_quantity(self, client: AsyncClient, db: AsyncSession) -> None:
        cup = await make_unit(db, "Чаша", stock=2, unit_price_kop=90_000)
        cart = await add_to_cart(client, cup.id, kind="unit", grams=0, qty=2)
        assert cart["items_total_kop"] == 180_000
        response = await client.post(
            "/api/cart/items",
            json={"product_id": str(cup.id), "kind": "unit", "grams": 0, "qty": 1},
        )
        assert response.status_code == 409

    async def test_hidden_product_cannot_be_added(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db, status=ProductStatus.HIDDEN)
        response = await client.post(
            "/api/cart/items",
            json={"product_id": str(tea.id), "kind": "preset", "grams": 50, "qty": 1},
        )
        assert response.status_code == 404

    async def test_update_qty_and_remove(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[50], stock=500)
        cart = await add_to_cart(client, tea.id, grams=50)
        line_id = cart["lines"][0]["id"]  # type: ignore[index]
        updated = (await client.patch(f"/api/cart/items/{line_id}", json={"qty": 3})).json()
        assert updated["lines"][0]["qty"] == 3
        too_many = await client.patch(f"/api/cart/items/{line_id}", json={"qty": 20})
        assert too_many.status_code == 409
        emptied = (await client.delete(f"/api/cart/items/{line_id}")).json()
        assert emptied["lines"] == []

    async def test_change_weight_of_line(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, presets=[50, 100], stock=500)
        cart = await add_to_cart(client, tea.id, grams=50)
        line_id = cart["lines"][0]["id"]  # type: ignore[index]
        updated = (
            await client.patch(f"/api/cart/items/{line_id}", json={"kind": "preset", "grams": 100})
        ).json()
        assert updated["lines"][0]["variant_label"] == "100 г"

    async def test_stock_dropped_after_adding_shows_problem(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db, "Шу", presets=[100], stock=100)
        await add_to_cart(client, tea.id, grams=100)
        tea.stock = 40
        await db.commit()
        cart = (await client.get("/api/cart")).json()
        assert cart["problems"] == ["«Шу»: доступно не больше 40 г, в корзине 100 г"]
        assert cart["lines"][0]["problem"] is not None


class TestDiscounts:
    async def test_thursday_discount_in_cart(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=2_800, presets=[50])
        plan = ThursdayPlan(date=date(2026, 10, 1))
        plan.products = [tea]
        db.add(plan)
        await db.commit()
        cart = await add_to_cart(client, tea.id, grams=50)
        line = cart["lines"][0]  # type: ignore[index]
        assert line["product_discount_kop"] == 28_000
        assert line["promotion_label"] == "Чай недели −20%"
        assert cart["items_after_discounts_kop"] == 112_000

    async def test_promo_code(self, client: AsyncClient, db: AsyncSession) -> None:
        await promo_code(db, "CHAI10", percent=10)
        tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        response = await client.put("/api/cart/promo-code", json={"code": "chai10"})
        assert response.status_code == 200
        cart = response.json()
        assert cart["promo_code"] == {"code": "CHAI10", "applied": True, "message": None}
        assert cart["order_discount_kop"] == 20_000
        assert cart["order_discount_label"] == "Промокод CHAI10"

    async def test_unknown_promo_code(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        response = await client.put("/api/cart/promo-code", json={"code": "NOPE"})
        assert response.status_code == 422
        assert response.json()["detail"] == "Такого промокода нет — проверьте написание"

    async def test_expired_and_exhausted_promo(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await promo_code(db, "OLD", ends_at=container.clock.now() - timedelta(days=1))
        await promo_code(db, "SOON", starts_at=container.clock.now() + timedelta(days=1))
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        old = await client.put("/api/cart/promo-code", json={"code": "OLD"})
        assert old.json()["detail"] == "Срок действия промокода закончился"
        soon = await client.put("/api/cart/promo-code", json={"code": "SOON"})
        assert "ещё не начал действовать" in soon.json()["detail"]

    async def test_promo_explains_why_not_applied(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await promo_code(db, "BIG", percent=10, min_order_kop=500_000)
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        cart = (await client.put("/api/cart/promo-code", json={"code": "BIG"})).json()
        assert cart["promo_code"]["applied"] is False
        assert cart["promo_code"]["message"] == "Промокод действует при заказе от 5 000 ₽"
        await client.delete("/api/cart/promo-code")
        assert (await client.get("/api/cart")).json()["promo_code"] is None

    async def test_welcome_discount_tentative_for_guest(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100])
        cart = await add_to_cart(client, tea.id, grams=100)
        assert cart["order_discount_kop"] == 10_000
        assert cart["welcome"] == {"percent": 10, "applied": True, "tentative": True}

    async def test_category_promo_restrictions(self, client: AsyncClient, db: AsyncSession) -> None:
        puer = await make_category(db, "Пуэр")
        promo = await promo_code(db, "PUER")
        promo.categories = [puer]
        await db.commit()
        cup = await make_unit(db, "Чаша")
        await add_to_cart(client, cup.id, kind="unit", grams=0)
        cart = (await client.put("/api/cart/promo-code", json={"code": "PUER"})).json()
        assert cart["promo_code"]["message"] == "Промокод не действует на товары в корзине"


class TestPoints:
    async def test_guest_cannot_use_points(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db)
        await add_to_cart(client, tea.id)
        response = await client.put("/api/cart/points", json={"points": 100})
        assert response.status_code == 401

    async def test_spend_points_limited_to_half(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await customer_login(client, db, "anna@mail.ru")
        customer = await db.scalar(select(Customer).where(Customer.email == "anna@mail.ru"))
        assert customer is not None
        customer.points_balance = 5_000
        customer.first_paid_order_at = customer.created_at  # не первый заказ — без приветственной
        db.add(
            PointsTransaction(
                customer_id=customer.id, delta=5_000, kind="manual", balance_after=5_000
            )
        )
        await db.commit()
        tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100])
        await add_to_cart(client, tea.id, grams=100)
        cart = (await client.put("/api/cart/points", json={"max": True})).json()
        assert cart["points"]["max_spend"] == 1_000
        assert cart["points"]["applied"] == 1_000
        assert cart["total_without_delivery_kop"] == 100_000
        # 5% от 1 000 ₽, оплаченных деньгами
        assert cart["points_to_earn"] == 50
        cart = (await client.put("/api/cart/points", json={"points": 300})).json()
        assert cart["points"]["applied"] == 300
