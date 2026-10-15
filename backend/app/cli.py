"""Команды для сервера: `python -m app.cli <команда>`.

create-owner        — создать владельца (первый вход в админку)
reset-password      — сменить пароль сотруднику (если забыл и Telegram не привязан)
seed                — начальные категории, блоки главной и служебные страницы
set-telegram-webhook — зарегистрировать вебхук бота
register-tochka-webhook — подписаться на вебхук оплаты в Точке
tochka-info         — проверить подключение эквайринга: код клиента, торговая точка, чеки
export-openapi      — схема API в JSON (из неё генерируются типы фронтенда)
demo-data           — демо-товары для тестового сервера (не для боевого)
check-config        — проверить настройки .env (запускается перед миграциями в Docker Compose)
clear-test-data     — удалить пробные заказы и покупателей перед запуском (только тестовый сервер)
"""

import argparse
import asyncio
import getpass
import json
import sys

from sqlalchemy import select

from app.config import (
    IntegrationMode,
    Settings,
    get_settings,
    production_notes,
    production_problems,
)
from app.container import build_container
from app.core.security import hash_password
from app.integrations.payments import PaymentGatewayError
from app.integrations.tochka import PRODUCTION_URL, TochkaGateway
from app.integrations.tochka_setup import check_setup
from app.models import AdminUser
from app.services.admin_auth import create_owner, validate_password
from app.services.launch_cleanup import clear_test_data
from app.services.seed import seed_categories, seed_content, seed_demo_catalog


def _password(prompt: str) -> str:
    first = getpass.getpass(prompt)
    second = getpass.getpass("Повторите пароль: ")
    if first != second:
        sys.exit("Пароли не совпадают")
    return first


async def _create_owner(email: str, name: str) -> None:
    container = build_container(get_settings())
    password = _password("Пароль владельца (не короче 10 символов): ")
    async with container.session_factory() as db:
        user = await create_owner(db, email=email, name=name, password=password)
        await db.commit()
        print(f"Готово: владелец {user.name} <{user.email}> создан.")


async def _reset_password(email: str) -> None:
    container = build_container(get_settings())
    password = _password("Новый пароль: ")
    validate_password(password)
    async with container.session_factory() as db:
        user = await db.scalar(select(AdminUser).where(AdminUser.email == email.strip().lower()))
        if user is None:
            sys.exit("Сотрудник с такой почтой не найден")
        user.password_hash = hash_password(password)
        await db.commit()
        print("Пароль изменён.")


async def _seed() -> None:
    container = build_container(get_settings())
    async with container.session_factory() as db:
        await seed_categories(db)
        await seed_content(db)
        await db.commit()
    print("Начальное наполнение готово (уже существующее не изменялось).")


async def _set_telegram_webhook() -> None:
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_webhook_secret:
        sys.exit("Задайте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET")
    from aiogram import Bot

    bot = Bot(settings.telegram_bot_token.get_secret_value())
    url = f"{settings.public_base_url.rstrip('/')}/api/webhooks/telegram"
    await bot.set_webhook(
        url,
        secret_token=settings.telegram_webhook_secret.get_secret_value(),
        allowed_updates=["message"],
        drop_pending_updates=True,
    )
    me = await bot.get_me()
    await bot.session.close()
    print(f"Вебхук бота @{me.username} установлен: {url}")


def _tochka_client(settings: Settings) -> TochkaGateway:
    """Клиент для настройки: работает и до TOCHKA_MODE=production — нужен только ключ."""
    if settings.tochka_mode is IntegrationMode.SANDBOX:
        return TochkaGateway.from_settings(settings)
    if not settings.tochka_jwt:
        sys.exit("Задайте TOCHKA_JWT — ключ из интернет-банка Точки («Интеграции и API»).")
    return TochkaGateway(
        base_url=PRODUCTION_URL,
        token=settings.tochka_jwt.get_secret_value(),
        customer_code=settings.tochka_customer_code or "",
        merchant_id=settings.tochka_merchant_id,
        payment_modes=settings.tochka_payment_modes,
        public_key_url=settings.tochka_webhook_public_key_url,
    )


async def _register_tochka_webhook() -> None:
    settings = get_settings()
    if not settings.tochka_client_id:
        sys.exit("Задайте TOCHKA_CLIENT_ID — он рядом с ключом в «Интеграции и API».")
    url = f"{settings.public_base_url.rstrip('/')}/api/webhooks/tochka"
    try:
        await _tochka_client(settings).register_webhook(settings.tochka_client_id, url)
    except PaymentGatewayError as exc:
        sys.exit(
            f"Точка не подключила вебхук: {exc}\n"
            f"Сайт должен открываться по {url} (HTTPS, порт 443) — проверьте, что он запущен."
        )
    print(f"Вебхук оплаты подключён: {url}")


