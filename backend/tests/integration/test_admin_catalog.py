"""Каталог в админке: категории, пошаговое создание товара, копия, публикация (SPEC 3, 10.3)."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, Product, SlugRedirect
from app.models.admin import AdminRole
from tests.factories import jpeg_bytes, make_category, make_tea, make_unit
from tests.helpers import create_admin, login, owner_client


class TestCategories:
    async def test_create_with_auto_slug(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        response = await client.post(
            "/api/admin/categories", json={"name": "Шу пуэр", "tile_color": "puer"}
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["slug"] == "shu-puer"
        assert body["is_visible"] is True

    async def test_duplicate_slug(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        await client.post("/api/admin/categories", json={"name": "Улун"})
        response = await client.post("/api/admin/categories", json={"name": "Улун"})
        assert response.status_code == 409
        assert response.json()["detail"] == "Адрес «ulun» уже занят — придумайте другой"
        assert response.json()["field"] == "slug"

    async def test_two_levels_max(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        root = (await client.post("/api/admin/categories", json={"name": "Пуэр"})).json()
        child = (
            await client.post(
                "/api/admin/categories", json={"name": "Шу пуэр", "parent_id": root["id"]}
            )
        ).json()
        response = await client.post(
            "/api/admin/categories", json={"name": "Глубже", "parent_id": child["id"]}
        )
        assert response.status_code == 422
        assert "только внутри основной категории" in response.json()["detail"]

    async def test_tree_with_counts(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        puer = await make_category(db, "Пуэр", sort_order=1)
        shu = await make_category(db, "Шу пуэр", parent=puer)
        await make_tea(db, "Гунтин", category=shu)
        await make_category(db, "Улун", sort_order=0)
        tree = (await client.get("/api/admin/categories")).json()
        assert [c["name"] for c in tree] == ["Улун", "Пуэр"]
        assert tree[1]["children"][0]["name"] == "Шу пуэр"
        assert tree[1]["children"][0]["products_count"] == 1

    async def test_rename_slug_creates_redirect(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        created = (await client.post("/api/admin/categories", json={"name": "Шен пуэр"})).json()
        response = await client.patch(
            f"/api/admin/categories/{created['id']}", json={"slug": "shen-puer-new"}
        )
        assert response.status_code == 200
        redirect = (await db.scalars(select(SlugRedirect))).one()
        assert redirect.old_slug == "shen-puer"
        assert redirect.entity == "category"

    async def test_reorder(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        a = await make_category(db, "А")
        b = await make_category(db, "Б")
        response = await client.post(
            "/api/admin/categories/reorder", json={"ids": [str(b.id), str(a.id)]}
        )
        assert response.status_code == 200
        tree = (await client.get("/api/admin/categories")).json()
        assert [c["name"] for c in tree] == ["Б", "А"]

    async def test_archive_with_products_is_blocked(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        category = await make_category(db, "Улун")
        await make_tea(db, "Те Гуань Инь", category=category)
        response = await client.delete(f"/api/admin/categories/{category.id}")
        assert response.status_code == 409
        assert "товары (1)" in response.json()["detail"]

    async def test_archive_and_restore(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        category = await make_category(db, "Пустая")
        assert (await client.delete(f"/api/admin/categories/{category.id}")).status_code == 200
        assert (await client.get("/api/admin/categories")).json() == []
        archived = (await client.get("/api/admin/categories?archived=true")).json()
        assert archived[0]["name"] == "Пустая"
        restored = await client.post(f"/api/admin/categories/{category.id}/restore")
        assert restored.status_code == 200
        assert len((await client.get("/api/admin/categories")).json()) == 1


class TestProductWizard:
    async def test_create_tea_draft_with_default_presets(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        category = await make_category(db, "Улун")
        response = await client.post(
            "/api/admin/products",
            json={"type": "tea", "name": "Да Хун Пао", "category_id": str(category.id)},
        )
        assert response.status_code == 201, response.text
        product = response.json()
        assert product["status"] == "draft"
        assert product["slug"] == "da-hun-pao"
        assert product["weight_presets"] == [25, 50, 100, 200]
        assert product["stock"] == 0
        assert product["custom_weight_min"] == 10
        assert product["custom_weight_step"] == 5

    async def test_set_price_per_50g(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        product = (
            await client.post("/api/admin/products", json={"type": "tea", "name": "Шу пуэр"})
        ).json()
        response = await client.patch(
            f"/api/admin/products/{product['id']}",
            json={"price": {"amount_kop": 65_000, "per_grams": 50}, "weight_presets": [25, 50]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["price_per_gram_kop"] == 1_300
        assert body["price_input_base"] == 50
        # предпросмотр вариантов: как увидит покупатель
        assert [(o["label"], o["price_kop"]) for o in body["weight_options"]] == [
            ("25 г", 32_500),
            ("50 г", 65_000),
        ]

    async def test_preset_must_be_in_global_list(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        product = (
            await client.post("/api/admin/products", json={"type": "tea", "name": "Шу пуэр"})
        ).json()
        response = await client.patch(
            f"/api/admin/products/{product['id']}", json={"weight_presets": [30]}
        )
        assert response.status_code == 422
        assert "30 г" in response.json()["detail"]

    async def test_characteristics_brewing_and_tags(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        product = (
            await client.post("/api/admin/products", json={"type": "tea", "name": "Да Хун Пао"})
        ).json()
        response = await client.patch(
            f"/api/admin/products/{product['id']}",
            json={
                "hanzi": "大红袍",
                "pinyin": "dà hóng páo",
                "attributes": {
                    "region": "Уишань, Фуцзянь",
                    "harvest_year": 2025,
                    "shape": "loose",
                    "effect": "balanced",
                    "fermentation": "сильная",
                },
                "flavor_tags": ["Жареный орех", "сухофрукты", "Жареный орех"],
                "search_aliases": ["дхп", "big red robe"],
                "brewing": {
                    "methods": [
                        {
                            "method": "gongfu",
                            "vessel": "Гайвань",
                            "grams": 6,
                            "volume_ml": 100,
                            "temp_c": 95,
                            "first_steep_sec": 10,
                            "next_steep_sec": 5,
                            "steeps": 7,
                        }
                    ],
                    "master_note": "Не передерживайте первые проливы.",
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert sorted(t["name"] for t in body["flavor_tags"]) == ["Жареный орех", "сухофрукты"]
        assert body["attributes"]["region"] == "Уишань, Фуцзянь"
        assert body["brewing"]["methods"][0]["temp_c"] == 95

        stored = await db.get(Product, product["id"])
        assert stored is not None
        await db.refresh(stored)
        assert "дхп" in stored.search_text
        assert "жареный орех" in stored.search_text

    async def test_brewing_validation(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        product = (
            await client.post("/api/admin/products", json={"type": "tea", "name": "Шу"})
        ).json()
        response = await client.patch(
            f"/api/admin/products/{product['id']}",
            json={"brewing": {"methods": [{"method": "gongfu", "temp_c": 150}]}},
        )
        assert response.status_code == 422
        assert any(e["field"].endswith("temp_c") for e in response.json()["errors"])

    async def test_publish_requires_price(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        product = (
            await client.post("/api/admin/products", json={"type": "tea", "name": "Шу"})
        ).json()
        response = await client.post(f"/api/admin/products/{product['id']}/publish")
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail.startswith("Чтобы показать товар на сайте, заполните:")
        assert "цену" in detail
        assert "категорию" in detail

    async def test_publish_and_hide(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        category = await make_category(db)
        product = (
            await client.post(
                "/api/admin/products",
                json={"type": "tea", "name": "Шу", "category_id": str(category.id)},
            )
        ).json()
        await client.patch(
            f"/api/admin/products/{product['id']}",
            json={"price": {"amount_kop": 1_200, "per_grams": 1}},
        )
        published = await client.post(f"/api/admin/products/{product['id']}/publish")
        assert published.status_code == 200, published.text
        body = published.json()
        assert body["status"] == "published"
        assert body["is_new_until"] is not None  # плашка «Новинка» на N дней

        hidden = await client.post(f"/api/admin/products/{product['id']}/hide")
        assert hidden.json()["status"] == "hidden"

        actions = [e.action for e in (await db.scalars(select(AuditLog))).all()]
        assert "product.publish" in actions
        assert "product.hide" in actions

    async def test_unit_product(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        category = await make_category(db, "Посуда", tile_color="neutral")
        product = (
            await client.post(
                "/api/admin/products",
                json={"type": "unit", "name": "Гайвань", "category_id": str(category.id)},
            )
        ).json()
        response = await client.patch(
            f"/api/admin/products/{product['id']}",
            json={"unit_price_kop": 150_000, "weight_grams": 350},
        )
        assert response.status_code == 200
        assert (await client.post(f"/api/admin/products/{product['id']}/publish")).status_code == 200

    async def test_price_change_is_audited_with_diff(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, price_per_gram_kop=1_000)
        await client.patch(
            f"/api/admin/products/{tea.id}", json={"price": {"amount_kop": 1_200, "per_grams": 1}}
        )
        entry = (
            await db.scalars(select(AuditLog).where(AuditLog.action == "product.update"))
        ).one()
        assert entry.diff["price_per_gram_kop"] == [1_000, 1_200]
        assert "Да Хун Пао" in entry.summary


class TestCopyArchive:
    async def test_copy_keeps_fields_except_photos_and_stock(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао", stock=300, hanzi="大红袍")
        await client.post(
            f"/api/admin/products/{tea.id}/images",
            files=[("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))],
        )
        response = await client.post(f"/api/admin/products/{tea.id}/copy")
        assert response.status_code == 201, response.text
        copy = response.json()
        assert copy["name"] == "Да Хун Пао (копия)"
        assert copy["status"] == "draft"
        assert copy["stock"] == 0
        assert copy["images"] == []
        assert copy["hanzi"] == "大红袍"
        assert copy["price_per_gram_kop"] == tea.price_per_gram_kop
        assert copy["slug"] != tea.slug

    async def test_archive_restore(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        assert (await client.delete(f"/api/admin/products/{tea.id}")).status_code == 200
        listing = (await client.get("/api/admin/products")).json()
        assert listing["total"] == 0
        archived = (await client.get("/api/admin/products?archived=true")).json()
        assert archived["total"] == 1
        restored = (await client.post(f"/api/admin/products/{tea.id}/restore")).json()
        assert restored["status"] == "hidden"
        assert restored["archived_at"] is None


class TestProductList:
    async def test_filters_and_search(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        oolong = await make_category(db, "Улун")
        await make_tea(db, "Да Хун Пао", category=oolong, stock=500)
        await make_tea(db, "Те Гуань Инь", category=oolong, stock=20)
        await make_unit(db, "Гайвань", stock=0)

        everything = (await client.get("/api/admin/products")).json()
        assert everything["total"] == 3

        low = (await client.get("/api/admin/products?stock=low")).json()
        assert [p["name"] for p in low["items"]] == ["Те Гуань Инь"]
        assert low["items"][0]["stock_label"] == "20 г"
        assert low["items"][0]["stock_level"] == "low"

        out = (await client.get("/api/admin/products?stock=out")).json()
        assert [p["name"] for p in out["items"]] == ["Гайвань"]

        found = (await client.get("/api/admin/products?q=гуань")).json()
        assert [p["name"] for p in found["items"]] == ["Те Гуань Инь"]

        by_category = (await client.get(f"/api/admin/products?category_id={oolong.id}")).json()
        assert by_category["total"] == 2

    async def test_list_item_shape(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        await make_tea(db, "Шу", price_per_gram_kop=1_300, presets=[25, 50])
        item = (await client.get("/api/admin/products")).json()["items"][0]
        assert item["price_label"] == "13 ₽/г · 25 г — 325 ₽"
        assert item["status_label"] == "На сайте"


class TestImages:
    async def test_upload_reorder_delete(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        response = await client.post(
            f"/api/admin/products/{tea.id}/images",
            files=[
                ("files", ("one.jpg", jpeg_bytes(color="#111111"), "image/jpeg")),
                ("files", ("two.jpg", jpeg_bytes(color="#222222"), "image/jpeg")),
            ],
        )
        assert response.status_code == 200, response.text
        images = response.json()["images"]
        assert len(images) == 2
        assert images[0]["url"].endswith(".webp")
        assert set(images[0]["srcset"]) >= {"320", "640"}

        reordered = await client.post(
            f"/api/admin/products/{tea.id}/images/order",
            json={"ids": [images[1]["id"], images[0]["id"]]},
        )
        assert [i["id"] for i in reordered.json()["images"]] == [images[1]["id"], images[0]["id"]]

        alt = await client.patch(
            f"/api/admin/products/{tea.id}/images/{images[0]['id']}", json={"alt": "Сухой лист"}
        )
        assert alt.status_code == 200

        deleted = await client.delete(f"/api/admin/products/{tea.id}/images/{images[1]['id']}")
        assert [i["id"] for i in deleted.json()["images"]] == [images[0]["id"]]

    async def test_not_an_image(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        response = await client.post(
            f"/api/admin/products/{tea.id}/images",
            files=[("files", ("evil.jpg", b"<?php echo 1; ?>", "image/jpeg"))],
        )
        assert response.status_code == 422
        assert "не похож на фото" in response.json()["detail"]

    async def test_limit_ten(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        small = jpeg_bytes(200, 200)
        files = [("files", (f"{i}.jpg", small, "image/jpeg")) for i in range(11)]
        response = await client.post(f"/api/admin/products/{tea.id}/images", files=files)
        assert response.status_code == 422
        assert "не больше 10" in response.json()["detail"]


class TestRelations:
    async def test_pin_similar_and_goes_with(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db, "Да Хун Пао")
        other = await make_tea(db, "Шуй Сянь")
        cup = await make_unit(db, "Чаша")
        response = await client.put(
            f"/api/admin/products/{tea.id}/relations/similar_pinned",
            json={"product_ids": [str(other.id)]},
        )
        assert response.status_code == 200
        response = await client.put(
            f"/api/admin/products/{tea.id}/relations/goes_with",
            json={"product_ids": [str(cup.id)]},
        )
        body = response.json()
        assert [p["name"] for p in body["relations"]["similar_pinned"]] == ["Шуй Сянь"]
        assert [p["name"] for p in body["relations"]["goes_with"]] == ["Чаша"]

    async def test_cannot_relate_to_itself(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        response = await client.put(
            f"/api/admin/products/{tea.id}/relations/similar_pinned",
            json={"product_ids": [str(tea.id)]},
        )
        assert response.status_code == 422

    async def test_similar_max_four(self, client: AsyncClient, db: AsyncSession) -> None:
        await owner_client(client, db)
        tea = await make_tea(db)
        others = [await make_tea(db, f"Чай {i}") for i in range(5)]
        response = await client.put(
            f"/api/admin/products/{tea.id}/relations/similar_pinned",
            json={"product_ids": [str(o.id) for o in others]},
        )
        assert response.status_code == 422
        assert "не больше 4" in response.json()["detail"]


async def test_staff_without_products_permission(client: AsyncClient, db: AsyncSession) -> None:
    await create_admin(
        db,
        email="helper@nsbtea.test",
        password="пароль-помощника",
        role=AdminRole.STAFF,
        permissions=["orders"],
    )
    await login(client, "helper@nsbtea.test", "пароль-помощника")
    response = await client.get("/api/admin/products")
    assert response.status_code == 403
    assert response.json()["detail"] == "Нет доступа к разделу «Товары»"
