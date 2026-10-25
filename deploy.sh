#!/bin/bash

set -e

echo "🚀 Starting deployment..."

IMAGE="pharmalogy/pharmalogy-backend"
WORKER_IMAGE="pharmalogy/pharmalogy-worker"
ADMIN_IMAGE="pharmalogy/pharmalogy-admin-backend"

ENV_FILE="$HOME/pharmainventory-production/backend-node/.env"
ADMIN_ENV_FILE="$HOME/pharmainventory-production/admin-backend/.env"

####################################################
# CREATE SHARED UPLOAD VOLUME
####################################################

docker volume create pharmalogy-uploads || true

####################################################
# DETECT CURRENT BACKEND PORT (Target pharmalogy-backend specifically)
####################################################

CURRENT_PORT=$(docker ps --filter "name=^pharmalogy-backend$" --format "{{.Ports}}" | grep -oE '800[12]' | head -n1)

if [ "$CURRENT_PORT" == "8001" ]; then
  NEW_PORT=8002
  OLD_PORT=8001
else
  NEW_PORT=8001
  OLD_PORT=8002
fi

echo "👉 Current backend port: $CURRENT_PORT"
echo "👉 New backend port: $NEW_PORT"

####################################################
# PULL LATEST IMAGES
####################################################

docker pull $IMAGE
docker pull $WORKER_IMAGE
docker pull $ADMIN_IMAGE || {
  echo "⚠️ Notice: Could not pull $ADMIN_IMAGE from registry, will use local build if available."
}

####################################################
# START NEW BACKEND API CONTAINER
####################################################

docker run -d \
  --name pharmalogy-backend-new \
  --restart unless-stopped \
  -p $NEW_PORT:8001 \
  --env-file $ENV_FILE \
  -v pharmalogy-uploads:/app/tmp/uploads \
  $IMAGE

echo "⏳ Waiting for API container..."
sleep 15

####################################################
# BACKEND HEALTH CHECK
####################################################

curl -f http://127.0.0.1:$NEW_PORT/health || {
  echo "❌ Health check failed for pharmalogy-backend"

  docker logs pharmalogy-backend-new

  docker stop pharmalogy-backend-new || true
  docker rm pharmalogy-backend-new || true

  exit 1
}

echo "✅ Backend health check passed"

####################################################
# UPDATE NGINX FOR BACKEND
####################################################

sudo sed -i "s/$OLD_PORT/$NEW_PORT/g" /etc/nginx/sites-available/default

sudo systemctl reload nginx

echo "🔁 Switched backend traffic to $NEW_PORT"

####################################################
# REMOVE OLD API CONTAINER
####################################################

docker stop pharmalogy-backend || true
docker rm pharmalogy-backend || true

####################################################
# RENAME NEW API CONTAINER
####################################################

docker rename pharmalogy-backend-new pharmalogy-backend

####################################################
# DEPLOY WORKER CONTAINER
####################################################

echo "🚀 Deploying worker..."

docker stop pharmalogy-worker || true
docker rm pharmalogy-worker || true

docker run -d \
  --name pharmalogy-worker \
  --restart unless-stopped \
  --env-file $ENV_FILE \
  -v pharmalogy-uploads:/app/tmp/uploads \
  $WORKER_IMAGE

echo "✅ Worker deployed"

####################################################
# DEPLOY ADMIN BACKEND CONTAINER
####################################################

echo "🚀 Deploying admin backend..."

# Ensure admin env file exists
if [ ! -f "$ADMIN_ENV_FILE" ]; then
  if [ -f "$HOME/admin-backend.env" ]; then
    mkdir -p $(dirname "$ADMIN_ENV_FILE")
    cp "$HOME/admin-backend.env" "$ADMIN_ENV_FILE"
  fi
fi

# Stop and remove old admin backend container
docker stop pharmalogy-admin-backend || true
docker rm pharmalogy-admin-backend || true

# Run new admin backend container
if docker image inspect $ADMIN_IMAGE >/dev/null 2>&1; then
  docker run -d \
    --name pharmalogy-admin-backend \
    --restart unless-stopped \
    -p 8005:8005 \
    --env-file "$ADMIN_ENV_FILE" \
    $ADMIN_IMAGE
elif [ -d "$HOME/pharmainventory-production/admin-backend" ]; then
  echo "Building admin backend locally..."
  docker build -t $ADMIN_IMAGE "$HOME/pharmainventory-production/admin-backend"
  docker run -d \
    --name pharmalogy-admin-backend \
    --restart unless-stopped \
    -p 8005:8005 \
    --env-file "$ADMIN_ENV_FILE" \
    $ADMIN_IMAGE
fi

echo "⏳ Waiting for Admin API container..."
sleep 5

curl -f http://127.0.0.1:8005/health || {
  echo "⚠️ Admin Backend Health check notice"
  docker logs pharmalogy-admin-backend
}

echo "✅ Admin Backend deployed"

####################################################
# CLEANUP DANGLING IMAGES
####################################################

docker image prune -f || true

echo "🎉 Deployment successful!"
