# Запуск на сервере

Всё работает на одном VPS в России (152-ФЗ): PostgreSQL, Redis, API, фоновые задачи, сайт, Caddy (HTTPS),
резервные копии. Схема — `infra/docker-compose.yml`.

## 1. Сервер

- Ubuntu 24.04, 2 vCPU, 4 ГБ памяти, 50 ГБ SSD; провайдер с дата-центром в РФ.
- DNS: A-записи `nsbtea.ru` и `www.nsbtea.ru` (для тестового сервера — `staging.nsbtea.ru`) → IP сервера.

```sh
# под root на новом сервере
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
adduser --disabled-password deploy && usermod -aG docker deploy
```

Вход по SSH — только по ключу (`PasswordAuthentication no` в `/etc/ssh/sshd_config`).

## 2. Код и настройки

```sh
su - deploy
# если репозиторий закрытый: ssh-keygen -t ed25519, публичный ключ — в GitHub → Settings → Deploy keys (только чтение)
git clone git@github.com:stepankovner/nsbtea.git && cd nsbtea
cp .env.example .env && chmod 600 .env
nano .env
```

Обязательно заполнить:

| Переменная | Тестовый сервер | Боевой сервер |
|---|---|---|
| `ENVIRONMENT` | `staging` | `production` |
| `SECRET_KEY` | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` | так же, другой |
| `PUBLIC_BASE_URL` | `https://staging.nsbtea.ru` | `https://nsbtea.ru` |
| `SITE_ADDRESS` | `staging.nsbtea.ru` | `nsbtea.ru, www.nsbtea.ru` |
| `POSTGRES_PASSWORD` | случайная строка | случайная строка |
| `TOCHKA_MODE`, `TOCHKA_JWT`, `TOCHKA_CUSTOMER_CODE`, `TOCHKA_CLIENT_ID` | `sandbox` или `fake` | `production` + ключи |
| `CDEK_MODE`, `CDEK_CLIENT_ID`, `CDEK_CLIENT_SECRET` | `sandbox` или `fake` | `production` + ключи |
| `EMAIL_MODE`, `SMTP_*` | `console` или `smtp` | `smtp` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | по желанию | да |
| `BACKUP_S3_*`, `BACKUP_ALERT_CHAT_ID` | по желанию | да |

В боевом режиме сайт не запустится, пока чего-то не хватает: шаг `migrate` выведет список
(`docker compose logs migrate`), API и воркер не стартуют.

## 3. Первый запуск

```sh
cd infra
docker compose --env-file ../.env up -d --build
docker compose --env-file ../.env exec api python -m app.cli seed            # категории, блоки главной, служебные страницы
docker compose --env-file ../.env exec api python -m app.cli create-owner --email shop@nsbtea.ru --name "Имя Фамилия"
docker compose --env-file ../.env exec api python -m app.cli set-telegram-webhook     # если задан бот
docker compose --env-file ../.env exec api python -m app.cli register-tochka-webhook  # если заданы ключи Точки
./smoke-test.sh https://staging.nsbtea.ru     # или https://nsbtea.ru
```

Только для тестового сервера: `exec api python -m app.cli demo-data` — 12 демо-чаёв, чтобы посмотреть сайт.

Дальше владелец входит в `/admin`, привязывает Telegram в «Мой профиль» (вход станет с кодом из бота)
и проходит чек-лист запуска на главном экране админки.

## 4. Обновление

```sh
cd ~/nsbtea && git pull
cd infra && docker compose --env-file ../.env up -d --build
./smoke-test.sh https://nsbtea.ru
```

Миграции БД применяются сами (шаг `migrate`) до старта новой версии API.
Если что-то пошло не так: `git checkout <предыдущий коммит>` и та же команда `up -d --build`.

## 5. Резервные копии

- Каждый день в 03:00 МСК — копия БД в томе `backups` (хранится `BACKUP_KEEP_DAYS` дней, по умолчанию 14).
- Если задан `BACKUP_S3_BUCKET` — копия БД и все картинки уходят ещё и в S3 (отдельный бакет в РФ).
- Копия не создалась — сообщение в Telegram на `BACKUP_ALERT_CHAT_ID`.
- Сделать копию вручную: `docker compose --env-file ../.env exec backup backup.sh`.

Восстановление (текущие данные будут заменены):

```sh
docker compose --env-file ../.env exec backup ls -lt /backups | head
docker compose --env-file ../.env stop api worker
docker compose --env-file ../.env exec backup restore.sh /backups/nsbtea_2026-11-20_0000.dump
docker compose --env-file ../.env start api worker
```

Проверку восстановления делать раз в месяц на тестовом сервере (ROADMAP, M6).

## 6. Полезное

```sh
docker compose --env-file ../.env ps                     # что запущено
docker compose --env-file ../.env logs --tail 100 api    # логи (api, worker, web, caddy, backup)
docker compose --env-file ../.env exec api python -m app.cli reset-password --email shop@nsbtea.ru
docker compose --env-file ../.env exec api python -m app.cli check-config
```
