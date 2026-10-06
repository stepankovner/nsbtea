"""Подключение к PostgreSQL (async SQLAlchemy)."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def create_engine(url: str, *, echo: bool = False) -> AsyncEngine:
    return create_async_engine(url, echo=echo, pool_pre_ping=True, pool_size=10, max_overflow=10)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def session_scope(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Сессия на один запрос: коммит при успехе, откат при ошибке."""
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise
