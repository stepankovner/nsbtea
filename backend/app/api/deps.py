"""Зависимости FastAPI: БД, контейнер, текущий сотрудник/покупатель, CSRF."""

from collections.abc import AsyncIterator, Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import AuthRequiredError
from app.models import Customer
from app.models.admin import AdminPermission
from app.services import admin_auth, customer_auth
from app.services.admin_auth import AdminContext

ADMIN_COOKIE = "nsb_admin"
CUSTOMER_COOKIE = "nsb_session"
CART_COOKIE = "nsb_cart"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """Сессия БД на запрос; коммит до отправки ответа (scope="function")."""
    container = get_container(request)
    async with container.session_factory() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


Db = Annotated[AsyncSession, Depends(get_db, scope="function")]
Deps = Annotated[Container, Depends(get_container)]


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def get_admin(request: Request, db: Db, container: Deps) -> AdminContext:
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        raise AuthRequiredError("Войдите в админку")
    context = await admin_auth.resolve_session(db, container, token)
    if request.method not in SAFE_METHODS:
        admin_auth.check_csrf(context, request.headers.get(CSRF_HEADER))
    return context


Admin = Annotated[AdminContext, Depends(get_admin)]


def require(
    permission: AdminPermission,
) -> Callable[[AdminContext], Coroutine[Any, Any, AdminContext]]:
    async def dependency(context: Admin) -> AdminContext:
        context.require(permission)
        return context

    return dependency


def require_any(
    *permissions: AdminPermission,
) -> Callable[[AdminContext], Coroutine[Any, Any, AdminContext]]:
    """Доступ, если есть хотя бы одно из прав (общие инструменты разных разделов)."""

    async def dependency(context: Admin) -> AdminContext:
        if not any(context.user.has_permission(p) for p in permissions):
            context.require(permissions[0])
        return context

    return dependency


async def require_owner(context: Admin) -> AdminContext:
    context.require_owner()
    return context


Owner = Annotated[AdminContext, Depends(require_owner)]


OrdersAccess = Annotated[AdminContext, Depends(require(AdminPermission.ORDERS))]
ProductsAccess = Annotated[AdminContext, Depends(require(AdminPermission.PRODUCTS))]
InventoryAccess = Annotated[AdminContext, Depends(require(AdminPermission.INVENTORY))]
CustomersAccess = Annotated[AdminContext, Depends(require(AdminPermission.CUSTOMERS))]
PromotionsAccess = Annotated[AdminContext, Depends(require(AdminPermission.PROMOTIONS))]
ContentAccess = Annotated[AdminContext, Depends(require(AdminPermission.CONTENT))]
ApplicationsAccess = Annotated[AdminContext, Depends(require(AdminPermission.APPLICATIONS))]
# загрузка картинок: товары и страницы сайта
MediaAccess = Annotated[
    AdminContext, Depends(require_any(AdminPermission.PRODUCTS, AdminPermission.CONTENT))
]
# выбор товаров в акциях, контенте, складе и заказах
ProductLookupAccess = Annotated[
    AdminContext,
    Depends(
        require_any(
            AdminPermission.PRODUCTS,
            AdminPermission.PROMOTIONS,
            AdminPermission.CONTENT,
            AdminPermission.INVENTORY,
            AdminPermission.ORDERS,
        )
    ),
]


async def get_customer_optional(request: Request, db: Db, container: Deps) -> Customer | None:
    token = request.cookies.get(CUSTOMER_COOKIE)
    if not token:
        return None
    return await customer_auth.resolve_session(db, container, token)


OptionalCustomer = Annotated[Customer | None, Depends(get_customer_optional)]


async def get_customer(customer: OptionalCustomer) -> Customer:
    if customer is None:
        raise AuthRequiredError("Войдите в личный кабинет")
    return customer


CurrentCustomer = Annotated[Customer, Depends(get_customer)]
