#!/usr/bin/env bash
# Opens a private SSH tunnel to the production MongoDB (it is never exposed to
# the internet). While this runs, localhost:27018 is the production database.
#   MONGO_URL=mongodb://<user>:<pass>@127.0.0.1:27018/pharmalogy_prod_db?directConnection=true&authSource=pharmalogy_prod_db
# Usage: scripts/prod-db-tunnel.sh [path-to-pem]   (Ctrl+C to close)
set -euo pipefail
KEY="${1:-$HOME/Downloads/davadesk-prod.pem}"
HOST="${PROD_HOST:-ubuntu@15.252.100.85}"
echo "Tunnel: localhost:27018 -> production MongoDB (Ctrl+C to close)"
exec ssh -i "$KEY" -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:27018:127.0.0.1:27017 "$HOST"
