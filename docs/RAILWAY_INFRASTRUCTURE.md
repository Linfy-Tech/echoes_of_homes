# Railway Infrastructure

**Decision:** Railway hosts all compute and PostgreSQL (ADR-001, ADR-002). Facts verified 2026-11-04 (`SOURCES.md`).

## 1. Region

Railway regions: US West (`us-west2`), US East (`us-east4-eqdc4a`), EU West Amsterdam (`europe-west4-drams3a`), Southeast Asia Singapore (`asia-southeast1-eqsg3a`). **There is no Africa region.** **[VERIFIED S12]**

**RECOMMENDATION (provisional):** `europe-west4-drams3a` for every service and the database.
- Lowest expected latency from Cape Town among available regions (ASSUMPTION — measure in M0 with a ping test from Cape Town mobile networks).
- EU data-protection regime may support a POPIA s72(1)(a) adequacy argument — **LEGAL REVIEW** (OQ-014).
- OpenAI offers regional *processing* for transcription in the EU **[VERIFIED S4]**, enabling a consistent EU data path if used.
- Volumes follow their service's region; moving regions later requires volume migration with downtime **[VERIFIED S12]** — choose before production data exists.

## 2. Environments

| Environment | Purpose | Data | Providers |
|---|---|---|---|
| `local` | Developer machines (Docker Postgres) | Synthetic only | Fake by default |
| `staging` | Integration, demos, pilot rehearsal | Synthetic + consented test recordings from the team | Real providers, separate accounts/projects, low budgets |
| `production` | Pilot | Real families | Real providers, production accounts |
| PR environments | Optional ephemeral previews | Synthetic only | Fake providers |

Each Railway environment has its own isolated private network **[VERIFIED S15]**, separate variables, and separate provider credentials. Production credentials never exist in staging.

## 3. Services and topology

```
Railway project: echoes-of-home   (environment: production, region: europe-west4-drams3a)

  ┌────────┐  public HTTPS (custom domain app.<domain>)
  │  web   │──────────────────────────────────────────────┐
  └────────┘                                              │ browser calls
  ┌────────┐  public HTTPS (custom domain api.<domain>)   ▼
  │  api   │◄──────────────────────────────────────────── clients
  └───┬────┘
      │ private network: postgres.railway.internal (WireGuard-encrypted)
  ┌───▼──────┐
  │ postgres │ (volume, native backups, PITR)
  └───▲──────┘
      │ private network
  ┌───┴────┐
  │ worker │  no public domain
  └────────┘
  ┌──────────────┐
  │ ops-cron     │  offsite pg_dump + ledger replication check (no public domain)
  └──────────────┘
```

