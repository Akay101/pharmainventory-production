# DavaDesk production readiness report: 25 Oct 2026

Server: EC2 t3.medium (2 vCPU, 4 GB), Ubuntu 24.04, ap-south-1 · API `api.davadesk.in` · Web on Amplify.

## 1. The purchase 500 (fixed)
**Cause:** production MongoDB ran as a *standalone* server. Saving a purchase uses a database
transaction, and MongoDB only allows transactions on a replica set. Every purchase save failed with
`Transaction numbers are only allowed on a replica set member` (production had 0 purchases).
Local worked because the local DB was a replica set.

**Fix:** after a verified full backup, production Mongo was recreated on the same data volume as a
single-node replica set (`rs0`, keyfile-authenticated). Connection strings got `directConnection=true`.
A transaction probe now commits on production. The same change briefly broke global medicine search
(it connected without `directConnection`); found in the logs and fixed within minutes.

**Your local "can't connect to prod DB":** `.env` pointed at `172.17.0.1`, an address that only exists
inside the server. Mongo is (correctly) not exposed to the internet, so the laptop now connects through
an SSH tunnel: run `scripts/prod-db-tunnel.sh` and `.env` uses `127.0.0.1:27018`.

## 2. Code-level security (all verified by tests)
| Finding | Severity | Fix |
|---|---|---|
| `GET /api/bills/doctors?limit=100000` returned the **entire global doctors table** in one call; `suppliers?include_global=1` the same for 87K distributors; medicine search allowed unlimited pages | Critical (data scraping) | Global data only for a real search (≥2 chars), max 25–50 per page, max 5 pages; per-user 120/min + per-pharmacy 6000/day limits on catalogue endpoints (Redis); nginx per-IP limits; fail2ban bans IPs that keep hitting limits |
| No NoSQL-injection guard on inputs | High | All body/query/params stripped of `$` / `.` keys (`middleware/security.js`) |
| Reminders search put raw input into `$regex` (ReDoS / injection) | High | Escaped and length-capped |
| Pharmacy logo upload accepted any file type/size to the public bucket (HTML/SVG phishing) | Medium | PNG/JPEG/WebP only, 2 MB |
| Frontend published **source maps** (full React source, 9.3 MB) | Medium | Builds no longer emit maps (live after the next Amplify build) |
| `NODE_ENV` in the container was `"production"` *with quotes* (docker env-file), so the app never ran in production mode | Medium | Env file unquoted |
| Swagger `/api-docs` public; Bull board public behind one password | Medium | Docs off in production; both blocked at nginx (SSH tunnel for ops) |
| Only auth endpoints rate-limited, in memory | Medium | Redis-backed limits for all API traffic, shared by blue/green containers |
| `suppliers?highlight_id=` crashed with 500 (const reassignment) | Bug | Fixed |
| Unbounded `limit` on several list endpoints; 50 MB JSON bodies | Low | Capped; JSON 10 MB |
| No readiness check / graceful shutdown | Ops | `/health/ready` (Mongo + Redis), SIGTERM drain |

Checked and fine: JWT (15-min access tokens, rotating refresh tokens, audience-pinned, `alg=none` rejected),
every business route requires auth + active subscription, tenant isolation (other pharmacies get 404),
Cashfree webhook signature verified, no secrets in git or git history, frontend exposes only the API URL.

