"""Контейнер зависимостей: настройки, время, БД и все внешние интеграции.

Боевой контейнер собирается из переменных окружения; в тестах — с заглушками.
"""

from dataclasses import dataclass, field
from datetime import datetime

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import EmailMode, IntegrationMode, MediaStorage, Settings
from app.core.clock import Clock, FrozenClock
from app.core.ratelimit import MemoryRateLimiter, RateLimiter, RedisRateLimiter
from app.db import create_engine, create_session_factory
from app.integrations.delivery import CdekGateway, FakeCdekGateway
from app.integrations.messaging import (
    BotTelegramSender,
    ConsoleMailer,
    DisabledTelegramSender,
    FakeMailer,
    FakeTelegramSender,
    Mailer,
    SmtpMailer,
    TelegramSender,
)
from app.integrations.payments import FakePaymentGateway, PaymentGateway
from app.integrations.storage import LocalStorage, S3Storage, Storage


class Kicker:
    """Будит воркер, чтобы тот сразу доставил сообщения из outbox (иначе — по расписанию)."""

    async def kick(self, job: str) -> None:  # pragma: no cover - интерфейс
        return None


class ArqKicker(Kicker):
    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url

    async def kick(self, job: str) -> None:
        from arq import create_pool
        from arq.connections import RedisSettings

        try:
            pool = await create_pool(RedisSettings.from_dsn(self._redis_url))
            try:
                await pool.enqueue_job(job, _job_id=f"{job}:kick", _defer_by=1)
            finally:
                await pool.aclose()
        except Exception:
            return None


@dataclass
class Container:
    settings: Settings
    clock: Clock
    session_factory: async_sessionmaker[AsyncSession]
    rate_limiter: RateLimiter
    payments: PaymentGateway
    cdek: CdekGateway
    storage: Storage
    telegram: TelegramSender
    mailer: Mailer
    kicker: Kicker = field(default_factory=Kicker)

    @property
    def secret(self) -> str:
        return self.settings.secret_key.get_secret_value()


def build_container(settings: Settings) -> Container:
    engine = create_engine(settings.database_url, echo=settings.database_echo)
    clock = Clock()
    redis = Redis.from_url(settings.redis_url)

    storage: Storage
    if settings.media_storage is MediaStorage.S3:
        assert settings.s3_bucket, "S3_BUCKET не задан"
        assert settings.s3_access_key, "S3_ACCESS_KEY не задан"
        assert settings.s3_secret_key, "S3_SECRET_KEY не задан"
        storage = S3Storage(
            endpoint_url=settings.s3_endpoint_url,
            region=settings.s3_region,
            bucket=settings.s3_bucket,
            access_key=settings.s3_access_key.get_secret_value(),
            secret_key=settings.s3_secret_key.get_secret_value(),
            public_url=settings.media_public_url,
        )
    else:
        storage = LocalStorage(settings.media_local_dir, settings.media_public_url)

    payments: PaymentGateway
    if settings.tochka_mode is IntegrationMode.FAKE:
        payments = FakePaymentGateway(clock, settings.public_base_url)
    else:
        from app.integrations.tochka import TochkaGateway

        payments = TochkaGateway.from_settings(settings)

    cdek: CdekGateway
    if settings.cdek_mode is IntegrationMode.FAKE:
        cdek = FakeCdekGateway()
    else:
        from app.integrations.cdek import CdekClient

        cdek = CdekClient.from_settings(settings)

    telegram: TelegramSender
    if settings.telegram_bot_token:
        telegram = BotTelegramSender(settings.telegram_bot_token.get_secret_value())
    else:
        telegram = DisabledTelegramSender()

    mailer: Mailer
    if settings.email_mode is EmailMode.SMTP and settings.smtp_host:
        mailer = SmtpMailer(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            sender=settings.smtp_from,
            starttls=settings.smtp_starttls,
        )
    else:
        mailer = ConsoleMailer()

    return Container(
        settings=settings,
        clock=clock,
        session_factory=create_session_factory(engine),
        rate_limiter=RedisRateLimiter(redis),
        payments=payments,
        cdek=cdek,
        storage=storage,
        telegram=telegram,
        mailer=mailer,
        kicker=ArqKicker(settings.redis_url),
    )


def build_test_container(
    settings: Settings, session_factory: async_sessionmaker[AsyncSession], *, now: datetime
) -> Container:
    clock = FrozenClock(now)
    return Container(
        settings=settings,
        clock=clock,
        session_factory=session_factory,
        rate_limiter=MemoryRateLimiter(clock),
        payments=FakePaymentGateway(clock, settings.public_base_url),
        cdek=FakeCdekGateway(),
        storage=LocalStorage(settings.media_local_dir, settings.media_public_url),
        telegram=FakeTelegramSender(),
        mailer=FakeMailer(),
    )