async def _tochka_info() -> None:
    settings = get_settings()
    client = _tochka_client(settings)
    try:
        customers = await client.list_customers()
    except PaymentGatewayError as exc:
        sys.exit(f"Точка не отдала список счетов: {exc}\nПроверьте TOCHKA_JWT и права ключа.")
    business = [str(c["customerCode"]) for c in customers if c.get("customerType") == "Business"]
    code = settings.tochka_customer_code or (business[0] if business else None)
    retailers: list[dict[str, object]] = []
    if code:
        try:
            retailers = await client.list_retailers(code)
        except PaymentGatewayError as exc:
            if "Retailer not found" not in str(exc):
                sys.exit(f"Точка не отдала торговые точки: {exc}")
    report = check_setup(customers, retailers, settings)
    print("\n".join(report.lines))
    for warning in report.warnings:
        print(f"Внимание: {warning}")
    for problem in report.problems:
        print(f"Нужно исправить: {problem}")
    if report.env:
        print("Впишите в .env:")
        for key, value in report.env.items():
            print(f"  {key}={value}")
    if report.problems:
        sys.exit(1)
    print("Всё готово: оплата на сайте заработает при TOCHKA_MODE=production.")


async def _demo_data() -> None:
    settings = get_settings()
    if settings.is_production:
        sys.exit("Демо-данные нельзя добавлять на боевой сервер")
    container = build_container(settings)
    async with container.session_factory() as db:
        await seed_categories(db)
        await seed_content(db)
        created = await seed_demo_catalog(db, container)
        await db.commit()
    print(f"Добавлено демо-товаров: {created}")


async def _clear_test_data(settings: Settings, keep_applications: bool) -> None:
    container = build_container(settings)
    async with container.session_factory() as db:
        report = await clear_test_data(db, container, keep_applications=keep_applications)
        await db.commit()
    print(
        f"Удалено: заказов {report.orders}, покупателей {report.customers}, "
        f"заявок {report.applications}."
    )
    for name, qty in report.restocked.items():
        print(f"Возвращено на склад: {name} +{qty}")


def _confirm_clear_test_data(settings: Settings, assume_yes: bool) -> None:
    if settings.is_production:
        sys.exit(
            "Очистка только для тестового сервера: на боевом она удалила бы настоящие заказы. "
            "Запустите её до переключения ENVIRONMENT=production."
        )
    if assume_yes:
        return
    print(
        "Будут удалены ВСЕ заказы, покупатели, баллы, корзины, письма в очереди и заявки.\n"
        "Товары, тексты, настройки, сотрудники, акции и поставки останутся, остатки вернутся.\n"
        "Сначала сделайте резервную копию: docker compose exec backup backup.sh"
    )
    if input("Чтобы продолжить, введите УДАЛИТЬ: ").strip() != "УДАЛИТЬ":
        sys.exit("Отменено — ничего не удалено.")


def _check_config() -> None:
    settings = get_settings()
    problems = production_problems(settings)
    if problems:
        lines = "\n".join(f"- {problem}" for problem in problems)
        print(f"Сайт не запущен: не хватает настроек в .env:\n{lines}", file=sys.stderr)
        sys.exit(1)
    print(f"Настройки в порядке (режим: {settings.environment.value}).")
    for note in production_notes(settings):
        print(note)


def _export_openapi() -> None:
    from app.main import create_app

    # схема не зависит от окружения; заглушки — чтобы не требовались ключи и сеть
    container = build_container(Settings(_env_file=None))
    spec = create_app(container).openapi()
    sys.stdout.write(json.dumps(spec, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Команды НСБ Чай")
    sub = parser.add_subparsers(dest="command", required=True)
    owner = sub.add_parser("create-owner", help="создать владельца")
    owner.add_argument("--email", required=True)
    owner.add_argument("--name", required=True)
    reset = sub.add_parser("reset-password", help="сменить пароль сотрудника")
    reset.add_argument("--email", required=True)
    sub.add_parser("seed", help="начальное наполнение")
    sub.add_parser("set-telegram-webhook", help="вебхук Telegram-бота")
    sub.add_parser("register-tochka-webhook", help="вебхук оплаты Точки")
    sub.add_parser("tochka-info", help="проверить подключение эквайринга Точки")
    sub.add_parser("export-openapi", help="схема API (JSON) в stdout")
    sub.add_parser("demo-data", help="демо-товары (только не на боевом сервере)")
    sub.add_parser("check-config", help="проверить настройки .env перед запуском")
    clear = sub.add_parser(
        "clear-test-data", help="удалить пробные заказы и покупателей перед запуском"
    )
    clear.add_argument("--yes", action="store_true", help="не спрашивать подтверждение")
    clear.add_argument("--keep-applications", action="store_true", help="заявки не удалять")
    args = parser.parse_args()

    if args.command == "create-owner":
        asyncio.run(_create_owner(args.email, args.name))
    elif args.command == "reset-password":
        asyncio.run(_reset_password(args.email))
    elif args.command == "seed":
        asyncio.run(_seed())
    elif args.command == "set-telegram-webhook":
        asyncio.run(_set_telegram_webhook())
    elif args.command == "register-tochka-webhook":
        asyncio.run(_register_tochka_webhook())
    elif args.command == "tochka-info":
        asyncio.run(_tochka_info())
    elif args.command == "export-openapi":
        _export_openapi()
    elif args.command == "demo-data":
        asyncio.run(_demo_data())
    elif args.command == "check-config":
        _check_config()
    elif args.command == "clear-test-data":
        settings = get_settings()
        _confirm_clear_test_data(settings, args.yes)
        asyncio.run(_clear_test_data(settings, args.keep_applications))


if __name__ == "__main__":
    main()
