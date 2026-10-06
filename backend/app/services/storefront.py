"""Витрина: список товаров с фильтрами и поиском, карточка товара, подсказки поиска."""

import uuid
from collections import Counter
from collections.abc import Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, Select, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.catalog_labels import (
    ATTRIBUTE_LABELS,
    BREW_METHOD_LABELS,
    EFFECT_LABELS,
    SHAPE_LABELS,
    BrewMethod,
    TeaEffect,
    TeaShape,
)
from app.domain.errors import DomainError, MovedError, NotFoundError
from app.domain.inventory import StockLevel, stock_level
from app.domain.orders import REVENUE_STATUSES
from app.domain.pricing import (
    ProductType,
    VariantKind,
    listing_price,
    pack_price_kop,
    validate_tea_variant,
    weight_options,
)
from app.domain.texts import normalize_search, plural
from app.models import (
    Category,
    Order,
    OrderItem,
    Product,
    ProductRelation,
    SlugRedirect,
    product_tags,
)
from app.models.catalog import ProductStatus, RelationKind
from app.schemas.catalog import MediaOut
from app.schemas.storefront import (
    AttributeItem,
    Badge,
    BrewingMethodOut,
    BrewingOut,
    BrewingSummary,
    CatalogPage,
    Crumb,
    CustomPriceOut,
    CustomWeight,
    FacetOption,
    Facets,
    GalleryImage,
    PriceRange,
    ProductCard,
    ProductPage,
    PublicCategory,
    Seo,
    SuggestItem,
    TagFacet,
    VariantRef,
    WeightOptionPublic,
)
from app.services.catalog_admin import tea_pricing
from app.services.inventory import threshold_for
from app.services.media import media_urls
from app.services.pricing import PromoContext, load_context, price_with_discount, promotion_badge
from app.services.settings import get_group
from app.services.settings_schema import CatalogSettings

SIMILAR_LIMIT = 4
POPULAR_DAYS = 90
TRGM_THRESHOLD = 0.45
SORTS = ("popular", "new", "price_asc", "price_desc", "name")


# ------------------------------------------------------------------ queries


def visible_condition(now: datetime) -> list[ColumnElement[bool]]:
    return [
        Product.status == ProductStatus.PUBLISHED.value,
        Product.archived_at.is_(None),
        or_(Product.show_from.is_(None), Product.show_from <= now),
        or_(Product.show_until.is_(None), Product.show_until > now),
    ]


def _listing_query(now: datetime) -> Select[Product]:
    parent = select(Category.id).where(
        Category.is_visible.is_(True), Category.archived_at.is_(None)
    )
    visible_category = or_(
        Product.category_id.is_(None),
        Product.category_id.in_(
            select(Category.id).where(
                Category.is_visible.is_(True),
                Category.archived_at.is_(None),
                or_(Category.parent_id.is_(None), Category.parent_id.in_(parent)),
            )
        ),
    )
    return select(Product).where(*visible_condition(now), visible_category)


def _search_condition(q: str) -> ColumnElement[bool]:
    term = normalize_search(q)
    return or_(
        Product.search_text.ilike(f"%{term}%"),
        func.word_similarity(term, Product.search_text) > TRGM_THRESHOLD,
        func.to_tsvector("russian", Product.search_text).op("@@")(
            func.plainto_tsquery("russian", term)
        ),
    )


def _sort_key_price(product: Product) -> int:
    if product.type == ProductType.TEA.value:
        return (product.price_per_gram_kop or 0) * 100
    return product.unit_price_kop or 0


# ------------------------------------------------------------------ cards


def _tile_color(product: Product) -> str:
    return product.category.tile_color if product.category else "neutral"


def _meta(product: Product) -> str:
    parts: list[str] = []
    type_label = product.attributes.get("tea_type") or (
        product.category.name if product.category else None
    )
    if type_label:
        parts.append(str(type_label))
    region = product.attributes.get("region")
    if region:
        parts.append(str(region).split(",")[0].strip())
    year = product.attributes.get("harvest_year") or product.attributes.get("pressing_year")
    if year:
        parts.append(str(year))
    return " · ".join(parts)


