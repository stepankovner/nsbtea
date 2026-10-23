"""Клиент Telegram Bot API.

С российского сервера api.telegram.org может быть недоступен: тогда запросы идут через
промежуточный сервер (`TELEGRAM_API_URL`), а зависший запрос обрывается по таймауту
с понятной ошибкой, а не висит бесконечно.
"""

from app.integrations.messaging import TELEGRAM_TIMEOUT_SECONDS, make_bot

TOKEN = "123456:TEST"


def test_default_is_official_api() -> None:
    bot = make_bot(TOKEN, api_url=None)
    assert bot.session.api.api_url(TOKEN, "getMe") == f"https://api.telegram.org/bot{TOKEN}/getMe"


def test_requests_go_through_relay_server() -> None:
    bot = make_bot(TOKEN, api_url="https://tg.nsbtea.ru/")
    assert bot.session.api.api_url(TOKEN, "getMe") == f"https://tg.nsbtea.ru/bot{TOKEN}/getMe"
    assert (
        bot.session.api.file_url(TOKEN, "a/b.jpg")
        == f"https://tg.nsbtea.ru/file/bot{TOKEN}/a/b.jpg"
    )


def test_request_has_timeout() -> None:
    bot = make_bot(TOKEN, api_url=None)
    assert bot.session.timeout == TELEGRAM_TIMEOUT_SECONDS
    assert TELEGRAM_TIMEOUT_SECONDS <= 30
