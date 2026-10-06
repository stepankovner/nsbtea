"""Каталог в админке: категории, товары, фото, связи (SPEC 3, 10.3)."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import ConflictError, DomainError, NotFoundError
from app.domain.inventory import StockLevel, format_qty, stock_level
from app.domain.money import format_rub
from app.domain.pricing import (
    ProductType,
    TeaPricing,
    listing_price,
    price_per_gram_from_input,
    weight_options,
)
from app.domain.slugs import slugify
from app.models import (
    AdminUser,
    Category,
    Product,
    ProductImage,
    ProductRelation,
    SlugRedirect,
    Tag,
)
from app.models.catalog import PRODUCT_STATUS_LABELS, ProductStatus, RelationKind
from app.schemas.catalog import ProductPatchIn
from app.services import audit
from app.services.inventory import threshold_for
from app.services.media import upload_image
from app.services.settings import get_group
from app.services.settings_schema import CatalogSettings

MAX_IMAGES = 10
MAX_RELATIONS = {
    RelationKind.SIMILAR_PINNED: 4,
    RelationKind.GOES_WITH: 8,
    RelationKind.SET_CONTAINS: 20,
}


# ---------------------------------------------------------------- slugs


async def _slug_taken(
    db: AsyncSession, model: type[Category] | type[Product], slug: str, exclude: uuid.UUID | None
) -> bool:
    query = select(model.id).where(model.slug == slug)
    if exclude is not None:
        query = query.where(model.id != exclude)
    return (await db.scalar(query)) is not None


async def unique_slug(
    db: AsyncSession,
    model: type[Category] | type[Product],
    base: str,
    exclude: uuid.UUID | None = None,
) -> str:
    candidate = base
    n = 2
    while await _slug_taken(db, model, candidate, exclude):
        candidate = f"{base}-{n}"
        n += 1
    return candidate


async def _ensure_slug_free(
    db: AsyncSession, model: type[Category] | type[Product], slug: str, exclude: uuid.UUID | None
) -> None:
    if await _slug_taken(db, model, slug, exclude):
        raise ConflictError(f"Адрес «{slug}» уже занят — придумайте другой", field="slug")


async def _remember_old_slug(
    db: AsyncSession, entity: str, old_slug: str, entity_id: uuid.UUID
) -> None:
    existing = await db.scalar(
        select(SlugRedirect).where(SlugRedirect.entity == entity, SlugRedirect.old_slug == old_slug)
    )
    if existing:
        existing.entity_id = entity_id
    else:
        db.add(SlugRedirect(entity=entity, old_slug=old_slug, entity_id=entity_id))


# ---------------------------------------------------------------- categories


@dataclass(slots=True)
class CategoryNode:
    category: Category
    products_count: int
    children: list["CategoryNode"]


async def category_tree(db: AsyncSession, *, archived: bool = False) -> list[CategoryNode]:
    counts = dict(
        (
            await db.execute(
                select(Product.category_id, func.count())
                .where(Product.archived_at.is_(None))
                .group_by(Product.category_id)
            )
        ).all()
    )
    query = select(Category).order_by(Category.sort_order, Category.name)
    query = query.where(
        Category.archived_at.is_not(None) if archived else Category.archived_at.is_(None)
    )
    categories = (await db.scalars(query)).all()
    nodes = {c.id: CategoryNode(c, int(counts.get(c.id, 0)), []) for c in categories}
    roots: list[CategoryNode] = []
    for node in nodes.values():
        parent = nodes.get(node.category.parent_id) if node.category.parent_id else None
        if parent is not None:
            parent.children.append(node)
        else:
            roots.append(node)
    return roots


async def _get_category(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Категория не найдена")
    return category


async def _validate_parent(
    db: AsyncSession, parent_id: uuid.UUID | None, self_id: uuid.UUID | None
) -> None:
    if parent_id is None:
        return
    if parent_id == self_id:
        raise DomainError("Категория не может быть внутри самой себя", field="parent_id")
    parent = await _get_category(db, parent_id)
    if parent.parent_id is not None:
        raise DomainError(
            "Подкатегорию можно создать только внутри основной категории", field="parent_id"
        )
    if self_id is not None:
        has_children = await db.scalar(
            select(func.count()).select_from(Category).where(Category.parent_id == self_id)
        )
        if has_children:
            raise DomainError(
                "У этой категории есть подкатегории — её нельзя вложить в другую",
                field="parent_id",
            )


def _category_snapshot(category: Category) -> dict[str, Any]:
    return {
        "name": category.name,
        "slug": category.slug,
        "parent_id": category.parent_id,
        "is_visible": category.is_visible,
        "tile_color": category.tile_color,
        "description": category.description,
        "seo_title": category.seo_title,
        "seo_description": category.seo_description,
        "cover_media_id": category.cover_media_id,
    }


async def create_category(db: AsyncSession, actor: AdminUser, data: dict[str, Any]) -> Category:
    slug = data.pop("slug", None) or slugify(data["name"])
    await _ensure_slug_free(db, Category, slug, None)
    await _validate_parent(db, data.get("parent_id"), None)
    max_order = await db.scalar(
        select(func.coalesce(func.max(Category.sort_order), -1)).where(
            Category.parent_id.is_(None)
            if data.get("parent_id") is None
            else Category.parent_id == data["parent_id"]
        )
    )
    tile = data.pop("tile_color", None)
    category = Category(
        slug=slug,
        sort_order=int(max_order or 0) + 1,
        tile_color=getattr(tile, "value", tile) or "neutral",
        **data,
    )
    db.add(category)
    await db.flush()
    await audit.record(
        db,
        actor,
        action="category.create",
        entity="category",
        entity_id=category.id,
        summary=f"Создана категория «{category.name}»",
    )
    return category


async def update_category(
    db: AsyncSession, actor: AdminUser, category_id: uuid.UUID, data: dict[str, Any]
) -> Category:
    category = await _get_category(db, category_id)
    before = _category_snapshot(category)
    if "slug" in data and data["slug"] and data["slug"] != category.slug:
        await _ensure_slug_free(db, Category, data["slug"], category.id)
        await _remember_old_slug(db, "category", category.slug, category.id)
    elif "slug" in data:
        data.pop("slug")
    if "parent_id" in data:
        await _validate_parent(db, data["parent_id"], category.id)
    for key, value in data.items():
        setattr(category, key, getattr(value, "value", value))
    await audit.record(
        db,
        actor,
        action="category.update",
        entity="category",
        entity_id=category.id,
        summary=f"Изменена категория «{category.name}»",
        diff=audit.diff_fields(before, _category_snapshot(category)),
    )
    return category


async def reorder_categories(db: AsyncSession, ids: Sequence[uuid.UUID]) -> None:
    categories = {
        c.id: c for c in (await db.scalars(select(Category).where(Category.id.in_(ids)))).all()
    }
    parents = {c.parent_id for c in categories.values()}
    if len(parents) > 1:
        raise DomainError("Менять порядок можно только внутри одного уровня")
    for index, category_id in enumerate(ids):
        if category_id in categories:
            categories[category_id].sort_order = index


async def archive_category(
    db: AsyncSession, container: Container, actor: AdminUser, category_id: uuid.UUID
) -> Category:
    category = await _get_category(db, category_id)
    products = await db.scalar(
        select(func.count())
        .select_from(Product)
        .where(Product.category_id == category.id, Product.archived_at.is_(None))
    )
    if products:
        raise ConflictError(
            f"В категории есть товары ({products}). Перенесите их в другую категорию "
            "или уберите в архив, затем повторите."
        )
    children = await db.scalar(
        select(func.count())
        .select_from(Category)
        .where(Category.parent_id == category.id, Category.archived_at.is_(None))
    )
    if children:
        raise ConflictError("Сначала уберите в архив подкатегории")
    category.archived_at = container.clock.now()
    await audit.record(
        db,
        actor,
        action="category.archive",
        entity="category",
        entity_id=category.id,
        summary=f"Категория «{category.name}» убрана в архив",
    )
    return category


async def restore_category(db: AsyncSession, actor: AdminUser, category_id: uuid.UUID) -> Category:
    category = await _get_category(db, category_id)
    category.archived_at = None
    await audit.record(
        db,
        actor,
        action="category.restore",
        entity="category",
        entity_id=category.id,
        summary=f"Категория «{category.name}» восстановлена",
    )
    return category


# ---------------------------------------------------------------- products


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Товар не найден")
    return product


def tea_pricing(product: Product) -> TeaPricing | None:
    if product.type != ProductType.TEA.value or not product.price_per_gram_kop:
        return None
    return TeaPricing(
        price_per_gram_kop=product.price_per_gram_kop,
        presets=tuple(product.weight_presets),
        cake_weight_grams=product.cake_weight_grams,
        cake_price_kop=product.cake_price_kop,
        custom_enabled=product.custom_weight_enabled,
        custom_min=product.custom_weight_min,
        custom_step=product.custom_weight_step,
    )


def build_search_text(product: Product) -> str:
    parts: list[str] = [product.name, *product.search_aliases]
    parts += [t.name for t in product.tags]
    if product.pinyin:
        parts.append(product.pinyin)
    if product.hanzi:
        parts.append(product.hanzi)
    for key in ("region", "factory", "tea_type"):
        value = product.attributes.get(key)
        if value:
            parts.append(str(value))
    if product.category is not None:
        parts.append(product.category.name)
    return " ".join(" ".join(parts).lower().split())


def publish_problems(product: Product) -> list[str]:
    missing: list[str] = []
    if not product.name.strip():
        missing.append("название")
    if product.category_id is None:
        missing.append("категорию")
    if product.type == ProductType.TEA.value:
        if not product.price_per_gram_kop:
            missing.append("цену")
        if not (
            product.weight_presets or product.cake_weight_grams or product.custom_weight_enabled
        ):
            missing.append("хотя бы один вариант веса")
    elif not product.unit_price_kop:
        missing.append("цену")
    return missing


def price_label(product: Product) -> str:
    pricing = tea_pricing(product)
    if pricing is not None:
        grams, price = listing_price(pricing)
        return f"{format_rub(pricing.price_per_gram_kop)}/г · {grams} г — {format_rub(price)}"
    if product.type == ProductType.UNIT.value and product.unit_price_kop:
        return format_rub(product.unit_price_kop)
    return "Цена не указана"


def status_label(product: Product) -> str:
    if product.archived_at is not None:
        return "В архиве"
    return PRODUCT_STATUS_LABELS[ProductStatus(product.status)]


async def create_product(
    db: AsyncSession,
    actor: AdminUser,
    *,
    type_: str,
    name: str,
    category_id: uuid.UUID | None,
) -> Product:
    settings = await get_group(db, CatalogSettings)
    if category_id is not None:
        await _get_category(db, category_id)
    name = " ".join(name.split())
    product = Product(
        type=type_,
        name=name,
        slug=await unique_slug(db, Product, slugify(name)),
        category_id=category_id,
        status=ProductStatus.DRAFT.value,
        weight_presets=list(settings.weight_presets) if type_ == ProductType.TEA.value else [],
        attributes={},
        brewing={},
        search_aliases=[],
        stock=0,
    )
    db.add(product)
    await db.flush()
    await db.refresh(product, ["tags", "images", "category"])
    product.search_text = build_search_text(product)
    await audit.record(
        db,
        actor,
        action="product.create",
        entity="product",
        entity_id=product.id,
        summary=f"Создан товар «{product.name}» (черновик)",
    )
    return product


_SNAPSHOT_FIELDS = (
    "name",
    "slug",
    "category_id",
    "short_description",
    "hanzi",
    "pinyin",
    "price_per_gram_kop",
    "unit_price_kop",
    "weight_presets",
    "cake_weight_grams",
    "cake_price_kop",
    "custom_weight_enabled",
    "custom_weight_min",
    "custom_weight_step",
    "weight_grams",
    "low_stock_threshold",
    "attributes",
    "brewing",
    "search_aliases",
    "show_from",
    "show_until",
    "seo_title",
    "seo_description",
    "sort_order",
    "status",
)


def product_snapshot(product: Product) -> dict[str, Any]:
    snapshot = {name: getattr(product, name) for name in _SNAPSHOT_FIELDS}
    snapshot["flavor_tags"] = sorted(t.name for t in product.tags)
    snapshot["description_changed"] = product.description
    return snapshot


async def _resolve_tags(db: AsyncSession, names: Sequence[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in names:
        slug = slugify(name, fallback="tag")
        tag = await db.scalar(select(Tag).where(Tag.slug == slug))
        if tag is None:
            tag = Tag(name=name, slug=slug)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    return tags


async def update_product(
    db: AsyncSession, actor: AdminUser, product_id: uuid.UUID, patch: ProductPatchIn
) -> Product:
    product = await get_product(db, product_id)
    before = product_snapshot(product)
    problems_before = set(publish_problems(product))
    data = patch.model_dump(exclude_unset=True)
    is_tea = product.type == ProductType.TEA.value

    if data.get("name"):
        product.name = " ".join(data.pop("name").split())
    data.pop("name", None)

    if "slug" in data:
        new_slug = data.pop("slug")
        if new_slug and new_slug != product.slug:
            await _ensure_slug_free(db, Product, new_slug, product.id)
            if product.status != ProductStatus.DRAFT.value:
                await _remember_old_slug(db, "product", product.slug, product.id)
            product.slug = new_slug

    if "category_id" in data:
        category_id = data.pop("category_id")
        if category_id is not None:
            await _get_category(db, category_id)
        product.category_id = category_id

    if "price" in data:
        price = data.pop("price")
        if price is not None:
            if not is_tea:
                raise DomainError("Для штучного товара укажите цену за штуку", field="price")
            product.price_per_gram_kop = price_per_gram_from_input(
                price_kop=price["amount_kop"], per_grams=price["per_grams"]
            )
            product.price_input_base = price["per_grams"]

    if "weight_presets" in data:
        presets = sorted(set(data.pop("weight_presets") or []))
        allowed = (await get_group(db, CatalogSettings)).weight_presets
        wrong = [p for p in presets if p not in allowed]
        if wrong:
            raise DomainError(
                f"Варианта {wrong[0]} г нет в общем списке. Добавьте его в «Настройки → "
                "Каталог» или выберите из существующих: " + ", ".join(f"{p} г" for p in allowed),
                field="weight_presets",
            )
        product.weight_presets = presets

    if "attributes" in data:
        attrs = data.pop("attributes") or {}
        product.attributes = {
            k: getattr(v, "value", v) for k, v in attrs.items() if v not in (None, "")
        }
    if "brewing" in data:
        brewing = data.pop("brewing") or {}
        methods = [
            {k: getattr(v, "value", v) for k, v in m.items() if v is not None}
            for m in brewing.get("methods", [])
        ]
        product.brewing = {"methods": methods, "master_note": brewing.get("master_note")}

    if "flavor_tags" in data:
        product.tags = await _resolve_tags(db, data.pop("flavor_tags") or [])
    if "search_aliases" in data:
        product.search_aliases = data.pop("search_aliases") or []

    for key, value in data.items():
        setattr(product, key, value)

    if is_tea and product.custom_weight_min % product.custom_weight_step:
        raise DomainError(
            f"Минимальный вес ({product.custom_weight_min} г) должен быть кратен шагу "
            f"({product.custom_weight_step} г)",
            field="custom_weight_min",
        )
    if product.show_from and product.show_until and product.show_from >= product.show_until:
        raise DomainError("Дата окончания показа должна быть позже даты начала", field="show_until")
    if product.status == ProductStatus.PUBLISHED.value:
        new_problems = [p for p in publish_problems(product) if p not in problems_before]
        if new_problems:
            raise DomainError(
                "Товар показан на сайте, поэтому нельзя убрать: " + ", ".join(new_problems)
            )

    await db.flush()
    await db.refresh(product, ["tags", "category"])
    product.search_text = build_search_text(product)
    after = product_snapshot(product)
    diff = audit.diff_fields(before, after)
    if "description_changed" in diff:
        diff["description_changed"] = ["…", "…"]
    if diff:
        await audit.record(
            db,
            actor,
            action="product.update",
            entity="product",
            entity_id=product.id,
            summary=f"Изменён товар «{product.name}»",
            diff=diff,
        )
    return product


async def publish_product(
    db: AsyncSession, container: Container, actor: AdminUser, product_id: uuid.UUID
) -> Product:
    product = await get_product(db, product_id)
    if product.archived_at is not None:
        raise DomainError("Товар в архиве — сначала восстановите его")
    problems = publish_problems(product)
    if problems:
        raise DomainError("Чтобы показать товар на сайте, заполните: " + ", ".join(problems))
    if product.is_new_until is None:
        settings = await get_group(db, CatalogSettings)
        product.is_new_until = container.clock.now() + timedelta(days=settings.new_badge_days)
    product.status = ProductStatus.PUBLISHED.value
    await audit.record(
        db,
        actor,
        action="product.publish",
        entity="product",
        entity_id=product.id,
        summary=f"Товар «{product.name}» показан на сайте",
    )
    return product


async def hide_product(db: AsyncSession, actor: AdminUser, product_id: uuid.UUID) -> Product:
    product = await get_product(db, product_id)
    product.status = ProductStatus.HIDDEN.value
    await audit.record(
        db,
        actor,
        action="product.hide",
        entity="product",
        entity_id=product.id,
        summary=f"Товар «{product.name}» скрыт с сайта",
    )
    return product


async def archive_product(
    db: AsyncSession, container: Container, actor: AdminUser, product_id: uuid.UUID
) -> Product:
    product = await get_product(db, product_id)
    product.archived_at = container.clock.now()
    await audit.record(
        db,
        actor,
        action="product.archive",
        entity="product",
        entity_id=product.id,
        summary=f"Товар «{product.name}» убран в архив",
    )
    return product


async def restore_product(db: AsyncSession, actor: AdminUser, product_id: uuid.UUID) -> Product:
    product = await get_product(db, product_id)
    product.archived_at = None
    if product.status == ProductStatus.PUBLISHED.value:
        product.status = ProductStatus.HIDDEN.value
    await audit.record(
        db,
        actor,
        action="product.restore",
        entity="product",
        entity_id=product.id,
        summary=f"Товар «{product.name}» восстановлен из архива (пока скрыт)",
    )
    return product


async def copy_product(db: AsyncSession, actor: AdminUser, product_id: uuid.UUID) -> Product:
    source = await get_product(db, product_id)
    name = f"{source.name} (копия)"
    copy = Product(
        type=source.type,
        name=name,
        slug=await unique_slug(db, Product, f"{source.slug}-kopiya"),
        category_id=source.category_id,
        status=ProductStatus.DRAFT.value,
        short_description=source.short_description,
        description=source.description,
        hanzi=source.hanzi,
        pinyin=source.pinyin,
        price_per_gram_kop=source.price_per_gram_kop,
        price_input_base=source.price_input_base,
        unit_price_kop=source.unit_price_kop,
        stock=0,
        low_stock_threshold=source.low_stock_threshold,
        weight_presets=list(source.weight_presets),
        cake_weight_grams=source.cake_weight_grams,
        cake_price_kop=source.cake_price_kop,
        custom_weight_enabled=source.custom_weight_enabled,
        custom_weight_min=source.custom_weight_min,
        custom_weight_step=source.custom_weight_step,
        weight_grams=source.weight_grams,
        attributes=dict(source.attributes),
        brewing=dict(source.brewing),
        search_aliases=list(source.search_aliases),
        seo_title=None,
        seo_description=source.seo_description,
        sort_order=source.sort_order,
    )
    copy.tags = list(source.tags)
    db.add(copy)
    await db.flush()
    relations = (
        await db.scalars(select(ProductRelation).where(ProductRelation.product_id == source.id))
    ).all()
    for rel in relations:
        db.add(
            ProductRelation(
                product_id=copy.id,
                related_id=rel.related_id,
                kind=rel.kind,
                sort_order=rel.sort_order,
            )
        )
    await db.flush()
    await db.refresh(copy, ["tags", "images", "category"])
    copy.search_text = build_search_text(copy)
    await audit.record(
        db,
        actor,
        action="product.copy",
        entity="product",
        entity_id=copy.id,
        summary=f"Создана копия товара «{source.name}»",
    )
    return copy


# ---------------------------------------------------------------- images


async def add_images(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    product_id: uuid.UUID,
    files: Sequence[tuple[bytes, str | None]],
) -> Product:
    product = await get_product(db, product_id)
    if len(product.images) + len(files) > MAX_IMAGES:
        raise DomainError(
            f"Можно загрузить не больше {MAX_IMAGES} фото. Сейчас: {len(product.images)}."
        )
    next_order = max((i.sort_order for i in product.images), default=-1) + 1
    for offset, (data, filename) in enumerate(files):
        media = await upload_image(db, container, data, filename)
        product.images.append(
            ProductImage(media_id=media.id, sort_order=next_order + offset, alt=product.name)
        )
    await db.flush()
    await db.refresh(product, ["images"])
    await audit.record(
        db,
        actor,
        action="product.images_add",
        entity="product",
        entity_id=product.id,
        summary=f"Добавлено фото к «{product.name}»: {len(files)}",
    )
    return product


async def reorder_images(
    db: AsyncSession, product_id: uuid.UUID, ids: Sequence[uuid.UUID]
) -> Product:
    product = await get_product(db, product_id)
    by_id = {img.id: img for img in product.images}
    if set(ids) != set(by_id):
        raise DomainError("Список фото изменился — обновите страницу")
    for index, image_id in enumerate(ids):
        by_id[image_id].sort_order = index
    await db.flush()
    await db.refresh(product, ["images"])
    return product


async def update_image_alt(
    db: AsyncSession, product_id: uuid.UUID, image_id: uuid.UUID, alt: str | None
) -> Product:
    product = await get_product(db, product_id)
    image = next((i for i in product.images if i.id == image_id), None)
    if image is None:
        raise NotFoundError("Фото не найдено")
    image.alt = alt
    return product


async def delete_image(
    db: AsyncSession, actor: AdminUser, product_id: uuid.UUID, image_id: uuid.UUID
) -> Product:
    product = await get_product(db, product_id)
    image = next((i for i in product.images if i.id == image_id), None)
    if image is None:
        raise NotFoundError("Фото не найдено")
    product.images.remove(image)
    await db.flush()
    await db.refresh(product, ["images"])
    await audit.record(
        db,
        actor,
        action="product.image_delete",
        entity="product",
        entity_id=product.id,
        summary=f"Удалено фото у «{product.name}»",
    )
    return product


# ---------------------------------------------------------------- relations


async def relations_of(db: AsyncSession, product_id: uuid.UUID) -> dict[str, list[Product]]:
    rows = (
        await db.scalars(
            select(ProductRelation)
            .where(ProductRelation.product_id == product_id)
            .order_by(ProductRelation.sort_order)
        )
    ).all()
    result: dict[str, list[Product]] = {kind.value: [] for kind in RelationKind}
    for row in rows:
        result[row.kind].append(row.related)
    return result


async def set_relations(
    db: AsyncSession,
    actor: AdminUser,
    product_id: uuid.UUID,
    kind: RelationKind,
    related_ids: Sequence[uuid.UUID],
) -> None:
    product = await get_product(db, product_id)
    ids = list(dict.fromkeys(related_ids))
    if product.id in ids:
        raise DomainError("Товар не может быть связан сам с собой")
    limit = MAX_RELATIONS[kind]
    if len(ids) > limit:
        raise DomainError(f"Можно выбрать не больше {limit} товаров")
    found = set(
        (await db.scalars(select(Product.id).where(Product.id.in_(ids)))).all() if ids else []
    )
    if len(found) != len(ids):
        raise NotFoundError("Некоторые товары не найдены")
    await db.execute(
        delete(ProductRelation).where(
            ProductRelation.product_id == product.id, ProductRelation.kind == kind.value
        )
    )
    for index, related_id in enumerate(ids):
        db.add(
            ProductRelation(
                product_id=product.id, related_id=related_id, kind=kind.value, sort_order=index
            )
        )
    await db.flush()
    await audit.record(
        db,
        actor,
        action="product.relations",
        entity="product",
        entity_id=product.id,
        summary=f"Изменены связанные товары «{product.name}»",
    )


# ---------------------------------------------------------------- listing


@dataclass(frozen=True, slots=True)
class ListFilters:
    q: str | None = None
    status: str | None = None
    category_id: uuid.UUID | None = None
    type: str | None = None
    stock: str | None = None  # low | out
    archived: bool = False


def _apply_filters(query: Select[Product], filters: ListFilters) -> Select[Product]:
    query = query.where(
        Product.archived_at.is_not(None) if filters.archived else Product.archived_at.is_(None)
    )
    if filters.q:
        term = filters.q.strip().lower()
        query = query.where(
            or_(Product.search_text.ilike(f"%{term}%"), Product.slug.ilike(f"%{term}%"))
        )
    if filters.status:
        query = query.where(Product.status == filters.status)
    if filters.category_id:
        child_ids = select(Category.id).where(Category.parent_id == filters.category_id)
        query = query.where(
            or_(Product.category_id == filters.category_id, Product.category_id.in_(child_ids))
        )
    if filters.type:
        query = query.where(Product.type == filters.type)
    return query


async def list_products(
    db: AsyncSession, filters: ListFilters, *, page: int, per_page: int
) -> tuple[list[tuple[Product, StockLevel]], int]:
    settings = await get_group(db, CatalogSettings)
    query = _apply_filters(select(Product), filters).order_by(Product.updated_at.desc(), Product.id)
    products = (await db.scalars(query)).all()
    rows = [(p, stock_level(p.stock, threshold_for(p, settings))) for p in products]
    if filters.stock == "low":
        rows = [r for r in rows if r[1] is StockLevel.LOW]
    elif filters.stock == "out":
        rows = [r for r in rows if r[1] is StockLevel.OUT]
    total = len(rows)
    start = (page - 1) * per_page
    return rows[start : start + per_page], total


def stock_label(product: Product) -> str:
    return format_qty(ProductType(product.type), product.stock)


def weight_options_for(product: Product) -> list[Any]:
    pricing = tea_pricing(product)
    if pricing is None:
        return []
    return weight_options(pricing, available_grams=product.stock)