- Internal DNS: `SERVICE_NAME.railway.internal`; inter-service traffic is WireGuard-encrypted **[VERIFIED S15]**. Whether Railway Postgres is reachable over private networking is not stated on the networking page **[S15]** — confirm in M1 (expected to be supported via the template's private connection URL — UNVERIFIED).
- `worker` and `ops-cron` expose no public ports.
- `web` talks only to `api` over public HTTPS (browser-origin calls). Server-side rendering in `web` does not call the DB.

## 4. Infrastructure as Code

Railway's `railway.json` / `railway.toml` (Config as Code) is **deprecated**; existing files stop being read on **2026-12-01** **[VERIFIED S13]**. The replacement is Infrastructure as Code with a `.railway/railway.ts` authoring file (TypeScript DSL, GA), managed with `railway config plan` / `railway config apply` **[VERIFIED S14]**.

**Decision:** Use IaC (`.railway/railway.ts`) from M1. Do not create `railway.json`.

Planned declarations (written in M1, not now):
- Services `web`, `api`, `worker`, `ops-cron` with build/start commands and health checks (`healthcheck` field — mapping from former `healthcheckPath` **[VERIFIED S14]**).
- `postgres("postgres")` database; variable references (e.g. `db.env.DATABASE_URL`) **[VERIFIED S14]**.
- Secrets kept out of source using `preserve()` for existing values **[VERIFIED S14]**; secret values set via Railway dashboard/CLI by a human.
- `railway config plan` runs in CI on PRs touching `.railway/` (read-only); `apply` is manual by a maintainer for production, with `--confirm-destructive` never used without a reviewed plan.

## 5. PostgreSQL

| Setting | Value |
|---|---|
| Version | Latest major offered by Railway's Postgres template at M1 (record exact version in ADR-002) |
| Connection | Private network from `api`, `worker`, `ops-cron`; public TCP proxy disabled except for time-boxed admin tunnels (`railway connect postgres --tunnel-only` **[VERIFIED S11]**) |
| Roles | `eoh_migrator` (DDL, used only by migration step), `eoh_app` (DML; no UPDATE/DELETE on `audit_events`), `eoh_readonly` (ops queries, no content tables — via views) |
| Pooling | App-side pool (`DATABASE_POOL_MAX`); total connections across replicas < Postgres `max_connections` − 10 |
| Extensions | `pgcrypto` (digests in triggers); others only via ADR |
| Migrations | Run as a pre-deploy step of `api` (`preDeployCommand` equivalent in IaC) with `eoh_migrator`; worker waits for `/readyz` migrations-current check |

## 6. Backups and restore

Native Railway volume backups **[VERIFIED S11]**:
- Schedules: daily (kept 6 days), weekly (kept 1 month), monthly (kept 3 months); manual backups (limited to 50% of volume size).
- **Wiping a volume deletes all its backups**; restores only within the same project and environment; restoring deletes backups newer than the restored one.
- Point-in-time recovery via pgBackRest WAL archiving, ~4-week window, restores into a new sibling service.

Our policy:
1. Enable **daily + weekly** backups and PITR on production. **Do not enable monthly backups** (kept 3 months), so that deleted content leaves native backups within ~1 month — this bounds the deletion residual window promised to storytellers (`RETENTION_AND_DELETION.md` §5).
2. **Offsite logical backup** (because native backups do not survive volume/project deletion **[VERIFIED S11]**): `ops-cron` runs `pg_dump --format=custom` nightly → encrypted (age/GPG with offline-held key) → S3-compatible bucket outside the Railway project (`BACKUP_OFFSITE_S3_*`). Retention: 30 days (aligns deletion residual window; `RETENTION_AND_DELETION.md` §5).
3. **Restore drill** monthly in staging and before each release: restore latest dump into a scratch DB, verify row counts and recent data, replay deletion ledger, record recovery time and dump age as real RTO/RPO **[guidance S11]**.
4. Targets (pilot, provisional): RPO ≤ 24 h via dumps, ≤ minutes via PITR; RTO ≤ 4 h.

## 7. Secrets and variables

- All secrets in Railway environment variables, scoped per service (e.g. `CLOUDINARY_API_SECRET` only on `api` and `worker`; `web` holds no secrets at all — only public `NEXT_PUBLIC_*` configuration).
- Shared variables referenced, not duplicated. Rotation runbook per secret in `DEPLOYMENT.md` §6.
- Railway account: 2FA mandatory for all members; least-privilege project roles; production environment access limited to two people. (Railway's "lock down a production project" guide exists — review in M1: https://railway.com/guides/lock-down-production-project — not yet read, UNVERIFIED.)

## 8. Health checks and scaling

| Service | Health | Replicas (pilot) | Notes |
|---|---|---|---|
| web | `GET /api/health` (static) | 1 | stateless |
| api | `GET /readyz` | 1 (rate limiter is per-instance in R1) | scale after OQ-017 |
| worker | process-level + heartbeat row in DB every 30 s; alert if stale > 2 min | 1 | concurrency via `WORKER_CONCURRENCY` |
| ops-cron | exit code + last-success timestamp metric | — | Railway cron runs in UTC, 5-minute minimum granularity, overlapping runs skipped **[VERIFIED S11]** |

Restart policy: on failure with bounded retries (IaC equivalent of `restartPolicyType: ON_FAILURE` **[S13]**).

## 9. Cost model (to be filled at account setup)

| Item | Unit | Price | Source/date | Notes |
|---|---|---|---|---|
| Railway compute | vCPU/GB-hour | TBD | — | Pilot: 4 small services |
| Railway Postgres volume + backups | GB-month | TBD | — | Backups billed for unique data at volume rate **[S11]** |
| Railway egress | GB | TBD | — | Audio proxy streaming |
| Cloudinary plan | month | TBD | — | Determines token auth, limits (OQ-003) |
| ASR | per audio minute | TBD | — | From chosen provider pricing page at selection time |
| LLM translation/verification | per 1M tokens | TBD | — | — |
| Offsite bucket | GB-month | TBD | — | — |

Never hard-code prices in docs as facts; record source URL and date when filled.

## 10. Risks

| Risk | Mitigation |
|---|---|
| No SA region → latency, cross-border legal exposure | EU region; legal review; disclosure in consent |
| Single-region, single-DB | PITR + offsite dumps + restore drills |
| IaC tooling is new | Keep `.railway/railway.ts` minimal; plan in CI; manual apply |
| Accidental volume wipe deletes native backups | Offsite dumps; restricted production access |
