"""Воркер arq: `arq app.workers.main.WorkerSettings`.

Расписание (время — UTC, Москва = UTC+3):
- outbox — каждые 15 секунд (и сразу по «пинку» из запроса);
- автоотмена неоплаченных — каждую минуту;
- сверка оплат — каждые 5 минут;
- автозавершение отправленных — каждый час;
- напоминание о «чае недели» и сводка — понедельник 10:00 МСК (07:00 UTC);
- очистка устаревших данных — ежедневно в 03:30 МСК.
"""

import logging
from typing import Any

from arq import cron, func
from arq.connections import RedisSettings

from app.config import ensure_production_ready, get_settings
from app.container import Container, build_container
from app.logging_setup import configure_logging
from app.workers import jobs

logger = logging.getLogger(__name__)


def _container(ctx: dict[str, Any]) -> Container:
    container: Container = ctx["container"]
    return container


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging()
    settings = get_settings()
    ensure_production_ready(settings)
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment.value)
    ctx["container"] = build_container(settings)


async def deliver_outbox(ctx: dict[str, Any]) -> int:
    return await jobs.deliver_outbox(_container(ctx))


async def cancel_expired_orders(ctx: dict[str, Any]) -> int:
    return await jobs.cancel_expired_orders(_container(ctx))


async def reconcile_payments(ctx: dict[str, Any]) -> int:
    return await jobs.reconcile_payments(_container(ctx))


async def auto_complete_orders(ctx: dict[str, Any]) -> int:
    return await jobs.auto_complete_orders(_container(ctx))


async def monday_reports(ctx: dict[str, Any]) -> None:
    container = _container(ctx)
    await jobs.thursday_reminder(container)
    await jobs.weekly_summary(container)


async def cleanup(ctx: dict[str, Any]) -> dict[str, int]:
    return await jobs.cleanup(_container(ctx))


class WorkerSettings:
    # результат «пинка» не храним: иначе повторный пинок с тем же id игнорировался бы час
    functions = [func(deliver_outbox, keep_result=0)]  # noqa: RUF012
    cron_jobs = [  # noqa: RUF012
        cron(deliver_outbox, second={0, 15, 30, 45}, run_at_startup=True, unique=True),
        cron(cancel_expired_orders, second=5, unique=True),
        cron(reconcile_payments, minute=set(range(0, 60, 5)), second=20, unique=True),
        cron(auto_complete_orders, minute=10, second=0, unique=True),
        cron(monday_reports, weekday=0, hour=7, minute=0, second=0, unique=True),
        cron(cleanup, hour=0, minute=30, second=0, unique=True),
    ]
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 10
    health_check_interval = 60  # для `arq --check` в healthcheck контейнера
    job_timeout = 300
