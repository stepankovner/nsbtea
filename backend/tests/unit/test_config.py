"""Боевой запуск без обязательных настроек должен падать сразу и понятно, а не на первом заказе."""

import pytest
from pydantic import ValidationError

from app.config import (
    Settings,
    ensure_production_ready,
    production_notes,
    production_problems,
)


def _prod(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "production",
        "secret_key": "s" * 48,
        "public_base_url": "https://nsbtea.ru",
        "cors_origins": ["https://nsbtea.ru"],
        "tochka_mode": "production",
        "tochka_jwt": "jwt-token",
        "tochka_customer_code": "300000092",
        "tochka_client_id": "client-id",
        "cdek_mode": "production",
        "cdek_client_id": "cdek-id",
        "cdek_client_secret": "cdek-secret",
        "email_mode": "smtp",
        "smtp_host": "smtp.example.ru",
        "smtp_user": "shop@nsbtea.ru",
        "smtp_password": "smtp-password",
        "telegram_bot_token": "123:abc",
        "telegram_webhook_secret": "w" * 32,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def test_complete_production_settings_have_no_problems() -> None:
    assert production_problems(_prod()) == []
    ensure_production_ready(_prod())  # не бросает


def test_dev_settings_are_not_checked() -> None:
    settings = Settings(_env_file=None, environment="dev")
    assert production_problems(settings) == []
    ensure_production_ready(settings)


@pytest.mark.parametrize(
    ("overrides", "needle"),
    [
        ({"secret_key": "dev-secret-change-me-dev-secret-change-me"}, "SECRET_KEY"),
        ({"secret_key": "short"}, "SECRET_KEY"),
        ({"public_base_url": "http://nsbtea.ru"}, "PUBLIC_BASE_URL"),
        ({"tochka_mode": "fake"}, "TOCHKA_MODE"),
        ({"tochka_mode": "sandbox"}, "TOCHKA_MODE"),
        ({"tochka_jwt": None}, "TOCHKA_JWT"),
        ({"tochka_customer_code": None}, "TOCHKA_CUSTOMER_CODE"),
        ({"cdek_mode": "fake"}, "CDEK_MODE"),
        ({"cdek_client_secret": None}, "CDEK_CLIENT_SECRET"),
        ({"email_mode": "console"}, "EMAIL_MODE"),
        ({"smtp_host": None}, "SMTP_HOST"),
        ({"media_storage": "s3", "s3_bucket": None}, "S3_BUCKET"),
        ({"telegram_bot_token": "123:abc", "telegram_webhook_secret": None}, "TELEGRAM"),
    ],
)
def test_each_missing_production_setting_is_named(
    overrides: dict[str, object], needle: str
) -> None:
    problems = production_problems(_prod(**overrides))
    assert any(needle in problem for problem in problems), problems


def test_ensure_production_ready_lists_all_problems_at_once() -> None:
    settings = _prod(tochka_mode="fake", cdek_mode="fake")
    with pytest.raises(RuntimeError) as exc:
        ensure_production_ready(settings)
    assert "TOCHKA_MODE" in str(exc.value)
    assert "CDEK_MODE" in str(exc.value)


def test_telegram_is_optional_but_needs_secret_when_enabled() -> None:
    assert production_problems(_prod(telegram_bot_token=None, telegram_webhook_secret=None)) == []


def test_payments_and_cdek_can_be_off_until_contracts_are_signed() -> None:
    """Банк проверяет живой сайт до одобрения эквайринга, а ключи выдаёт после:
    боевой сайт запускается с TOCHKA_MODE=off / CDEK_MODE=off, ключи тогда не нужны."""
    settings = _prod(
        tochka_mode="off",
        tochka_jwt=None,
        tochka_customer_code=None,
        cdek_mode="off",
        cdek_client_id=None,
        cdek_client_secret=None,
    )
    assert production_problems(settings) == []


def test_notes_say_what_buyers_cannot_use_yet() -> None:
    assert production_notes(_prod()) == []
    notes = production_notes(_prod(tochka_mode="off", cdek_mode="off"))
    assert any("Онлайн-оплата" in note for note in notes), notes
    assert any("СДЭК" in note for note in notes), notes


def test_payment_modes_default_to_card_and_sbp() -> None:
    assert Settings(_env_file=None).tochka_payment_modes == ["card", "sbp"]


def test_payment_modes_from_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOCHKA_PAYMENT_MODES", "sbp, card,tinkoff")
    assert Settings(_env_file=None).tochka_payment_modes == ["sbp", "card", "tinkoff"]


def test_unknown_payment_mode_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOCHKA_PAYMENT_MODES", "card,cash")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
