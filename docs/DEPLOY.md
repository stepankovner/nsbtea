# Запуск на сервере

Всё работает на одном VPS в России (152-ФЗ): PostgreSQL, Redis, API, фоновые задачи, сайт, Caddy (HTTPS),
резервные копии. Схема — `infra/docker-compose.yml`.

## 1. Сервер

- Ubuntu 24.04, 2 vCPU, 4 ГБ памяти, 50 ГБ SSD; провайдер с дата-центром в РФ.
  Сейчас — AdminVPS Micro (Москва): 2 × 3,6 ГГц, 4 ГБ, 60 ГБ NVMe; аккаунт на ИП, личный кабинет my.adminvps.ru.
- DNS: A-записи `nsbtea.ru` и `www.nsbtea.ru` (для тестового сервера — `staging.nsbtea.ru`) → IP сервера;
  `nsbtea.online` и `www.nsbtea.online` → тот же IP (сайт переводит их на nsbtea.ru, `REDIRECT_ADDRESS`).

Первый вход. AdminVPS создаёт сервер с паролем root (письмо и «Серверы» → сервер в личном кабинете);
пароль никому не пересылать. Со своего компьютера один раз положить на сервер публичный SSH-ключ:

```sh
ssh-copy-id root@IP                     # macOS и Linux; спросит пароль root один раз
# Windows (PowerShell):
# type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh root@IP                             # теперь без пароля
```

```sh
# под root на новом сервере
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
# вход только по ключу; файл в sshd_config.d, иначе его может перекрыть 50-cloud-init.conf
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-nsbtea.conf
sshd -t && systemctl reload ssh
timedatectl | grep synchronized          # должно быть «yes»: от точного времени зависят подписи Точки
```

Перед тем как закрыть окно, проверьте вход по ключу во втором окне (`ssh deploy@IP`). Затем смените
пароль root в личном кабинете («Серверы» → сервер → «Доступ» → «Смена root пароля»): тот, что пришёл
письмом, больше нигде не нужен. Если ключ потерян — через поддержку AdminVPS (тикет в личном кабинете).

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
| `REDIRECT_ADDRESS` | пусто | `nsbtea.online, www.nsbtea.online` |
| `POSTGRES_PASSWORD` | случайная строка | случайная строка |
| `TOCHKA_MODE`, `TOCHKA_JWT`, `TOCHKA_CUSTOMER_CODE`, `TOCHKA_MERCHANT_ID`, `TOCHKA_CLIENT_ID` | `sandbox` или `fake` | `off` до одобрения эквайринга, затем `production` + ключи (`docs/ACQUIRING.md`) |
| `CDEK_MODE`, `CDEK_CLIENT_ID`, `CDEK_CLIENT_SECRET` | `sandbox` или `fake` | `off` до договора, затем `production` + ключи |
| `EMAIL_MODE`, `SMTP_*` | `console` или `smtp` | `smtp` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | по желанию | да |
| `BACKUP_S3_*`, `BACKUP_ALERT_CHAT_ID` | по желанию | да |

**Почта.** Письма сайта (коды входа, статусы заказов) — через почтовый сервис Selectel: аккаунт ИП там
уже есть, первые 1 000 писем в месяц бесплатно. У AdminVPS в России исходящие SMTP-порты открыты
(закрыты только в части зарубежных локаций), так что подойдёт и SMTP Яндекс 360; на Selectel VDS порты
465 и 587 закрыты навсегда. Почтовый сервис Selectel: `SMTP_HOST=smtp.mail.selcloud.ru`, `SMTP_PORT=1126`,
`SMTP_STARTTLS=true`, логин и пароль — в панели Selectel на вкладке ресурса почтового сервиса. В DNS домена —
запись подтверждения, DKIM (`selcloud._domainkey`), DMARC и `include:spf.mail.selcloud.ru` в SPF
(SPF-запись у домена одна: если почтовый ящик на Яндекс 360, в ней оба `include`).
Инструкция: https://docs.selectel.ru/email-service/connect-email-service/

В боевом режиме сайт не запустится, пока чего-то не хватает: шаг `migrate` выведет список
(`docker compose logs migrate`), API и воркер не стартуют. `off` — честное «ещё не подключено»: ключи не
нужны, покупатель видит, что онлайн-оплата подключается (СДЭК скрыт). Так сайт открывают на nsbtea.ru,
пока банк проверяет его по заявке на эквайринг: `fake` и `sandbox` на боевом сайте запрещены.

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

## 4. Запуск: с тестового сервера на боевой

Каталог, тексты и настройки владелец заполняет на тестовом сервере — они переезжают вместе с базой.

```sh
cd ~/nsbtea/infra
docker compose --env-file ../.env exec backup backup.sh                      # копия на всякий случай
docker compose --env-file ../.env exec api python -m app.cli clear-test-data # пробные заказы, покупатели, баллы, письма
```

Команда спросит подтверждение (ввести `УДАЛИТЬ`), работает только при `ENVIRONMENT=staging`.
Остатки вернутся так, будто пробных заказов не было. Демо-товары (если добавлялись) уберите в админке
в архив. Затем в `.env`: `ENVIRONMENT=production`, `PUBLIC_BASE_URL=https://nsbtea.ru`,
`SITE_ADDRESS=nsbtea.ru, www.nsbtea.ru`, боевые ключи Точки и СДЭК, `EMAIL_MODE=smtp`; DNS nsbtea.ru → сервер;
`up -d`, `set-telegram-webhook`, `./smoke-test.sh https://nsbtea.ru`.
Эквайринг ещё не одобрен — `TOCHKA_MODE=off` и подаём заявку; после одобрения — шаги из
`docs/ACQUIRING.md` (раздел 4): `tochka-info`, `TOCHKA_MODE=production`, `register-tochka-webhook`,
настоящий платёж и возврат (ROADMAP, M6).

## 5. Обновление

```sh
cd ~/nsbtea && git pull
cd infra && docker compose --env-file ../.env up -d --build
./smoke-test.sh https://nsbtea.ru
```

Миграции БД применяются сами (шаг `migrate`) до старта новой версии API.
Если что-то пошло не так: `git checkout <предыдущий коммит>` и та же команда `up -d --build`.

## 6. Резервные копии

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

## 7. Полезное

```sh
docker compose --env-file ../.env ps                     # что запущено
docker compose --env-file ../.env logs --tail 100 api    # логи (api, worker, web, caddy, backup)
docker compose --env-file ../.env exec api python -m app.cli reset-password --email shop@nsbtea.ru
docker compose --env-file ../.env exec api python -m app.cli check-config
docker compose --env-file ../.env exec api python -m app.cli tochka-info   # эквайринг: что вписать в .env
```