def _format_grams(value: float) -> str:
    rounded = round(value, 1)
    text = f"{rounded:.1f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"{text} г"


def brewing_summary(product: Product) -> BrewingSummary | None:
    methods = product.brewing.get("methods") or []
    if not methods:
        return None
    m = methods[0]
    temp = f"{m['temp_c']}°" if m.get("temp_c") else "—"
    grams = "—"
    if m.get("grams"):
        per_100 = float(m["grams"]) * 100 / float(m.get("volume_ml") or 100)
        grams = _format_grams(per_100)
    steeps_n = m.get("steeps")
    steeps = str(steeps_n) if steeps_n else "—"
    label = plural(int(steeps_n), "пролив", "пролива", "проливов") if steeps_n else "проливов"
    return BrewingSummary(temp=temp, grams=grams, steeps=steeps, steeps_label=label)


def _media_out(container: Container, product: Product) -> MediaOut | None:
    if not product.images:
        return None
    media = product.images[0].media
    urls = media_urls(container, media)
    return MediaOut(
        id=media.id,
        url=urls["original"],
        srcset={k: v for k, v in urls.items() if k != "original"},
        width=media.width,
        height=media.height,
    )


@dataclass(frozen=True, slots=True)
class CardContext:
    container: Container
    promo: PromoContext
    settings: CatalogSettings


def _base_price(product: Product) -> tuple[int, int | None, int, int]:
    """(цена, граммы для подписи, граммы всего, штук) — для расчёта скидки."""
    pricing = tea_pricing(product)
    if pricing is not None:
        grams, price = listing_price(pricing)
        return price, grams, grams, 0
    return product.unit_price_kop or 0, None, 0, 1


def make_card(ctx: CardContext, product: Product) -> ProductCard:
    base, grams, grams_total, units = _base_price(product)
    priced = price_with_discount(
        ctx.promo, product, amount_kop=base, grams_total=grams_total, units=units
    )
    level = stock_level(product.stock, threshold_for(product, ctx.settings))
    badges: list[Badge] = []
    if priced.promotion is not None:
        kind, label = promotion_badge(ctx.promo, priced.promotion)
        badges.append(Badge(kind=kind, label=label))
    if product.is_new_until and product.is_new_until > ctx.promo.now:
        badges.append(Badge(kind="new", label="Новинка"))
    if level is StockLevel.LOW:
        badges.append(Badge(kind="low", label="Осталось мало"))
    elif level is StockLevel.OUT:
        badges.append(Badge(kind="out", label="Нет в наличии"))

    default_variant: VariantRef | None = None
    if product.type == ProductType.TEA.value and grams and grams <= product.stock:
        kind = "preset" if product.weight_presets else "custom"
        default_variant = VariantRef(kind=kind, grams=grams)
    elif product.type == ProductType.UNIT.value and product.stock > 0:
        default_variant = VariantRef(kind="unit", grams=0)

    return ProductCard(
        id=product.id,
        slug=product.slug,
        name=product.name,
        type=product.type,
        hanzi=product.hanzi,
        pinyin=product.pinyin,
        tile_color=_tile_color(product),
        image=_media_out(ctx.container, product),
        meta=_meta(product),
        short_description=product.short_description,
        price_kop=priced.price_kop,
        old_price_kop=priced.old_price_kop,
        price_grams=grams,
        price_per_gram_kop=product.price_per_gram_kop
        if product.type == ProductType.TEA.value
        else None,
        in_stock=product.stock > 0,
        badges=badges,
        default_variant=default_variant,
        brewing_summary=brewing_summary(product),
    )


async def card_context(db: AsyncSession, container: Container) -> CardContext:
    return CardContext(
        container=container,
        promo=await load_context(db, container.clock.now()),
        settings=await get_group(db, CatalogSettings),
    )


# ------------------------------------------------------------------ listing


