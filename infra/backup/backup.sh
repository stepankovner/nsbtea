#!/bin/sh
# Резервная копия БД: pg_dump в сжатом формате, хранение BACKUP_KEEP_DAYS дней.
# Если задан BACKUP_S3_BUCKET — копия уходит ещё и в S3 (отдельное хранилище, SPEC 13).
# Картинки (/media) копируются в S3 синхронизацией, если задан бакет.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y-%m-%d_%H%M)"
FILE="/backups/nsbtea_${STAMP}.dump"

alert() {
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${BACKUP_ALERT_CHAT_ID:-}" ]; then
    curl -fsS -m 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${BACKUP_ALERT_CHAT_ID}" \
      --data-urlencode "text=⚠️ НСБ Чай: резервная копия не создана: $1" >/dev/null || true
  fi
}

trap 'alert "ошибка на шаге резервного копирования"' EXIT

echo "[backup] $(date -u) старт → ${FILE}"
pg_dump --format=custom --no-owner --file="${FILE}.part"
mv "${FILE}.part" "${FILE}"
pg_restore --list "${FILE}" >/dev/null   # копия читается — не битая

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  S3_ARGS=""
  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then S3_ARGS="--endpoint-url ${BACKUP_S3_ENDPOINT}"; fi
  # shellcheck disable=SC2086
  aws s3 cp $S3_ARGS "${FILE}" "s3://${BACKUP_S3_BUCKET}/db/$(basename "${FILE}")"
  # shellcheck disable=SC2086
  aws s3 sync $S3_ARGS /media "s3://${BACKUP_S3_BUCKET}/media/" --only-show-errors
fi

find /backups -name 'nsbtea_*.dump' -mtime +"${KEEP_DAYS}" -delete
trap - EXIT
echo "[backup] $(date -u) готово: $(du -h "${FILE}" | cut -f1)"
