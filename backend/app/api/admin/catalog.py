"""Админка: категории и товары."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status
from sqlalchemy import or_, select

from app.api.deps import Db, Deps, MediaAccess, ProductLookupAccess, ProductsAccess
from app.container import Container
from app.domain.inventory import format_qty
from app.domain.pricing import ProductType, price_per_100g_kop
from app.domain.texts import normalize_search
from app.models import Product, Tag
from app.models.catalog import RelationKind
from app.models.system import MediaFile
from app.schemas.catalog import (
    AltIn,
    CategoryIn,
    CategoryOut,
    CategoryPatch,
    CategoryRef,
    IdsIn,
    MediaOut,
    ProductBrief,
    ProductCreateIn,
    ProductImageOut,
    ProductListItem,
    ProductListOut,
    ProductOut,
    ProductPatchIn,
    RelationsIn,
    TagOut,
    WeightOptionOut,
)
from app.schemas.common import ApiModel, Ok
from app.services import catalog_admin as svc
from app.services.catalog_admin import CategoryNode, ListFilters
from app.services.inventory import threshold_for
from app.services.media import media_urls, upload_image
from app.services.settings import get_group
from app.services.settings_schema import CatalogSettings

router = APIRouter(prefix="/admin", tags=["admin: каталог"])
Products = ProductsAccess


def media_out(container: Container, media: MediaFile | None) -> MediaOut | None:
    if media is None:
        return None
    urls = media_urls(container, media)
    return MediaOut(
        id=media.id,
        url=urls["original"],
        srcset={k: v for k, v in urls.items() if k != "original"},
        width=media.width,
        height=media.height,
    )


def _category_out(container: Container, node: CategoryNode) -> CategoryOut:
    c = node.category
    return CategoryOut(
        id=c.id,
        name=c.name,
        slug=c.slug,
        parent_id=c.parent_id,
        sort_order=c.sort_order,
        description=c.description,
        seo_title=c.seo_title,
        seo_description=c.seo_description,
        is_visible=c.is_visible,
        tile_color=c.tile_color,
        cover=media_out(container, c.cover),
        products_count=node.products_count,
        archived_at=c.archived_at,
        children=[_category_out(container, child) for child in node.children],
    )


def main_image_url(container: Container, product: Product) -> str | None:
    if not product.images:
        return None
    urls = media_urls(container, product.images[0].media)
    return urls.get("320") or urls["original"]


def brief(container: Container, product: Product) -> ProductBrief:
    return ProductBrief(
        id=product.id,
        name=product.name,
        type=product.type,
        status=product.status,
        image_url=main_image_url(container, product),
    )


async def product_out(db: Db, container: Container, product: Product) -> ProductOut:
    settings = await get_group(db, CatalogSettings)
    relations = await svc.relations_of(db, product.id)
    images = []
    for image in product.images:
        urls = media_urls(container, image.media)
        images.append(
            ProductImageOut(
                id=image.id,
                media_id=image.media_id,
                url=urls["original"],
                srcset={k: v for k, v in urls.items() if k != "original"},
                alt=image.alt,
                width=image.media.width,
                height=image.media.height,
            )
        )
    is_tea = product.type == ProductType.TEA.value
    return ProductOut(
        id=product.id,
        type=product.type,
        name=product.name,
        slug=product.slug,
        status=product.status,
        status_label=svc.status_label(product),
        category=CategoryRef(id=product.category.id, name=product.category.name)
        if product.category
        else None,
        short_description=product.short_description,
        description=product.description,
        hanzi=product.hanzi,
        pinyin=product.pinyin,
        price_per_gram_kop=product.price_per_gram_kop,
        price_input_base=product.price_input_base,
        price_per_100g_kop=price_per_100g_kop(product.price_per_gram_kop)
        if is_tea and product.price_per_gram_kop
        else None,
        unit_price_kop=product.unit_price_kop,
        stock=product.stock,
        stock_label=svc.stock_label(product),
        low_stock_threshold=product.low_stock_threshold,
        effective_threshold=threshold_for(product, settings),
        weight_presets=product.weight_presets,
        cake_weight_grams=product.cake_weight_grams,
        cake_price_kop=product.cake_price_kop,
        custom_weight_enabled=product.custom_weight_enabled,
        custom_weight_min=product.custom_weight_min,
        custom_weight_step=product.custom_weight_step,
        weight_grams=product.weight_grams,
        attributes=product.attributes,
        brewing=product.brewing,
        flavor_tags=[TagOut.model_validate(t) for t in product.tags],
        search_aliases=product.search_aliases,
        images=images,
        relations={k: [brief(container, p) for p in v] for k, v in relations.items()},
        weight_options=[
            WeightOptionOut(
                kind=o.kind.value,
                grams=o.grams,
                label=o.label,
                price_kop=o.price_kop,
                available=o.available,
            )
            for o in svc.weight_options_for(product)
        ],
        publish_problems=svc.publish_problems(product),
        is_new_until=product.is_new_until,
        show_from=product.show_from,
        show_until=product.show_until,
        seo_title=product.seo_title,
        seo_description=product.seo_description,
        sort_order=product.sort_order,
        archived_at=product.archived_at,
        created_at=product.created_at,
        updated_at=product.updated_at,
        site_url=f"{container.settings.public_base_url.rstrip('/')}/product/{product.slug}",
    )


# ------------------------------------------------------------------ categories


@router.get("/categories", response_model=list[CategoryOut], summary="Дерево категорий")
async def list_categories(
    _: Products, db: Db, container: Deps, archived: bool = False
) -> list[CategoryOut]:
    return [_category_out(container, n) for n in await svc.category_tree(db, archived=archived)]


async def _category_by_id(db: Db, container: Container, category_id: uuid.UUID) -> CategoryOut:
    for archived in (False, True):
        for root in await svc.category_tree(db, archived=archived):
            for node in [root, *root.children]:
                if node.category.id == category_id:
                    return _category_out(container, node)
    raise AssertionError("категория должна существовать")


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать категорию",
)
async def create_category(
    payload: CategoryIn, context: Products, db: Db, container: Deps
) -> CategoryOut:
    category = await svc.create_category(db, context.user, payload.model_dump())
    return await _category_by_id(db, container, category.id)


@router.patch("/categories/{category_id}", response_model=CategoryOut, summary="Изменить категорию")
async def update_category(
    category_id: uuid.UUID, payload: CategoryPatch, context: Products, db: Db, container: Deps
) -> CategoryOut:
    await svc.update_category(db, context.user, category_id, payload.model_dump(exclude_unset=True))
    await db.flush()
    return await _category_by_id(db, container, category_id)


@router.post("/categories/reorder", response_model=Ok, summary="Порядок категорий")
async def reorder_categories(payload: IdsIn, _: Products, db: Db) -> Ok:
    await svc.reorder_categories(db, payload.ids)
    return Ok()


@router.delete("/categories/{category_id}", response_model=Ok, summary="Убрать в архив")
async def archive_category(
    category_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> Ok:
    await svc.archive_category(db, container, context.user, category_id)
    return Ok()


@router.post("/categories/{category_id}/restore", response_model=Ok, summary="Восстановить")
async def restore_category(category_id: uuid.UUID, context: Products, db: Db) -> Ok:
    await svc.restore_category(db, context.user, category_id)
    return Ok()


# ------------------------------------------------------------------ products


@router.get("/products", response_model=ProductListOut, summary="Список товаров")
async def list_products(
    _: Products,
    db: Db,
    container: Deps,
    q: str | None = None,
    status_: Annotated[str | None, Query(alias="status")] = None,
    category_id: uuid.UUID | None = None,
    type_: Annotated[str | None, Query(alias="type")] = None,
    stock: str | None = None,
    archived: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ProductListOut:
    rows, total = await svc.list_products(
        db,
        ListFilters(
            q=q,
            status=status_,
            category_id=category_id,
            type=type_,
            stock=stock,
            archived=archived,
        ),
        page=page,
        per_page=per_page,
    )
    items = [
        ProductListItem(
            id=p.id,
            name=p.name,
            type=p.type,
            status=p.status,
            status_label=svc.status_label(p),
            category_name=p.category.name if p.category else None,
            price_label=svc.price_label(p),
            price_per_gram_kop=p.price_per_gram_kop,
            unit_price_kop=p.unit_price_kop,
            stock=p.stock,
            stock_label=svc.stock_label(p),
            stock_level=level.value,
            image_url=main_image_url(container, p),
            archived_at=p.archived_at,
            updated_at=p.updated_at,
        )
        for p, level in rows
    ]
    return ProductListOut(items=items, total=total, page=page, per_page=per_page)


@router.post(
    "/products",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать товар (черновик)",
)
async def create_product(
    payload: ProductCreateIn, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.create_product(
        db, context.user, type_=payload.type, name=payload.name, category_id=payload.category_id
    )
    return await product_out(db, container, product)


@router.get("/products/{product_id}", response_model=ProductOut, summary="Товар")
async def get_product(product_id: uuid.UUID, _: Products, db: Db, container: Deps) -> ProductOut:
    return await product_out(db, container, await svc.get_product(db, product_id))


@router.patch("/products/{product_id}", response_model=ProductOut, summary="Изменить товар")
async def update_product(
    product_id: uuid.UUID, payload: ProductPatchIn, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.update_product(db, context.user, product_id, payload)
    return await product_out(db, container, product)


@router.post("/products/{product_id}/publish", response_model=ProductOut, summary="Показать")
async def publish_product(
    product_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.publish_product(db, container, context.user, product_id)
    return await product_out(db, container, product)


@router.post("/products/{product_id}/hide", response_model=ProductOut, summary="Скрыть с сайта")
async def hide_product(
    product_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.hide_product(db, context.user, product_id)
    return await product_out(db, container, product)


@router.delete("/products/{product_id}", response_model=Ok, summary="Убрать в архив")
async def archive_product(product_id: uuid.UUID, context: Products, db: Db, container: Deps) -> Ok:
    await svc.archive_product(db, container, context.user, product_id)
    return Ok()


@router.post("/products/{product_id}/restore", response_model=ProductOut, summary="Из архива")
async def restore_product(
    product_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.restore_product(db, context.user, product_id)
    return await product_out(db, container, product)


@router.post(
    "/products/{product_id}/copy",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать копию",
)
async def copy_product(
    product_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.copy_product(db, context.user, product_id)
    return await product_out(db, container, product)


@router.post("/products/{product_id}/images", response_model=ProductOut, summary="Добавить фото")
async def add_images(
    product_id: uuid.UUID,
    context: Products,
    db: Db,
    container: Deps,
    files: Annotated[list[UploadFile], File(description="Фото товара")],
) -> ProductOut:
    payload = [(await f.read(), f.filename) for f in files]
    product = await svc.add_images(db, container, context.user, product_id, payload)
    return await product_out(db, container, product)


@router.post(
    "/products/{product_id}/images/order", response_model=ProductOut, summary="Порядок фото"
)
async def reorder_images(
    product_id: uuid.UUID, payload: IdsIn, _: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.reorder_images(db, product_id, payload.ids)
    return await product_out(db, container, product)


@router.patch(
    "/products/{product_id}/images/{image_id}", response_model=ProductOut, summary="Подпись фото"
)
async def update_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: AltIn,
    _: Products,
    db: Db,
    container: Deps,
) -> ProductOut:
    product = await svc.update_image_alt(db, product_id, image_id, payload.alt)
    return await product_out(db, container, product)


@router.delete(
    "/products/{product_id}/images/{image_id}", response_model=ProductOut, summary="Удалить фото"
)
async def delete_image(
    product_id: uuid.UUID, image_id: uuid.UUID, context: Products, db: Db, container: Deps
) -> ProductOut:
    product = await svc.delete_image(db, context.user, product_id, image_id)
    return await product_out(db, container, product)


@router.put(
    "/products/{product_id}/relations/{kind}",
    response_model=ProductOut,
    summary="Похожие / «Подойдёт к» / состав набора",
)
async def set_relations(
    product_id: uuid.UUID,
    kind: RelationKind,
    payload: RelationsIn,
    context: Products,
    db: Db,
    container: Deps,
) -> ProductOut:
    await svc.set_relations(db, context.user, product_id, kind, payload.product_ids)
    return await product_out(db, container, await svc.get_product(db, product_id))


@router.get("/tags", response_model=list[TagOut], summary="Вкусовые ноты")
async def list_tags(_: Products, db: Db, q: str | None = None) -> list[TagOut]:
    query = select(Tag).order_by(Tag.name).limit(50)
    if q:
        query = query.where(Tag.name.ilike(f"%{q.strip()}%"))
    return [TagOut.model_validate(t) for t in (await db.scalars(query)).all()]


@router.post("/media", response_model=MediaOut, summary="Загрузить картинку")
async def upload_media(
    _: MediaAccess,
    db: Db,
    container: Deps,
    file: Annotated[UploadFile, File(description="Картинка")],
) -> MediaOut:
    media = await upload_image(db, container, await file.read(), file.filename)
    out = media_out(container, media)
    assert out is not None
    return out


class LookupProduct(ApiModel):
    id: uuid.UUID
    slug: str
    name: str
    type: str
    status: str
    image_url: str | None
    stock_label: str


@router.get("/lookup/products", response_model=list[LookupProduct], summary="Выбор товаров (поиск)")
async def lookup_products(
    _: ProductLookupAccess,
    db: Db,
    container: Deps,
    q: Annotated[str | None, Query(max_length=100)] = None,
    ids: Annotated[str | None, Query(max_length=4000, description="id через запятую")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[LookupProduct]:
    query = select(Product).where(Product.archived_at.is_(None))
    if ids:
        wanted = [uuid.UUID(i) for i in ids.split(",") if i.strip()]
        query = query.where(Product.id.in_(wanted))
    elif q and q.strip():
        term = normalize_search(q.strip())
        query = query.where(
            or_(Product.search_text.ilike(f"%{term}%"), Product.name.ilike(f"%{q.strip()}%"))
        )
    products = (await db.scalars(query.order_by(Product.name).limit(limit))).all()
    return [
        LookupProduct(
            id=p.id,
            slug=p.slug,
            name=p.name,
            type=p.type,
            status=p.status,
            image_url=main_image_url(container, p),
            stock_label=format_qty(ProductType(p.type), p.stock),
        )
        for p in products
    ]
