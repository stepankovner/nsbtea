"""Общие фикстуры: тестовая БД (настоящий PostgreSQL), приложение с заглушками интеграций."""

import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import Settings
from app.container import Container, build_test_container
from app.db import create_engine, create_session_factory
from app.main import create_app
from app.models import Base

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://nsb:nsb@localhost:5432/nsbtea_test"
)
# Понедельник, 5 октября 2026, 12:00 МСК
DEFAULT_NOW = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url=TEST_DATABASE_URL,
        secret_key="test-secret-key-test-secret-key-0123456789",
        public_base_url="https://nsbtea.test",
        telegram_bot_username="nsbtea_test_bot",
        media_local_dir="/tmp/nsbtea-test-media",  # noqa: S108
    )


@pytest.fixture(scope="session")
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))

    def run_migrations(connection: object) -> None:
        cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
        cfg.set_main_option(
            "script_location", os.path.join(os.path.dirname(__file__), "..", "migrations")
        )
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")

    async with engine.begin() as conn:
        await conn.run_sync(run_migrations)
    yield engine
    await engine.dispose()


@pytest.fixture
async def session_factory(engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    yield create_session_factory(engine)
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        await conn.execute(text("ALTER SEQUENCE order_number_seq RESTART WITH 10001"))


@pytest.fixture
async def db(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest.fixture
def container(settings: Settings, session_factory: async_sessionmaker[AsyncSession]) -> Container:
    return build_test_container(settings, session_factory, now=DEFAULT_NOW)


@pytest.fixture
async def client(container: Container) -> AsyncIterator[AsyncClient]:
    app = create_app(container)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://nsbtea.test") as ac:
        yield ac