@dataclass(frozen=True, slots=True)
class ListingParams:
    category: str | None = None
    q: str | None = None
    in_stock: bool = False
    tags: tuple[str, ...] = ()
    effect: str | None = None
    region: str | None = None
    shape: str | None = None
    price_min: int | None = None  # рубли за 100 г (для чая) или за штуку
    price_max: int | None = None
    sort: str = "popular"
    page: int = 1
    per_page: int = 24
    ids: tuple[uuid.UUID, ...] = ()


async def _category_by_slug(db: AsyncSession, slug: str) -> Category:
    category = await db.scalar(
        select(Category).where(
            Category.slug == slug, Category.archived_at.is_(None), Category.is_visible.is_(True)
        )
    )
    if category is None:
        redirect = await db.scalar(
            select(SlugRedirect).where(
                SlugRedirect.entity == "category", SlugRedirect.old_slug == slug
            )
        )
        if redirect is not None:
            target = await db.get(Category, redirect.entity_id)
            if target is not None and target.archived_at is None:
                raise MovedError(f"/catalog/{target.slug}")
        raise NotFoundError("Категория не найдена")
    return category


async def _sold_counts(db: AsyncSession, now: datetime) -> dict[uuid.UUID, int]:
    rows = await db.execute(
        select(OrderItem.product_id, func.count())
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status.in_([s.value for s in REVENUE_STATUSES] + ["completed"]),
            Order.created_at >= now - timedelta(days=POPULAR_DAYS),
            OrderItem.product_id.is_not(None),
        )
        .group_by(OrderItem.product_id)
    )
    return {pid: int(n) for pid, n in rows.all() if pid is not None}


def _facets(products: Sequence[Product]) -> Facets:
    tag_counts: Counter[tuple[str, str]] = Counter()
    regions: Counter[str] = Counter()
    shapes: Counter[str] = Counter()
    effects: Counter[str] = Counter()
    prices: list[int] = []
    for p in products:
        for t in p.tags:
            tag_counts[(t.slug, t.name)] += 1
        if p.attributes.get("region"):
            regions[str(p.attributes["region"])] += 1
        if p.attributes.get("shape"):
            shapes[str(p.attributes["shape"])] += 1
        if p.attributes.get("effect"):
            effects[str(p.attributes["effect"])] += 1
        if p.type == ProductType.TEA.value and p.price_per_gram_kop:
            prices.append(p.price_per_gram_kop * 100)

    def _label(mapping: dict, value: str, enum: type) -> str:  # type: ignore[type-arg]
        try:
            return str(mapping[enum(value)])
        except (ValueError, KeyError):
            return value

    return Facets(
        tags=[
            TagFacet(slug=slug, name=name, count=count)
            for (slug, name), count in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0][1]))
        ],
        regions=[FacetOption(value=r, label=r, count=c) for r, c in sorted(regions.items())],
        shapes=[
            FacetOption(value=s, label=_label(SHAPE_LABELS, s, TeaShape), count=c)
            for s, c in sorted(shapes.items())
        ],
        effects=[
            FacetOption(value=e, label=_label(EFFECT_LABELS, e, TeaEffect), count=c)
            for e, c in sorted(effects.items())
        ],
        price_per_100g=PriceRange(min_kop=min(prices), max_kop=max(prices)) if prices else None,
    )


def public_category(category: Category, count: int, container: Container) -> PublicCategory:
    cover = None
    if category.cover is not None:
        urls = media_urls(container, category.cover)
        cover = MediaOut(
            id=category.cover.id,
            url=urls["original"],
            srcset={k: v for k, v in urls.items() if k != "original"},
            width=category.cover.width,
            height=category.cover.height,
        )
    return PublicCategory(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        seo_title=category.seo_title,
        seo_description=category.seo_description,
        tile_color=category.tile_color,
        cover=cover,
        products_count=count,
    )