## 3. Infrastructure (applied on the server)
| Area | Before | Now |
|---|---|---|
| Backups | **None** | Nightly 02:30 IST: disk (14 days) + private encrypted S3 (30 days). Restore drill passed |
| Redis | No password, bound to 0.0.0.0, no persistence settings | Password, private bind, AOF persistence, noeviction (job-queue safe) |
| API container | Bound to 0.0.0.0:8002, root user, Node 18 (EOL) | 127.0.0.1 only, non-root, Node 22 LTS, memory/CPU limits, log rotation, health check |
| nginx | TLS 1.0/1.1 on, CORS preflight echoed any origin, no rate limits, no gzip for JSON | TLS 1.2/1.3 + HSTS + HTTP/2, per-IP rate limits, unknown hosts/bare IP dropped, gzip, keep-alive upstream |
| Firewall | UFW off | UFW on (22/80/443) behind the AWS security group |
| SSH | root login allowed (key), 6 tries | keys only, no root, 3 tries, fail2ban |
| Deploys | blind 15 s wait, sed over whole nginx file | waits for `/health/ready`, switches only when ready, graceful drain, `deploy.sh rollback` |
| Self-healing | none | watchdog every minute (restarts stuck API / stopped containers) |
| Certificates | 2 stale certs failing renewal | only `api.davadesk.in` (renewal dry-run OK, auto-reload); Amplify domains AWS-managed (Apr 2027) |
| OS | 67 pending updates, reboot pending | fully patched; **reboot recovery verified: back in ~28 s, no manual steps** |

## 4. Load test
Run on the production server itself against an isolated copy of the API with its own empty
database (the live data was never touched; deleted afterwards). Same CPU/memory limits as production,
real global catalogue (4.09 lakh medicines). Each virtual user loops through a billing workflow with
1 s think time (searching, stock lookup, creating a bill, lists/dashboard, occasional purchase),
≈1.5 requests/second each: about 10–15× a real counter user.

| Concurrent virtual users | Throughput | p95 latency | Errors | Server CPU |
|---|---|---|---|---|
| 20 | ~30 req/s | < 60 ms | 0 | ~25% |
| 50 | ~53 req/s | **85 ms** | 0 | ~65% |
| 100 | ~80 req/s | ~650 ms | 0 | ~90% (saturated) |
| 150 | ~85 req/s | ~1.1 s | 0 | 100% |
Total: 60,659 requests, **0 failed**, every business check passed. All hot queries use indexes;
MongoDB and Node share the 2 vCPUs roughly equally at saturation.

## 5. How many users this server supports
A real pharmacy counter user generates ~0.1 request/s while actively billing (search-as-you-type,
stock check, bill save, background refreshes) and ~0.04/s when idle.

- **Comfortable (fast, p95 < 150 ms): ~50–60 req/s → about 500 people billing at the same moment,
  i.e. roughly 300 pharmacies busy at the same time, or ~600–700 registered pharmacies.**
- Saturation (slower, ~1 s, still no errors): ~85 req/s → about 2× the comfortable figure.
- 100–200 users: yes, easily, at roughly 10–20% of capacity.

Caveats: t3 is *burstable*. Its baseline is 40% of 2 vCPUs; above that it spends CPU credits
(t3 "unlimited" bills extra rather than throttling). If sustained CPU stays above 40% or credits drain,
move to c7i.large / m7i.large (same price class, no credit system). AI scanning and the assistant run
on external APIs (Gemini/Groq), so their limit is provider quota and credits, not this server.

## 6. What still needs you
1. **Commit and push.** Production is running the new code from this working tree (built and loaded by hand).
   Until it's committed, the next GitHub Actions deploy would rebuild the old code.
2. After the push, Amplify rebuilds the web app without source maps (still served until then).
3. Save one real purchase in the app to confirm end to end (transactions verified on the server).
4. AWS console (needs your account):
   - **EBS snapshots** every 4–6 h via Data Lifecycle Manager. Nightly dumps alone can lose up to a day of bills.
   - CloudWatch alarms on CPU, `CPUCreditBalance` and status checks.
   - An external uptime monitor on `https://api.davadesk.in/health/ready`.
   - Termination protection on the instance.
5. Use a separate least-privilege IAM user for production. It currently uses `pharmalogy-dev-s3`.
6. The admin panel (`admin.davadesk.in`) and `api-dev` run on another server (13.233.245.179), which this work did not cover.
7. UX change from the anti-scraping caps: the Suppliers page no longer lists global distributors until you type a search.
