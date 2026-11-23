#!/bin/sh
#
# Ежедневный бэкап базы (§10.2). Работает в контейнере `backup` из
# compose.prod.yml — на образе postgres, где pg_dump той же версии, что и
# сервер. Запускать руками на хосте не нужно; разовый бэкап «прямо сейчас»:
#
#   docker compose -f compose.prod.yml run --rm -e BACKUP_ONCE=1 backup
#
# Почему не cron: в alpine-образе postgres его нет, а ставить cron на хост
# значит менять систему сервера мимо репозитория. Цикл ниже раз в десять
# минут проверяет, есть ли уже сегодняшний дамп, и снимает его после
# BACKUP_HOUR по UTC. Так бэкап не теряется, если контейнер перезапустили
# или сервер лежал в назначенный час: он снимется при первой проверке после.
#
# POSIX sh, а не bash: в alpine только busybox.
set -eu

DIR="${BACKUP_DIR:-/backups/daily}"
HOUR="${BACKUP_HOUR:-3}"
KEEP="${BACKUP_KEEP:-14}"
INTERVAL=600

log() { echo "[backup $(date -u '+%F %T')] $*"; }

mkdir -p "$DIR"

dump() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  final="$DIR/daily-$stamp.sql.gz"
  # Пишется во временный файл и переименовывается только целым и проверенным:
  # оборванный посреди дамп с «нормальным» именем хуже, чем никакого, — его
  # примут за бэкап, когда он понадобится.
  tmp="$final.tmp"

  log "Снимаю дамп"
  # --clean --if-exists — как у дампа при деплое: такой файл накатывается
  # поверх существующей базы одной командой, без ручной очистки.
  #
  # Сжимает сам pg_dump, а не `pg_dump | gzip`: в конвейере код возврата —
  # от gzip, и упавший pg_dump давал пустой, но «целый» архив, который
  # проходил проверку и ложился рядом с настоящими бэкапами. Вторая проверка —
  # строка, которой pg_dump заканчивает только законченный дамп.
  if pg_dump --clean --if-exists --no-owner --compress=gzip:6 --file="$tmp" \
    && gzip -t "$tmp" \
    && gunzip -c "$tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
    mv "$tmp" "$final"
    log "Готово: $final ($(du -h "$final" | cut -f1))"
  else
    rm -f "$tmp"
    log "ОШИБКА: дамп не снялся, следующая попытка через $((INTERVAL / 60)) мин"
    return 1
  fi

  # Старые — прочь, остаются последние KEEP. Файлы удаляются только свои
  # (daily-*), дампы деплоя лежат уровнем выше и чистятся деплоем.
  ls -1t "$DIR"/daily-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    rm -f -- "$old"
    log "Удалён старый: $old"
  done
}

if [ "${BACKUP_ONCE:-0}" = 1 ]; then
  dump
  exit $?
fi

log "Запущен: каждый день после ${HOUR}:00 UTC, хранится $KEEP последних, папка $DIR"

while true; do
  today="$(date -u +%Y%m%d)"
  # Час без ведущего нуля: «08» в арифметике shell читается как восьмеричное.
  now_hour="$(date -u +%H | sed 's/^0//')"
  if [ "${now_hour:-0}" -ge "$HOUR" ]; then
    if ! ls "$DIR"/daily-"$today"-*.sql.gz >/dev/null 2>&1; then
      dump || true
    fi
  fi
  sleep "$INTERVAL"
done
