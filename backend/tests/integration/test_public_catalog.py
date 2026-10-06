"""Витрина: каталог, фильтры, поиск, карточка товара, цены со скидками (SPEC 3.4, 3.5, 7.2)."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.models import (
    Product,
    ProductRelation,
    Promotion,
    Setting,
    SlugRedirect,
    Tag,
    ThursdayPlan,
)
from app.models.catalog import ProductStatus
from app.services.catalog_admin import build_search_text
from tests.factories import make_category, make_tea, make_unit

# DEFAULT_NOW в conftest — понедельник 5 октября 2026, 12:00 МСК.
THURSDAY = date(2026, 10, 8)


async def plan_thursday(
    db: AsyncSession,
    products: list[Product],
    day: date = date(2026, 10, 1),
    percent: int | None = None,
) -> ThursdayPlan:
    plan = ThursdayPlan(date=day, percent=percent)
    plan.products = products
    db.add(plan)
    await db.commit()
    return plan


class TestListing:
    async def test_only_published_visible(self, client: AsyncClient, db: AsyncSession) -> None:
        cat = await make_category(db, "Улун")
        await make_tea(db, "На сайте", category=cat)
        await make_tea(db, "Черновик", category=cat, status=ProductStatus.DRAFT)
        await make_tea(db, "Скрыт", category=cat, status=ProductStatus.HIDDEN)
        archived = await make_tea(db, "В архиве", category=cat)
        archived.archived_at = archived.created_at
        await db.commit()
        body = (await client.get("/api/catalog/products")).json()
        assert [p["name"] for p in body["items"]] == ["На сайте"]

    async def test_show_dates_for_holiday_sets(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        now = container.clock.now()
        await make_unit(db, "Новогодний набор", show_from=now + timedelta(days=10))
        await make_unit(db, "Осенний набор", show_until=now + timedelta(days=10))
        names = [p["name"] for p in (await client.get("/api/catalog/products")).json()["items"]]
        assert names == ["Осенний набор"]

    async def test_out_of_stock_goes_last(self, client: AsyncClient, db: AsyncSession) -> None:
        await make_tea(db, "А закончился", stock=0)
        await make_tea(db, "Б в наличии", stock=100)
        items = (await client.get("/api/catalog/products?sort=name")).json()["items"]
        assert [p["name"] for p in items] == ["Б в наличии", "А закончился"]
        assert items[1]["in_stock"] is False
        assert {"kind": "out", "label": "Нет в наличии"} in items[1]["badges"]

    async def test_category_includes_children(self, client: AsyncClient, db: AsyncSession) -> None:
        puer = await make_category(db, "Пуэр", tile_color="puer")
        shu = await make_category(db, "Шу пуэр", parent=puer, tile_color="puer")
        await make_tea(db, "Гунтин", category=shu)
        await make_tea(db, "Улун", category=await make_category(db, "Улун"))
        body = (await client.get(f"/api/catalog/products?category={puer.slug}")).json()
        assert [p["name"] for p in body["items"]] == ["Гунтин"]
        assert body["items"][0]["tile_color"] == "puer"

    async def test_card_shape(self, client: AsyncClient, db: AsyncSession) -> None:
        cat = await make_category(db, "Улун")
        await make_tea(
            db,
            "Да Хун Пао",
            category=cat,
            price_per_gram_kop=2_800,
            presets=[50, 100],
            hanzi="大红袍",
            pinyin="dà hóng páo",
            attributes={"region": "Уишань, Фуцзянь", "harvest_year": 2025},
        )
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["price_kop"] == 140_000
        assert card["price_grams"] == 50
        assert card["old_price_kop"] is None
        assert card["price_per_gram_kop"] == 2_800
        assert card["hanzi"] == "大红袍"
        assert card["meta"] == "Улун · Уишань · 2025"
        assert card["default_variant"] == {"kind": "preset", "grams": 50}

    async def test_new_and_low_badges(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await make_tea(
            db, "Новинка", stock=40, is_new_until=container.clock.now() + timedelta(days=3)
        )
        badges = (await client.get("/api/catalog/products")).json()["items"][0]["badges"]
        kinds = [b["kind"] for b in badges]
        assert "new" in kinds
        assert "low" in kinds
        assert {"kind": "low", "label": "Осталось мало"} in badges


class TestFilters:
    async def test_filters(self, client: AsyncClient, db: AsyncSession) -> None:
        nut = Tag(name="Орех", slug="oreh")
        honey = Tag(name="Мёд", slug="med")
        db.add_all([nut, honey])
        await db.commit()
        a = await make_tea(
            db,
            "Бодрый",
            price_per_gram_kop=1_000,
            attributes={"effect": "energizing", "region": "Юньнань", "shape": "cake"},
        )
        a.tags = [nut]
        b = await make_tea(
            db,
            "Спокойный",
            price_per_gram_kop=3_000,
            stock=0,
            attributes={"effect": "calming", "region": "Фуцзянь", "shape": "loose"},
        )
        b.tags = [honey, nut]
        await db.commit()

        async def names(query: str) -> list[str]:
            response = await client.get(f"/api/catalog/products?{query}&sort=name")
            assert response.status_code == 200, response.text
            return [p["name"] for p in response.json()["items"]]

        assert await names("in_stock=true") == ["Бодрый"]
        assert await names("tags=med") == ["Спокойный"]
        assert await names("tags=oreh") == ["Бодрый", "Спокойный"]
        assert await names("effect=calming") == ["Спокойный"]
        assert await names("region=Юньнань") == ["Бодрый"]
        assert await names("shape=cake") == ["Бодрый"]
        # цена за 100 г: 1 000 ₽ и 3 000 ₽
        assert await names("price_min=2000") == ["Спокойный"]
        assert await names("price_max=1500") == ["Бодрый"]

        facets = (await client.get("/api/catalog/products")).json()["facets"]
        assert {t["slug"]: t["count"] for t in facets["tags"]} == {"oreh": 2, "med": 1}
        assert sorted(r["value"] for r in facets["regions"]) == ["Фуцзянь", "Юньнань"]
        assert {e["value"]: e["label"] for e in facets["effects"]}["calming"] == "Успокаивает"
        assert facets["price_per_100g"] == {"min_kop": 100_000, "max_kop": 300_000}

    async def test_sorting_by_price(self, client: AsyncClient, db: AsyncSession) -> None:
        await make_tea(db, "Дорогой", price_per_gram_kop=5_000)
        await make_tea(db, "Дешёвый", price_per_gram_kop=500)
        asc = (await client.get("/api/catalog/products?sort=price_asc")).json()["items"]
        assert [p["name"] for p in asc] == ["Дешёвый", "Дорогой"]
        desc = (await client.get("/api/catalog/products?sort=price_desc")).json()["items"]
        assert [p["name"] for p in desc] == ["Дорогой", "Дешёвый"]

    async def test_pagination(self, client: AsyncClient, db: AsyncSession) -> None:
        for i in range(5):
            await make_tea(db, f"Чай {i}")
        body = (await client.get("/api/catalog/products?per_page=2&page=3")).json()
        assert body["total"] == 5
        assert len(body["items"]) == 1


class TestSearch:
    async def test_aliases_and_typos(self, client: AsyncClient, db: AsyncSession) -> None:
        shu = await make_tea(db, "Шу пуэр «Гунтин»", search_aliases=["шу", "шупуэр"])
        await db.refresh(shu, ["tags", "category"])
        shu.search_text = build_search_text(shu)
        await make_tea(db, "Те Гуань Инь")
        await db.commit()

        async def search(q: str) -> list[str]:
            items = (await client.get(f"/api/catalog/products?q={q}")).json()["items"]
            return [p["name"] for p in items]

        assert await search("шупуэр") == ["Шу пуэр «Гунтин»"]
        assert await search("гунтин") == ["Шу пуэр «Гунтин»"]
        assert await search("пуер") == ["Шу пуэр «Гунтин»"]  # опечатка: е вместо э
        assert await search("гуань") == ["Те Гуань Инь"]

    async def test_suggest(self, client: AsyncClient, db: AsyncSession) -> None:
        await make_tea(db, "Да Хун Пао")
        response = await client.get("/api/catalog/suggest?q=хун")
        assert response.status_code == 200
        assert response.json()[0]["name"] == "Да Хун Пао"


class TestDiscountedPrices:
    async def test_thursday_week_mode(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Да Хун Пао", price_per_gram_kop=2_800, presets=[50])
        # четверг 1 октября запланирован; сейчас понедельник 5 октября → режим «неделя» ещё действует
        await plan_thursday(db, [tea])
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["price_kop"] == 112_000
        assert card["old_price_kop"] == 140_000
        thursday_badge = next(b for b in card["badges"] if b["kind"] == "thursday")
        assert thursday_badge["label"] == "−20% до 8 октября"

    async def test_thursday_day_mode_inactive_on_monday(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        db.add(Setting(key="thursday", value={"percent": 20, "mode": "day"}))
        tea = await make_tea(db, "Да Хун Пао", presets=[50])
        await plan_thursday(db, [tea])
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["old_price_kop"] is None

    async def test_upcoming_thursday_note_on_product_page(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        tea = await make_tea(db, "Да Хун Пао")
        await plan_thursday(db, [tea], day=THURSDAY, percent=25)
        page = (await client.get(f"/api/catalog/products/{tea.slug}")).json()
        assert page["upcoming_thursday"] == "−25% на этот чай в четверг, 8 октября"

    async def test_sale_by_category_and_best_wins(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        cat = await make_category(db, "Улун")
        tea = await make_tea(
            db, "Те Гуань Инь", category=cat, price_per_gram_kop=1_800, presets=[50]
        )
        sale = Promotion(
            title="Осень",
            percent=10,
            starts_at=container.clock.now() - timedelta(days=1),
            ends_at=container.clock.now() + timedelta(days=1),
        )
        sale.categories = [cat]
        db.add(sale)
        await db.commit()
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["price_kop"] == 81_000
        assert {"kind": "sale", "label": "−10%"} in card["badges"]

        await plan_thursday(db, [tea])
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["price_kop"] == 72_000  # −20% выгоднее −10%

    async def test_expired_sale_is_ignored(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        tea = await make_tea(db, "Те Гуань Инь", presets=[50])
        sale = Promotion(
            title="Прошла", percent=10, ends_at=container.clock.now() - timedelta(hours=1)
        )
        sale.products = [tea]
        db.add(sale)
        await db.commit()
        card = (await client.get("/api/catalog/products")).json()["items"][0]
        assert card["old_price_kop"] is None


class TestProductPage:
    async def test_full_page(self, client: AsyncClient, db: AsyncSession) -> None:
        cat = await make_category(db, "Улун")
        tea = await make_tea(
            db,
            "Да Хун Пао",
            category=cat,
            stock=120,
            presets=[25, 50, 100, 200],
            cake_weight_grams=357,
            custom_weight_enabled=True,
            attributes={"region": "Уишань", "shape": "loose", "effect": "energizing"},
            brewing={
                "methods": [
                    {"method": "gongfu", "temp_c": 95, "grams": 6, "volume_ml": 100, "steeps": 7}
                ],
                "master_note": "Не торопитесь.",
            },
        )
        response = await client.get(f"/api/catalog/products/{tea.slug}")
        assert response.status_code == 200
        page = response.json()
        options = {o["label"]: o for o in page["weight_options"]}
        assert options["100 г"]["available"] is True
        assert options["200 г"]["available"] is False
        assert options["Весь блин, 357 г"]["available"] is False
        assert page["custom_weight"] == {"enabled": True, "min": 10, "step": 5, "max": 120}
        assert page["brewing"]["methods"][0]["method_label"] == "Пролив (гунфу)"
        assert page["brewing_summary"] == {
            "temp": "95°",
            "grams": "6 г",
            "steeps": "7",
            "steeps_label": "проливов",
        }
        labels = {a["label"]: a["value"] for a in page["attributes"]}
        assert labels == {"Регион": "Уишань", "Форма": "Рассыпной", "Эффект": "Бодрит"}
        assert page["breadcrumbs"][-1] == {"name": "Улун", "href": f"/catalog/{cat.slug}"}
        assert page["seo"]["canonical"].endswith(f"/product/{tea.slug}")

    async def test_draft_is_404(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, status=ProductStatus.DRAFT)
        assert (await client.get(f"/api/catalog/products/{tea.slug}")).status_code == 404

    async def test_old_slug_moved(self, client: AsyncClient, db: AsyncSession) -> None:
        tea = await make_tea(db, "Да Хун Пао")
        db.add(SlugRedirect(entity="product", old_slug="old-dhp", entity_id=tea.id))
        await db.commit()
        response = await client.get("/api/catalog/products/old-dhp")
        assert response.status_code == 404
        assert response.json()["code"] == "moved"
        assert response.json()["location"] == f"/product/{tea.slug}"

    async def test_similar_auto_and_pinned(self, client: AsyncClient, db: AsyncSession) -> None:
        cat = await make_category(db, "Улун")
        nut, honey, fruit = (
            Tag(name="Орех", slug="oreh"),
            Tag(name="Мёд", slug="med"),
            Tag(name="Фрукты", slug="frukty"),
        )
        db.add_all([nut, honey, fruit])
        await db.commit()
        main = await make_tea(db, "Главный", category=cat)
        main.tags = [nut, honey]
        two_common = await make_tea(db, "Два общих", category=cat)
        two_common.tags = [nut, honey]
        one_common = await make_tea(db, "Один общий", category=cat)
        one_common.tags = [nut]
        no_stock = await make_tea(db, "Нет в наличии", category=cat, stock=0)
        no_stock.tags = [nut, honey]
        other_cat = await make_tea(db, "Другая категория")
        other_cat.tags = [nut, honey, fruit]
        await db.commit()
        page = (await client.get(f"/api/catalog/products/{main.slug}")).json()
        assert [p["name"] for p in page["similar"]] == ["Два общих", "Один общий"]

        db.add(ProductRelation(product_id=main.id, related_id=other_cat.id, kind="similar_pinned"))
        cup = await make_unit(db, "Чаша")
        db.add(ProductRelation(product_id=main.id, related_id=cup.id, kind="goes_with"))
        await db.commit()
        page = (await client.get(f"/api/catalog/products/{main.slug}")).json()
        assert [p["name"] for p in page["similar"]][0] == "Другая категория"
        assert [p["name"] for p in page["goes_with"]] == ["Чаша"]

    async def test_unit_page(self, client: AsyncClient, db: AsyncSession) -> None:
        cup = await make_unit(db, "Чаша", stock=3, unit_price_kop=90_000)
        page = (await client.get(f"/api/catalog/products/{cup.slug}")).json()
        assert page["type"] == "unit"
        assert page["price_kop"] == 90_000
        assert page["max_qty"] == 3
        assert page["weight_options"] == []


class TestCategoriesTree:
    async def test_public_tree_hides_invisible(self, client: AsyncClient, db: AsyncSession) -> None:
        puer = await make_category(db, "Пуэр", sort_order=1)
        await make_category(db, "Шу пуэр", parent=puer)
        await make_category(db, "Скрытая", is_visible=False)
        await make_tea(db, "Чай", category=puer)
        tree = (await client.get("/api/catalog/categories")).json()
        assert [c["name"] for c in tree] == ["Пуэр"]
        assert tree[0]["children"][0]["name"] == "Шу пуэр"
        assert tree[0]["products_count"] == 1
