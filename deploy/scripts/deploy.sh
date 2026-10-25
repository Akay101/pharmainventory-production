#!/bin/bash
# Zero-downtime (blue/green) production deploy. Installed as ~/deploy.sh on the
# server; GitHub Actions (prod-deploy.yml) runs it after pushing new images.
#
#   bash deploy.sh            deploy the latest :prod images
#   bash deploy.sh rollback   go back to the image that was live before
#   SKIP_PULL=1 bash deploy.sh   use images already on the server
set -euo pipefail

IMAGE="pharmalogy/pharmalogy-backend:prod"
WORKER_IMAGE="pharmalogy/pharmalogy-worker:prod"
PREV_IMAGE="pharmalogy/pharmalogy-backend:previous"
PREV_WORKER="pharmalogy/pharmalogy-worker:previous"
ENV_FILE="$HOME/pharmainventory-production/backend-node/.env"
UPSTREAM="/etc/nginx/conf.d/davadesk-upstream.conf"
LOG_OPTS=(--log-opt max-size=20m --log-opt max-file=5)

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

MODE="${1:-deploy}"
if [ "$MODE" = "rollback" ]; then
  docker image inspect "$PREV_IMAGE" >/dev/null 2>&1 || { log "No previous image to roll back to"; exit 1; }
  RUN_IMAGE="$PREV_IMAGE"; RUN_WORKER="$PREV_WORKER"
else
  RUN_IMAGE="$IMAGE"; RUN_WORKER="$WORKER_IMAGE"
fi

docker volume create pharmalogy-uploads >/dev/null
# Containers run as the unprivileged "node" user (uid 1000)
sudo chown 1000:1000 "$(docker volume inspect -f '{{.Mountpoint}}' pharmalogy-uploads)"

OLD_PORT=$(grep -oE '127\.0\.0\.1:800[12]' "$UPSTREAM" | cut -d: -f2 || true)
OLD_PORT=${OLD_PORT:-8002}
if [ "$OLD_PORT" = "8001" ]; then NEW_PORT=8002; else NEW_PORT=8001; fi
log "Live port $OLD_PORT -> new port $NEW_PORT ($MODE)"

if [ "$MODE" = "deploy" ]; then
  # Remember what's live now so `deploy.sh rollback` can return to it
  CUR=$(docker inspect -f '{{.Image}}' pharmalogy-backend 2>/dev/null || true)
  [ -n "$CUR" ] && docker tag "$CUR" "$PREV_IMAGE"
  CURW=$(docker inspect -f '{{.Image}}' pharmalogy-worker 2>/dev/null || true)
  [ -n "$CURW" ] && docker tag "$CURW" "$PREV_WORKER"
  # SKIP_PULL=1 deploys images loaded onto the server by hand (docker load)
  if [ "${SKIP_PULL:-0}" != 1 ]; then
    docker pull -q "$IMAGE" || log "Could not pull $IMAGE, using the local copy"
    docker pull -q "$WORKER_IMAGE" || log "Could not pull $WORKER_IMAGE, using the local copy"
  fi
fi

docker rm -f pharmalogy-backend-new >/dev/null 2>&1 || true
docker run -d --name pharmalogy-backend-new \
  --restart unless-stopped \
  -p 127.0.0.1:$NEW_PORT:8001 \
  --env-file "$ENV_FILE" \
  -v pharmalogy-uploads:/app/tmp/uploads \
  --memory 1g --cpus 1.5 --stop-timeout 20 \
  "${LOG_OPTS[@]}" \
  "$RUN_IMAGE" >/dev/null

log "Waiting for the new API to be ready..."
READY=0
for i in $(seq 1 45); do
  if curl -fsS -m 3 "http://127.0.0.1:$NEW_PORT/health/ready" >/dev/null 2>&1 \
     || curl -fsS -m 3 "http://127.0.0.1:$NEW_PORT/health" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 2
done
if [ "$READY" != 1 ]; then
  log "New API never became ready; live traffic is untouched"
  docker logs --tail 80 pharmalogy-backend-new || true
  docker rm -f pharmalogy-backend-new >/dev/null || true
  exit 1
fi
log "Ready"

sudo sed -i -E "s/127\.0\.0\.1:800[12]/127.0.0.1:$NEW_PORT/" "$UPSTREAM"
sudo nginx -t -q
sudo systemctl reload nginx
log "Traffic switched to $NEW_PORT"

# Let in-flight requests on the old container finish, then stop it gracefully
sleep 5
docker stop -t 20 pharmalogy-backend >/dev/null 2>&1 || true
docker rm pharmalogy-backend >/dev/null 2>&1 || true
docker rename pharmalogy-backend-new pharmalogy-backend

log "Deploying worker"
docker stop -t 30 pharmalogy-worker >/dev/null 2>&1 || true
docker rm pharmalogy-worker >/dev/null 2>&1 || true
docker run -d --name pharmalogy-worker \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -v pharmalogy-uploads:/app/tmp/uploads \
  --memory 512m --cpus 1 --stop-timeout 30 \
  "${LOG_OPTS[@]}" \
  "$RUN_WORKER" >/dev/null

docker image prune -f >/dev/null || true
log "Deployment successful"
