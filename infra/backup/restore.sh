#!/bin/sh
# Восстановление БД из копии. ВНИМАНИЕ: текущие данные базы будут заменены.
# Использование (из папки infra):
#   docker compose stop api worker
#   docker compose exec backup restore.sh /backups/nsbtea_2026-11-20_0000.dump
#   docker compose start api worker
set -eu
FILE="${1:?укажите файл копии, например /backups/nsbtea_2026-11-20_0000.dump}"
[ -f "$FILE" ] || { echo "Файл не найден: $FILE"; exit 1; }
echo "Восстанавливаю ${PGDATABASE} из ${FILE}…"
pg_restore --clean --if-exists --no-owner --dbname="${PGDATABASE}" "$FILE"
echo "Готово."
