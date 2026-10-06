"""Команды для сервера: `python -m app.cli <команда>`.

create-owner        — создать владельца (первый вход в админку)
reset-password      — сменить пароль сотруднику (если забыл и Telegram не привязан)
seed                — начальные категории, блоки главной и служебные страницы
set-telegram-webhook — зарегистрировать вебхук бота
register-tochka-webhook — подписаться на вебхук оплаты в Точке
export-openapi      — схема API в JSON (из неё генерируются типы фронтенда)
demo-data           — демо-товары для тестового сервера (не для боевого)
"""

import argparse
import asyncio
import getpass
import json
import sys

from sqlalchemy import select

from app.config import get_settings
from app.container import build_container
from app.core.security import hash_password
from app.models import AdminUser
from app.services.admin_auth import create_owner, validate_password
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


async def _register_tochka_webhook() -> None:
    import httpx

    settings = get_settings()
    if not settings.tochka_jwt or not settings.tochka_client_id:
        sys.exit("Задайте TOCHKA_JWT и TOCHKA_CLIENT_ID")
    url = f"{settings.public_base_url.rstrip('/')}/api/webhooks/tochka"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.put(
            f"https://enter.tochka.com/uapi/webhook/v1.0/{settings.tochka_client_id}",
            headers={"Authorization": f"Bearer {settings.tochka_jwt.get_secret_value()}"},
            json={"webhooksList": ["acquiringInternetPayment"], "url": url},
        )
    print(response.status_code, response.text)


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


def _export_openapi() -> None:
    from app.config import Settings
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
    sub.add_parser("export-openapi", help="схема API (JSON) в stdout")
    sub.add_parser("demo-data", help="демо-товары (только не на боевом сервере)")
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
    elif args.command == "export-openapi":
        _export_openapi()
    elif args.command == "demo-data":
        asyncio.run(_demo_data())


if __name__ == "__main__":
    main()
