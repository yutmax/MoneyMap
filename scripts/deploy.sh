#!/usr/bin/env bash
#
# Разворачивает новую версию на сервере. Запускается из CI по SSH, но
# пригоден и для ручного запуска: `./deploy.sh ghcr.io/…/moneymap-api:abc123`.
#
# Логика целиком здесь, а не в YAML workflow: деплой — это то, что хочется
# прочитать целиком перед тем, как он тронет боевую базу, и то, что иногда
# приходится запускать руками, когда CI недоступен.
set -euo pipefail

IMAGE="${1:?Первым аргументом нужен тег образа API}"
APP_DIR="${APP_DIR:-/opt/moneymap}"
COMPOSE="docker compose -f compose.prod.yml"
KEEP_BACKUPS=10

cd "$APP_DIR"

# Предыдущий образ запоминается до того, как .env перепишется: это
# единственный способ вернуться, если новый не поднимется.
PREVIOUS_IMAGE="$(grep -E '^API_IMAGE=' .env 2>/dev/null | cut -d= -f2- || true)"

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

rollback() {
  if [ -z "$PREVIOUS_IMAGE" ]; then
    log "Откатываться некуда: это первый деплой. Контейнеры оставлены как есть."
    return
  fi
  log "Откат на $PREVIOUS_IMAGE"
  set_env API_IMAGE "$PREVIOUS_IMAGE"
  $COMPOSE up -d --no-build api caddy
}

# Правит ключ в .env на месте, не трогая остальные строки: файл содержит
# секреты, и переписывать его целиком из скрипта — лишний способ их потерять.
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

# ─────────────────────────────── бэкап ────────────────────────────────────

log "Бэкап базы"
mkdir -p backups
# Бэкап снимается до миграций и только если БД уже поднята: на первом
# деплое её ещё нет, и это не ошибка.
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx postgres; then
  STAMP="$(date -u +%Y%m%d-%H%M%S)"
  # shellcheck disable=SC2016
  $COMPOSE exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
    | gzip > "backups/${STAMP}.sql.gz"
  echo "  backups/${STAMP}.sql.gz ($(du -h "backups/${STAMP}.sql.gz" | cut -f1))"

  # Старые дампы убираются сразу: на диске 30 ГБ, и молча заполнить его
  # бэкапами — отдельный способ уронить сервис.
  ls -1t backups/*.sql.gz 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm --
else
  echo "  Postgres ещё не запущен — первый деплой, бэкапить нечего."
fi

# ──────────────────────────── новая версия ────────────────────────────────

log "Загрузка образа $IMAGE"
docker pull "$IMAGE"
set_env API_IMAGE "$IMAGE"

log "Postgres"
# Ждать готовности здесь не нужно и нечем: `docker compose wait` ждёт
# ОСТАНОВКИ контейнера, а не его здоровья, и на работающем Postgres висит
# вечно. Готовность обеспечивает depends_on: service_healthy — и migrate,
# и api стартуют только после healthcheck'а базы.
$COMPOSE up -d --no-build postgres

log "Миграции"
# Отдельным шагом, до старта нового api (§10.2): в стартовом хендлере
# несколько реплик устроили бы гонку за одну и ту же миграцию.
if ! $COMPOSE run --rm migrate; then
  log "Миграции не прошли — новый код не запускается"
  rollback
  exit 1
fi

log "Справочник валют"
# Сид гоняется на каждом выкате, а не однажды руками: это не тестовые
# данные, а справочник, который обязан совпадать с кодом — иначе счёт
# в валюте, добавленной в этом релизе, создать нельзя. Внутри upsert
# по коду валюты, так что повтор безвреден.
if ! $COMPOSE run --rm migrate node dist/scripts/seed.js; then
  log "Справочник не залился"
  rollback
  exit 1
fi

log "Запуск api и caddy"
$COMPOSE up -d --no-build api caddy

# Caddyfile примонтирован файлом, поэтому его правка не меняет описание
# контейнера — compose считает caddy актуальным и не трогает его. Без
# явной перезагрузки новый конфиг просто не вступил бы в силу.
# reload, а не restart: Caddy подхватывает конфиг без разрыва соединений.
$COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# ───────────────────────────── проверка ───────────────────────────────────

log "Проверка здоровья"
CID="$($COMPOSE ps -q api)"
HEALTHY=false
for _ in $(seq 1 30); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo starting)"
  if [ "$STATUS" = healthy ]; then
    HEALTHY=true
    break
  fi
  if [ "$STATUS" = unhealthy ]; then
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != true ]; then
  log "api не стал здоровым. Последние логи:"
  $COMPOSE logs --tail 50 api || true
  rollback
  exit 1
fi

log "Готово: $IMAGE"
$COMPOSE ps