async def listing(db: AsyncSession, container: Container, params: ListingParams) -> CatalogPage:
    now = container.clock.now()
    ctx = await card_context(db, container)
    query = _listing_query(now)
    category: Category | None = None
    if params.category:
        category = await _category_by_slug(db, params.category)
        child_ids = select(Category.id).where(Category.parent_id == category.id)
        query = query.where(
            or_(Product.category_id == category.id, Product.category_id.in_(child_ids))
        )
    if params.ids:
        query = query.where(Product.id.in_(params.ids))
    if params.q:
        query = query.where(_search_condition(params.q))

    base_products = list((await db.scalars(query)).unique().all())
    facets = _facets(base_products)

    products = base_products
    if params.in_stock:
        products = [p for p in products if p.stock > 0]
    if params.tags:
        wanted = set(params.tags)
        products = [p for p in products if wanted & {t.slug for t in p.tags}]
    if params.effect:
        products = [p for p in products if p.attributes.get("effect") == params.effect]
    if params.region:
        products = [p for p in products if p.attributes.get("region") == params.region]
    if params.shape:
        products = [p for p in products if p.attributes.get("shape") == params.shape]
    if params.price_min is not None:
        products = [p for p in products if _sort_key_price(p) >= params.price_min * 100]
    if params.price_max is not None:
        products = [p for p in products if _sort_key_price(p) <= params.price_max * 100]

    sold = await _sold_counts(db, now) if params.sort == "popular" else {}
    relevance: dict[uuid.UUID, int] = {}
    if params.q:
        term = normalize_search(params.q)
        relevance = {p.id: 0 if term in p.search_text else 1 for p in products}

    def key(p: Product) -> tuple[object, ...]:
        stock_rank = 1 if (ctx.settings.out_of_stock_last and p.stock <= 0) else 0
        rel = relevance.get(p.id, 0)
        if params.sort == "new":
            return (stock_rank, rel, -p.created_at.timestamp())
        if params.sort == "price_asc":
            return (stock_rank, _sort_key_price(p), p.name)
        if params.sort == "price_desc":
            return (stock_rank, -_sort_key_price(p), p.name)
        if params.sort == "name":
            return (stock_rank, p.name)
        return (stock_rank, rel, -sold.get(p.id, 0), p.sort_order, -p.created_at.timestamp())

    products.sort(key=key)
    total = len(products)
    start = (params.page - 1) * params.per_page
    page_items = products[start : start + params.per_page]
    return CatalogPage(
        items=[make_card(ctx, p) for p in page_items],
        total=total,
        page=params.page,
        per_page=params.per_page,
        facets=facets,
        category=public_category(category, total, container) if category else None,
    )


async def category_tree(db: AsyncSession, container: Container) -> list[PublicCategory]:
    now = container.clock.now()
    counts = dict(
        (
            await db.execute(
                select(Product.category_id, func.count())
                .where(*visible_condition(now))
                .group_by(Product.category_id)
            )
        ).all()
    )
    categories = (
        await db.scalars(
            select(Category)
            .where(Category.is_visible.is_(True), Category.archived_at.is_(None))
            .order_by(Category.sort_order, Category.name)
        )
    ).all()
    roots: dict[uuid.UUID, PublicCategory] = {}
    for c in categories:
        if c.parent_id is None:
            roots[c.id] = public_category(c, int(counts.get(c.id, 0)), container)
    for c in categories:
        if c.parent_id is not None and c.parent_id in roots:
            child = public_category(c, int(counts.get(c.id, 0)), container)
            roots[c.parent_id].children.append(child)
            roots[c.parent_id].products_count += child.products_count
    return list(roots.values())


# ------------------------------------------------------------------ product page


async def _visible_product(db: AsyncSession, slug: str, now: datetime) -> Product:
    product = await db.scalar(select(Product).where(Product.slug == slug, *visible_condition(now)))
    if product is not None:
        return product
    redirect = await db.scalar(
        select(SlugRedirect).where(SlugRedirect.entity == "product", SlugRedirect.old_slug == slug)
    )
    if redirect is not None:
        target = await db.scalar(
            select(Product).where(Product.id == redirect.entity_id, *visible_condition(now))
        )
        if target is not None and target.slug != slug:
            raise MovedError(f"/product/{target.slug}")
    raise NotFoundError("Товар не найден или снят с продажи")


