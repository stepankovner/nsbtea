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
    monkeypatch.setattr(cli, "get_settings", lambda: _prod(tochka_mode="fake", email_mode="console"))
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, "check-config")
    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "TOCHKA_MODE" in err
    assert "EMAIL_MODE" in err


def test_check_config_passes_for_complete_production_settings(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "get_settings", lambda: _prod())
    _run(monkeypatch, "check-config")
    assert "Настройки в порядке" in capsys.readouterr().out


def test_check_config_passes_on_dev_and_staging(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "get_settings", lambda: _prod(environment="staging", tochka_mode="fake"))
    _run(monkeypatch, "check-config")
    assert "Настройки в порядке" in capsys.readouterr().out
