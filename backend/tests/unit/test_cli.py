"""`python -m app.cli check-config` — проверка настроек до миграций и запуска (Docker Compose).

Если в боевом режиме чего-то не хватает, команда должна завершиться с ошибкой и списком
проблем — тогда API и воркер не стартуют, а `docker compose up` сразу показывает причину
(вместо бесконечных перезапусков процессов сервера).
"""

import sys

import pytest

from app import cli
from tests.unit.test_config import _prod


def _run(monkeypatch: pytest.MonkeyPatch, *args: str) -> None:
    monkeypatch.setattr(sys, "argv", ["python -m app.cli", *args])
    cli.main()


def test_check_config_fails_and_lists_every_problem(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = _prod(tochka_mode="fake", email_mode="console")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "check-config")
    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "TOCHKA_MODE" in err
    assert "EMAIL_MODE" in err


def test_check_config_passes_for_complete_production_settings(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "get_settings", _prod)
    _run(monkeypatch, "check-config")
    assert "Настройки в порядке" in capsys.readouterr().out


def test_check_config_passes_on_dev_and_staging(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = _prod(environment="staging", tochka_mode="fake")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    _run(monkeypatch, "check-config")
    assert "Настройки в порядке" in capsys.readouterr().out


def test_clear_test_data_refuses_on_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """Очистка — только на тестовом сервере: на боевом удалила бы настоящие заказы."""
    monkeypatch.setattr(cli, "get_settings", _prod)
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "clear-test-data", "--yes")
    assert "боевом" in str(exc.value.code)


def test_clear_test_data_asks_for_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _prod(environment="staging")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    monkeypatch.setattr("builtins.input", lambda _prompt="": "нет")
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "clear-test-data")
    assert "Отменено" in str(exc.value.code)


def test_check_config_mentions_what_is_switched_off(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = _prod(tochka_mode="off", tochka_jwt=None, tochka_customer_code=None)
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    _run(monkeypatch, "check-config")
    out = capsys.readouterr().out
    assert "Настройки в порядке" in out
    assert "Онлайн-оплата" in out


class FakeTochka:
    def __init__(self, retailers: list[dict[str, object]] | Exception) -> None:
        self._retailers = retailers
        self.webhook: tuple[str, str] | None = None

    async def list_customers(self) -> list[dict[str, object]]:
        return [{"customerCode": "300000092", "customerType": "Business", "shortName": "ИП Б."}]

    async def list_retailers(self, customer_code: str) -> list[dict[str, object]]:
        assert customer_code == "300000092"
        if isinstance(self._retailers, Exception):
            raise self._retailers
        return self._retailers

    async def register_webhook(self, client_id: str, url: str) -> None:
        self.webhook = (client_id, url)


READY_RETAILER: dict[str, object] = {
    "status": "REG",
    "isActive": True,
    "name": "НСБ ЧАЙ",
    "url": "https://nsbtea.ru",
    "merchantId": "200000000001111",
    "paymentModes": ["card", "sbp"],
    "cashbox": "start",
}


def test_tochka_info_prints_what_to_put_into_env(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = _prod(tochka_mode="off", tochka_customer_code=None, tochka_merchant_id=None)
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    monkeypatch.setattr(cli, "_tochka_client", lambda _: FakeTochka([READY_RETAILER]))
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "tochka-info")
    assert exc.value.code == 1  # пока код клиента не вписан — оплата не заработает
    out = capsys.readouterr().out
    assert "TOCHKA_CUSTOMER_CODE=300000092" in out
    assert "TOCHKA_MERCHANT_ID=200000000001111" in out


def test_tochka_info_before_approval(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.integrations.payments import PaymentGatewayError

    monkeypatch.setattr(cli, "get_settings", lambda: _prod(tochka_customer_code="300000092"))
    monkeypatch.setattr(
        cli,
        "_tochka_client",
        lambda _: FakeTochka(PaymentGatewayError("HTTP 404: Not Found Retailer not found")),
    )
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "tochka-info")
    assert exc.value.code == 1
    assert "заявка" in capsys.readouterr().out


def test_tochka_info_all_good(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = _prod(tochka_customer_code="300000092", tochka_merchant_id="200000000001111")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    monkeypatch.setattr(cli, "_tochka_client", lambda _: FakeTochka([READY_RETAILER]))
    _run(monkeypatch, "tochka-info")
    assert "Всё готово" in capsys.readouterr().out


def test_register_tochka_webhook_uses_site_address(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    fake = FakeTochka([])
    monkeypatch.setattr(cli, "get_settings", _prod)
    monkeypatch.setattr(cli, "_tochka_client", lambda _: fake)
    _run(monkeypatch, "register-tochka-webhook")
    assert fake.webhook == ("client-id", "https://nsbtea.ru/api/webhooks/tochka")
    assert "подключён" in capsys.readouterr().out
