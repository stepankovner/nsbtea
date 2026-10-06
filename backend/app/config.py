"""Настройки приложения из переменных окружения (см. .env.example).

Секреты — только здесь, из окружения. Настройки, которые меняет владелец
(проценты, цены доставки, реквизиты), живут в БД — см. services/settings.py.
"""

from enum import StrEnum
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEV = "dev"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class IntegrationMode(StrEnum):
    FAKE = "fake"  # локальная заглушка: без сети, для разработки и тестов
    SANDBOX = "sandbox"  # тестовый контур провайдера
    PRODUCTION = "production"


class MediaStorage(StrEnum):
    LOCAL = "local"
    S3 = "s3"


class EmailMode(StrEnum):
    CONSOLE = "console"  # письма пишутся в лог (разработка)
    SMTP = "smtp"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Environment = Environment.DEV
    secret_key: SecretStr = SecretStr("dev-secret-change-me-dev-secret-change-me")
    public_base_url: str = "http://localhost:3000"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "postgresql+asyncpg://nsb:nsb@localhost:5432/nsbtea"
    database_echo: bool = False
    redis_url: str = "redis://localhost:6379/0"

    # Файлы
    media_storage: MediaStorage = MediaStorage.LOCAL
    media_local_dir: str = "media"
    media_public_url: str = "/media"
    s3_endpoint_url: str | None = None
    s3_region: str = "ru-central1"
    s3_bucket: str | None = None
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None
    max_upload_mb: int = 15

    # Точка Банк — интернет-эквайринг
    tochka_mode: IntegrationMode = IntegrationMode.FAKE
    tochka_jwt: SecretStr | None = None
    tochka_customer_code: str | None = None
    tochka_merchant_id: str | None = None
    tochka_client_id: str | None = None
    tochka_webhook_public_key_url: str = "https://enter.tochka.com/doc/openapi/static/keys/public"
    payment_ttl_minutes: int = 30

    # СДЭК
    cdek_mode: IntegrationMode = IntegrationMode.FAKE
    cdek_client_id: str | None = None
    cdek_client_secret: SecretStr | None = None

    # Telegram
    telegram_bot_token: SecretStr | None = None
    telegram_bot_username: str | None = None
    telegram_webhook_secret: SecretStr | None = None

    # Почта
    email_mode: EmailMode = EmailMode.CONSOLE
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "НСБ Чай <shop@nsbtea.ru>"
    smtp_starttls: bool = True

    sentry_dsn: str | None = None

    # Сессии
    admin_session_days: int = 14
    customer_session_days: int = 180

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION

    @property
    def secure_cookies(self) -> bool:
        return self.public_base_url.startswith("https://")


@lru_cache
def get_settings() -> Settings:
    return Settings()
