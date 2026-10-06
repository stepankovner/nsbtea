"""Публичное API витрины: сайт, каталог, карточка, главная, страницы, события, заявки."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.api.deps import Db, Deps, client_ip
from app.models.content import PageKind
from app.schemas.content import (
    ApplicationCreated,
    ApplicationIn,
    EventOut,
    HomeOut,
    PageListItem,
    PageOut,
    SiteOut,
)
from app.schemas.storefront import (
    CatalogPage,
    CustomPriceOut,
    ProductPage,
    PublicCategory,
    SuggestItem,
)
from app.services import content_public, storefront

router = APIRouter(tags=["витрина"])


@router.get("/site", response_model=SiteOut, summary="Настройки сайта для шапки и подвала")
async def site(db: Db, container: Deps) -> SiteOut:
    return await content_public.site_info(db, container)


@router.get("/catalog/categories", response_model=list[PublicCategory], summary="Категории")
async def categories(db: Db, container: Deps) -> list[PublicCategory]:
    return await storefront.category_tree(db, container)


@router.get("/catalog/products", response_model=CatalogPage, summary="Каталог")
async def products(
    db: Db,
    container: Deps,
    category: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    in_stock: bool = False,
    tags: Annotated[str | None, Query(description="slug через запятую")] = None,
    effect: str | None = None,
    region: str | None = None,
    shape: str | None = None,
    price_min: Annotated[int | None, Query(ge=0, description="₽ за 100 г / за штуку")] = None,
    price_max: Annotated[int | None, Query(ge=0)] = None,
    sort: Annotated[str, Query(pattern="^(popular|new|price_asc|price_desc|name)$")] = "popular",
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 24,
) -> CatalogPage:
    return await storefront.listing(
        db,
        container,
        storefront.ListingParams(
            category=category,
            q=q.strip() if q and q.strip() else None,
            in_stock=in_stock,
            tags=tuple(t for t in (tags or "").split(",") if t),
            effect=effect,
            region=region,
            shape=shape,
            price_min=price_min,
            price_max=price_max,
            sort=sort,
            page=page,
            per_page=per_page,
        ),
    )


@router.get("/catalog/products/{slug}", response_model=ProductPage, summary="Карточка товара")
async def product(slug: str, db: Db, container: Deps) -> ProductPage:
    return await storefront.product_page(db, container, slug)


@router.get(
    "/catalog/products/{slug}/price",
    response_model=CustomPriceOut,
    summary="Цена своего веса",
)
async def custom_price(
    slug: str, db: Db, container: Deps, grams: Annotated[int, Query(ge=1, le=100_000)]
) -> CustomPriceOut:
    return await storefront.custom_weight_price(db, container, slug, grams)


@router.get("/catalog/suggest", response_model=list[SuggestItem], summary="Подсказки поиска")
async def suggest(
    db: Db, container: Deps, q: Annotated[str, Query(max_length=100)] = ""
) -> list[SuggestItem]:
    return await storefront.suggest(db, container, q)


@router.get("/home", response_model=HomeOut, summary="Блоки главной")
async def home(db: Db, container: Deps) -> HomeOut:
    return await content_public.home(db, container)


@router.get("/pages", response_model=list[PageListItem], summary="Страницы")
async def pages(db: Db, container: Deps, kind: PageKind | None = None) -> list[PageListItem]:
    return await content_public.list_pages(db, container, kind)


@router.get("/pages/{slug}", response_model=PageOut, summary="Страница")
async def page(slug: str, db: Db, container: Deps) -> PageOut:
    return await content_public.get_page(db, container, slug)


@router.get("/events", response_model=list[EventOut], summary="События")
async def events(
    db: Db,
    container: Deps,
    type: str | None = None,
    period: Annotated[str, Query(pattern="^(upcoming|past)$")] = "upcoming",
) -> list[EventOut]:
    return await content_public.list_events(db, container, type_=type, past=period == "past")


@router.get("/events/{slug}", response_model=EventOut, summary="Событие")
async def event(slug: str, db: Db, container: Deps) -> EventOut:
    return await content_public.get_event(db, container, slug)


@router.post(
    "/applications",
    response_model=ApplicationCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Заявка: опт, запись на событие, индивидуальная церемония",
)
async def create_application(
    payload: ApplicationIn, request: Request, db: Db, container: Deps
) -> ApplicationCreated:
    message = await content_public.create_application(db, container, payload, ip=client_ip(request))
    return ApplicationCreated(message=message)
