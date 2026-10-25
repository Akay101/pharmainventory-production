# DavaDesk production runbook

Production API: `https://api.davadesk.in` on one EC2 t3.medium (Ubuntu 24.04, ap-south-1).
The web app (`store.davadesk.in`) and admin panel are on AWS Amplify (CloudFront, managed TLS).

## What runs on the server

| Piece | How | Reachable from |
|---|---|---|
| nginx | systemd | internet: 80 (redirect), 443 |
| API `pharmalogy-backend` | Docker, blue/green on 8001/8002 | 127.0.0.1 only (nginx) |
| Scan worker `pharmalogy-worker` | Docker | none |
| MongoDB 7 `pharmalogy-mongodb` | Docker, single-node replica set `rs0`, auth + keyfile | 127.0.0.1, docker0 (172.17.0.1) |
| Redis 7 `pharmalogy-redis` | Docker, password, AOF persistence, noeviction | 127.0.0.1, docker0 (172.17.0.1) |

MongoDB must stay a replica set: purchases, bills and returns use transactions.
App connection strings need `directConnection=true`.

### Files on the server
- `~/deploy.sh` ← `deploy/scripts/deploy.sh` (GitHub Actions runs it)
- `~/pharmainventory-production/backend-node/.env`: the API's environment (mode 600). Docker's `--env-file` keeps quotes literally, so don't quote values.
- `/etc/nginx/conf.d/davadesk-http.conf`, `davadesk-upstream.conf`, `/etc/nginx/snippets/davadesk-proxy.conf`, `/etc/nginx/sites-available/default` ← `deploy/nginx/`
- `/opt/davadesk/backup-mongo.sh`, `/opt/davadesk/healthwatch.sh`, `/etc/cron.d/davadesk`, `/etc/logrotate.d/davadesk` ← `deploy/scripts/`
- `/opt/mongo/keyfile`, `/opt/mongo/root.env`, `/opt/redis/redis.conf`: secrets, root only
- Backups: `/var/backups/davadesk/` (14 days) and `s3://pharmalogy-media-bucket/db-backups/` (30 days, SSE-AES256; the bucket blocks all public access)

## Deploy
Push to `production` → GitHub Actions builds both images, pushes them to Docker Hub and runs `~/deploy.sh`:
the new API starts on the idle port, must pass `/health/ready` (Mongo + Redis reachable) before nginx is switched to it,
then the old one drains and stops. A failed health check leaves live traffic untouched.

```bash
ssh -i davadesk-prod.pem ubuntu@15.252.100.85
bash ~/deploy.sh rollback          # back to the previously live images
SKIP_PULL=1 bash ~/deploy.sh       # deploy images loaded by hand (docker load)
```

## Health and monitoring
- `GET /health`: liveness. `GET /health/ready`: Mongo + Redis checks (503 when degraded).
- `healthwatch.sh` runs every minute: starts any stopped container; restarts the API after 3 failed readiness checks. Log: `/var/log/davadesk-health.log`.
- Add an external uptime monitor (UptimeRobot / Better Stack, free) on `https://api.davadesk.in/health/ready` with alerts to phone/email: nothing on the server can tell you if the whole server is down.

## Backups and restore
Nightly 02:30 IST. Restore drill done on 2026-10-25 (all collections and counts matched).
```bash
sudo ls -lh /var/backups/davadesk/
F=/var/backups/davadesk/mongo-YYYYMMDD-HHMMSS.archive.gz
# whole database (overwrites!)
sudo cat $F | docker exec -i pharmalogy-mongodb sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop'
```

## Security layers
- AWS security group: only 22/80/443 open. UFW: same, plus docker0 → Mongo/Redis.
- fail2ban: `sshd` (5 failures → 1 h ban) and `nginx-limit-req` (60 rate-limit hits in 10 min → 2 h ban).
- SSH: keys only, no root login, 3 tries.
- nginx: TLS 1.2/1.3, HSTS, unknown hosts and bare-IP requests dropped, `/admin` and `/api-docs` not public,
  per-IP rate limits (API 30 r/s, login/OTP 10 r/min, catalogue search 8 r/s, public bill links 2 r/s).
- API: helmet headers, CORS allow-list, Mongo-operator stripping on all input, per-user/per-pharmacy limits on catalogue
  search (120/min, 6000/day), global catalogue never listed without a search term and at most 5 pages × 25–50 per term.
- Certificates: certbot timer (twice daily), nginx reloads after renewal.

## Reaching ops tools privately
```bash
# Bull board (scan queue): http://localhost:8801/admin/queues (user admin / ADMIN_PASSWORD)
ssh -i davadesk-prod.pem -L 8801:127.0.0.1:8001 -L 8802:127.0.0.1:8002 ubuntu@15.252.100.85
# Production MongoDB from a laptop (localhost:27018)
scripts/prod-db-tunnel.sh
```