async def _related(
    db: AsyncSession, product: Product, kind: RelationKind, now: datetime
) -> list[Product]:
    return list(
        (
            await db.scalars(
                select(Product)
                .join(ProductRelation, ProductRelation.related_id == Product.id)
                .where(
                    ProductRelation.product_id == product.id,
                    ProductRelation.kind == kind.value,
                    *visible_condition(now),
                )
                .order_by(ProductRelation.sort_order)
            )
        ).all()
    )


async def _auto_similar(
    db: AsyncSession, product: Product, now: datetime, exclude: set[uuid.UUID], limit: int
) -> list[Product]:
    if limit <= 0 or product.category_id is None:
        return []
    tag_ids = [t.id for t in product.tags]
    shared = (
        select(func.count())
        .select_from(product_tags)
        .where(product_tags.c.product_id == Product.id, product_tags.c.tag_id.in_(tag_ids))
        .correlate(Product)
        .scalar_subquery()
        if tag_ids
        else literal(0)
    )
    query = (
        select(Product)
        .where(
            Product.category_id == product.category_id,
            Product.id.not_in(exclude | {product.id}),
            Product.stock > 0,
            *visible_condition(now),
        )
        .order_by(shared.desc(), Product.sort_order, Product.created_at.desc())
        .limit(limit)
    )
    return list((await db.scalars(query)).all())


def _attributes(product: Product) -> list[AttributeItem]:
    items: list[AttributeItem] = []
    for key, label in ATTRIBUTE_LABELS.items():
        value = product.attributes.get(key)
        if value in (None, ""):
            continue
        text = str(value)
        if key == "shape":
            with suppress(ValueError):
                text = SHAPE_LABELS[TeaShape(value)]
        if key == "effect":
            with suppress(ValueError):
                text = EFFECT_LABELS[TeaEffect(value)]
        items.append(AttributeItem(key=key, label=label, value=text))
    return items


def _brewing(product: Product) -> BrewingOut | None:
    methods = product.brewing.get("methods") or []
    note = product.brewing.get("master_note")
    if not methods and not note:
        return None
    out: list[BrewingMethodOut] = []
    for m in methods:
        try:
            label = BREW_METHOD_LABELS[BrewMethod(m.get("method"))]
        except ValueError:
            label = str(m.get("method"))
        out.append(BrewingMethodOut(method_label=label, **m))
    return BrewingOut(methods=out, master_note=note)


async def custom_weight_price(
    db: AsyncSession, container: Container, slug: str, grams: int
) -> CustomPriceOut:
    """Цена «своего веса» с учётом скидок — та же логика, что в корзине."""
    product = await _visible_product(db, slug, container.clock.now())
    pricing = tea_pricing(product)
    if pricing is None:
        return CustomPriceOut(
            grams=grams,
            price_kop=None,
            old_price_kop=None,
            available=False,
            message="Этот товар продаётся поштучно",
        )
    try:
        validate_tea_variant(pricing, VariantKind.CUSTOM, grams)
    except DomainError as exc:
        return CustomPriceOut(
            grams=grams, price_kop=None, old_price_kop=None, available=False, message=exc.message
        )
    ctx = await card_context(db, container)
    priced = price_with_discount(
        ctx.promo,
        product,
        amount_kop=pack_price_kop(pricing, VariantKind.CUSTOM, grams),
        grams_total=grams,
    )
    over_stock = grams > product.stock
    return CustomPriceOut(
        grams=grams,
        price_kop=priced.price_kop,
        old_price_kop=priced.old_price_kop,
        available=not over_stock,
        message=f"Доступно не больше {product.stock} г" if over_stock else None,
    )


