# НСБ Чай — nsbtea.ru

Интернет-магазин китайского чая: витрина, корзина и оформление с оплатой через Точку и доставкой СДЭК/курьером,
бонусные баллы и акции, личный кабинет, админка для работы с телефона, Telegram-бот для уведомлений владельцу.

- Требования и правила: `CLAUDE.md`, `docs/SPEC.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`
- Решения по ходу работы: `docs/DECISIONS.md`
- Запуск на сервере: `docs/DEPLOY.md`

## Устройство

```
backend/    FastAPI + SQLAlchemy (async) + arq — API, бизнес-логика (domain/), фоновые задачи, бот
frontend/   Next.js (App Router): витрина app/(shop), админка app/admin
infra/      Docker Compose, Caddy, резервные копии, smoke-test.sh
```

## Разработка

Нужны: Python 3.12 и [uv](https://docs.astral.sh/uv/), Node.js 22 и pnpm 10, PostgreSQL 16, Redis.

```sh
# база для разработки и для тестов
createuser -s nsb && psql -c "alter user nsb password 'nsb'"
createdb -O nsb nsbtea && createdb -O nsb nsbtea_test

# backend: http://localhost:8000 (документация API — /api/docs)
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli seed
uv run python -m app.cli demo-data
uv run python -m app.cli create-owner --email owner@nsbtea.ru --name "Владелец"
uv run uvicorn app.main:app_factory --factory --reload
uv run arq app.workers.main.WorkerSettings          # фоновые задачи (отдельный терминал)

# frontend: http://localhost:3000, админка — /admin
cd frontend
pnpm install
pnpm dev
```

Без ключей всё работает на заглушках: оплата (`TOCHKA_MODE=fake`), доставка (`CDEK_MODE=fake`),
письма пишутся в лог воркера (`EMAIL_MODE=console`) — там же коды входа.

## Проверки (те же в CI)

```sh
cd backend  && uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app tests && uv run pytest
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Изменили API — обновите типы фронтенда: `cd frontend && pnpm gen:api` (CI проверяет, что они совпадают).

Сквозные тесты (Playwright: покупка, поставка, создание товара, все экраны на 375 и 1440 px) — против
запущенного сайта с `TOCHKA_MODE=fake`, данными `seed` + `demo-data` и владельцем без Telegram:

```sh
cd frontend
E2E_BASE_URL=https://localhost E2E_OWNER_EMAIL=owner@nsbtea.ru E2E_OWNER_PASSWORD=… pnpm e2e
```

В CI они идут против всего стека в Docker Compose; после запуска на сервере — `infra/smoke-test.sh`.

Порядок работы — сначала тесты, потом код: тесты коммитятся до реализации и должны падать,
реализация не подгоняет тесты.
