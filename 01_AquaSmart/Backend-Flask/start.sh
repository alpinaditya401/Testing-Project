#!/bin/sh
# Titik masuk container layanan AI.
set -e
: "${PORT:=8000}"
: "${AQUASMART_AI_DATA_DIR:=/data/ai}"
export AQUASMART_AI_DATA_DIR
mkdir -p "$AQUASMART_AI_DATA_DIR"

# Volume Railway dipasang oleh root dan menimpa izin dari build. Bila berjalan sebagai root,
# serahkan direktori data ke pengguna aquasmart lalu jalankan layanan tanpa hak root.
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R aquasmart:aquasmart "$AQUASMART_AI_DATA_DIR"
  RUN_AS="setpriv --reuid=aquasmart --regid=aquasmart --init-groups"
fi

# Private networking Railway memakai IPv6; [::] juga menerima IPv4 di Linux.
BIND="0.0.0.0:${PORT}"
[ -f /proc/net/if_inet6 ] && BIND="[::]:${PORT}"

$RUN_AS python -m aquasmart_ai.bootstrap
exec $RUN_AS gunicorn --bind "$BIND" --workers "${WEB_CONCURRENCY:-2}" --timeout 180 \
  --access-logfile - wsgi:app