async def product_page(db: AsyncSession, container: Container, slug: str) -> ProductPage:
    now = container.clock.now()
    product = await _visible_product(db, slug, now)
    ctx = await card_context(db, container)
    card = make_card(ctx, product)
    base_url = container.settings.public_base_url.rstrip("/")

    weight_opts: list[WeightOptionPublic] = []
    custom: CustomWeight | None = None
    pricing = tea_pricing(product)
    if pricing is not None:
        for option in weight_options(pricing, available_grams=product.stock):
            priced = price_with_discount(
                ctx.promo,
                product,
                amount_kop=pack_price_kop(pricing, option.kind, option.grams),
                grams_total=option.grams,
            )
            weight_opts.append(
                WeightOptionPublic(
                    kind=option.kind.value,
                    grams=option.grams,
                    label=option.label,
                    price_kop=priced.price_kop,
                    old_price_kop=priced.old_price_kop,
                    available=option.available,
                )
            )
        if product.custom_weight_enabled:
            custom = CustomWeight(
                enabled=True,
                min=product.custom_weight_min,
                step=product.custom_weight_step,
                max=product.stock,
            )

    pinned = await _related(db, product, RelationKind.SIMILAR_PINNED, now)
    similar = pinned[:SIMILAR_LIMIT]
    similar += await _auto_similar(
        db, product, now, {p.id for p in similar}, SIMILAR_LIMIT - len(similar)
    )
    goes_with = await _related(db, product, RelationKind.GOES_WITH, now)
    set_contains = await _related(db, product, RelationKind.SET_CONTAINS, now)

    breadcrumbs = [Crumb(name="Главная", href="/"), Crumb(name="Каталог", href="/catalog")]
    category_out: PublicCategory | None = None
    if product.category is not None:
        if product.category.parent_id:
            parent = await db.get(Category, product.category.parent_id)
            if parent is not None:
                breadcrumbs.append(Crumb(name=parent.name, href=f"/catalog/{parent.slug}"))
        breadcrumbs.append(
            Crumb(name=product.category.name, href=f"/catalog/{product.category.slug}")
        )
        category_out = public_category(product.category, 0, container)

    gallery = []
    for image in product.images:
        urls = media_urls(container, image.media)
        gallery.append(
            GalleryImage(
                url=urls["original"],
                srcset={k: v for k, v in urls.items() if k != "original"},
                alt=image.alt or product.name,
                width=image.media.width,
                height=image.media.height,
            )
        )
    level = stock_level(product.stock, threshold_for(product, ctx.settings))
    upcoming = ctx.promo.upcoming.get(product.id)
    priced_promotion = (
        price_with_discount(ctx.promo, product, amount_kop=card.old_price_kop or card.price_kop)
        if card.old_price_kop
        else None
    )
    description = product.seo_description or product.short_description or ""
    return ProductPage(
        **card.model_dump(),
        description=product.description,
        images=gallery,
        attributes=_attributes(product),
        flavor_tags=[TagFacet(slug=t.slug, name=t.name, count=0) for t in product.tags],
        brewing=_brewing(product),
        weight_options=weight_opts,
        custom_weight=custom,
        max_qty=product.stock if product.type == ProductType.UNIT.value else 0,
        low_stock=level is StockLevel.LOW,
        upcoming_thursday=upcoming.note if upcoming and not card.old_price_kop else None,
        promotion_title=priced_promotion.promotion.title
        if priced_promotion and priced_promotion.promotion
        else None,
        category=category_out,
        breadcrumbs=breadcrumbs,
        similar=[make_card(ctx, p) for p in similar],
        goes_with=[make_card(ctx, p) for p in goes_with],
        set_contains=[make_card(ctx, p) for p in set_contains],
        seo=Seo(
            title=product.seo_title or f"{product.name} — купить во Владимире | НСБ Чай",
            description=description[:300],
            canonical=f"{base_url}/product/{product.slug}",
            og_image=gallery[0].srcset.get("1024", gallery[0].url) if gallery else None,
        ),
        updated_at=product.updated_at,
    )


async def suggest(db: AsyncSession, container: Container, q: str) -> list[SuggestItem]:
    if len(q.strip()) < 2:
        return []
    now = container.clock.now()
    ctx = await card_context(db, container)
    products = (
        await db.scalars(
            _listing_query(now)
            .where(_search_condition(q))
            .order_by((Product.stock > 0).desc(), Product.name)
            .limit(8)
        )
    ).all()
    result = []
    for p in products:
        card = make_card(ctx, p)
        result.append(
            SuggestItem(
                slug=p.slug,
                name=p.name,
                image_url=card.image.srcset.get("320", card.image.url) if card.image else None,
                price_kop=card.price_kop,
            )
        )
    return result
