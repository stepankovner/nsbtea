#!/bin/sh
# Проверка после запуска или обновления сайта: всё ли живо и связано между собой.
# Запуск на сервере из папки infra:  ./smoke-test.sh https://nsbtea.ru
# Локально (самоподписанный сертификат Caddy):  ./smoke-test.sh https://localhost
set -eu

BASE="${1:-https://localhost}"
BASE="${BASE%/}"
COMPOSE="docker compose --env-file ../.env"
CURL="curl -fsS --max-time 15"
case "$BASE" in
  https://localhost*) CURL="$CURL -k" ;;
esac

failed=0
ok() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; failed=1; }

echo "Проверяем $BASE"

# 1. Все сервисы запущены
for service in postgres redis api worker web caddy backup; do
  status=$($COMPOSE ps --format '{{.Service}} {{.State}} {{.Health}}' "$service" 2>/dev/null || true)
  case "$status" in
    *"running healthy"* | "$service running ") ok "сервис $service работает" ;;
    *) bad "сервис $service: ${status:-не запущен}" ;;
  esac
done

# 2. API и база данных отвечают через HTTPS
if $CURL "$BASE/api/health" | grep -q '"database":"ok"'; then ok "API и база данных"; else bad "API или база данных не отвечают"; fi

# 3. Сайт открывается
if $CURL -o /dev/null "$BASE/"; then ok "главная страница"; else bad "главная страница не открывается"; fi
if [ "$($CURL "$BASE/healthz" || true)" = "ok" ]; then ok "сайт (Next.js)"; else bad "сайт (Next.js) не отвечает"; fi

# 4. robots.txt указывает на этот адрес (тестовый сервер закрыт от поисковиков, боевой — открыт)
if $CURL "$BASE/robots.txt" | grep -q "Sitemap: $BASE/sitemap.xml"; then ok "robots.txt"; else bad "robots.txt указывает не на $BASE"; fi

# 5. Картинки: API и воркер могут сохранять файлы, Caddy их отдаёт
probe="smoke-$(date +%s).txt"
if $COMPOSE exec -T api sh -c "echo ok > /app/media/$probe" 2>/dev/null; then
  ok "API может сохранять картинки"
  if [ "$($CURL "$BASE/media/$probe" || true)" = "ok" ]; then ok "картинки открываются на сайте"; else bad "Caddy не отдаёт /media"; fi
  $COMPOSE exec -T api rm -f "/app/media/$probe" || true
else
  bad "API не может записать в папку картинок (права на том media)"
fi
if $COMPOSE exec -T worker sh -c "test -w /app/media" 2>/dev/null; then ok "воркер может сохранять файлы"; else bad "воркер не может записать в папку картинок"; fi

# 6. Фоновые задачи (письма, автоотмена неоплаченных, баллы) — воркер на связи с Redis
if $COMPOSE exec -T worker arq --check app.workers.main.WorkerSettings >/dev/null 2>&1; then ok "фоновые задачи"; else bad "воркер фоновых задач не отвечает"; fi

# 7. Резервная копия создаётся, читается и закрыта от посторонних (в ней персональные данные)
if out=$($COMPOSE exec -T backup backup.sh 2>&1); then
  file=$(echo "$out" | sed -n 's/.*старт → \(\S*\).*/\1/p' | tail -1)
  mode=$($COMPOSE exec -T backup stat -c %a "$file" 2>/dev/null || echo "?")
  if [ "$mode" = "600" ]; then ok "резервная копия: $file"; else bad "резервная копия доступна посторонним (права $mode, нужно 600)"; fi
else
  bad "резервная копия не создаётся: $(echo "$out" | tail -3)"
fi

if [ "$failed" -ne 0 ]; then
  echo "Есть проблемы — см. ✗ выше. Логи: $COMPOSE logs --tail 100 <сервис>"
  exit 1
fi
echo "Всё работает."
