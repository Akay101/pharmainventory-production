#!/bin/bash
# Runs every minute (/etc/cron.d/davadesk). Docker restarts crashed containers,
# but not a process that is up and stuck: after 3 failed readiness checks in a
# row the API container is restarted. Also restarts a stopped data container.
STATE=/var/lib/davadesk-health.fails
UPSTREAM=/etc/nginx/conf.d/davadesk-upstream.conf
PORT=$(grep -oE '127\.0\.0\.1:800[12]' "$UPSTREAM" | cut -d: -f2)
PORT=${PORT:-8002}

for c in pharmalogy-mongodb pharmalogy-redis pharmalogy-backend pharmalogy-worker; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" != "true" ]; then
    echo "$(date -u +%FT%TZ) $c not running, starting it"
    docker start "$c" >/dev/null 2>&1 || true
  fi
done

if curl -fsS -m 5 "http://127.0.0.1:$PORT/health/ready" >/dev/null 2>&1; then
  echo 0 > "$STATE"
  exit 0
fi
FAILS=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$FAILS" > "$STATE"
echo "$(date -u +%FT%TZ) readiness failed on $PORT ($FAILS in a row)"
if [ "$FAILS" -ge 3 ]; then
  echo "$(date -u +%FT%TZ) restarting pharmalogy-backend"
  docker restart -t 20 pharmalogy-backend >/dev/null 2>&1 || true
  echo 0 > "$STATE"
fi
