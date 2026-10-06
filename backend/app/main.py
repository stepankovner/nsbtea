"""Точка входа FastAPI. `uvicorn app.main:app`."""

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import dev as dev_api
from app.api import health
from app.api.account import routes as account_api
from app.api.admin import auth as admin_auth_api
from app.api.admin import catalog as admin_catalog_api
from app.api.admin import content as admin_content_api
from app.api.admin import inventory as admin_inventory_api
from app.api.admin import marketing as admin_marketing_api
from app.api.admin import orders as admin_orders_api
from app.api.admin import overview as admin_overview_api
from app.api.admin import settings as admin_settings_api
from app.api.errors import install_error_handlers
from app.api.public import catalog as public_catalog_api
from app.api.public import shop as shop_api
from app.api.webhooks import telegram as telegram_webhook_api
from app.config import Environment, get_settings
from app.container import Container, build_container
from app.integrations.storage import LocalStorage

logger = logging.getLogger(__name__)


def _api_router() -> APIRouter:
    router = APIRouter(prefix="/api")
    router.include_router(health.router)
    router.include_router(public_catalog_api.router)
    router.include_router(shop_api.router)
    router.include_router(account_api.router)
    router.include_router(dev_api.router)
    router.include_router(admin_auth_api.router)
    router.include_router(admin_auth_api.staff_router)
    router.include_router(admin_settings_api.router)
    router.include_router(admin_catalog_api.router)
    router.include_router(admin_inventory_api.router)
    router.include_router(admin_orders_api.router)
    router.include_router(admin_marketing_api.router)
    router.include_router(admin_content_api.router)
    router.include_router(admin_overview_api.router)
    router.include_router(telegram_webhook_api.router)
    return router


def create_app(container: Container | None = None) -> FastAPI:
    container = container or build_container(get_settings())
    settings = container.settings

    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment.value,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app = FastAPI(
        title="НСБ Чай — API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.environment is not Environment.PRODUCTION else None,
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.container = container
    install_error_handlers(app)

    if settings.cors_origins and settings.environment is Environment.DEV:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/admin") or request.url.path.startswith("/api/account"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    app.include_router(_api_router())

    if isinstance(container.storage, LocalStorage):
        container.storage.root.mkdir(parents=True, exist_ok=True)
        app.mount(
            settings.media_public_url,
            StaticFiles(directory=container.storage.root),
            name="media",
        )
    return app


def app_factory() -> FastAPI:  # pragma: no cover - для uvicorn --factory
    return create_app()
