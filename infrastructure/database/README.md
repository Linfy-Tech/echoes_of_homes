# infrastructure/database

Database operational policy (`docs/DATA_MODEL.md`, ADR-002, ADR-008).

- **Roles:** `eoh_migrator` (DDL), `eoh_app` (DML; `INSERT, SELECT` only on `audit_events`), `eoh_readonly` (ops views without content). Role/privilege SQL lives in the first migration set (M1).
- **Extensions:** `pgcrypto` only, unless an ADR adds more.
- **Migrations:** forward-only SQL in `packages/database/migrations/`; expand → migrate → contract; `CONCURRENTLY` for large indexes.
- **Backups:** Railway daily + weekly volume backups and PITR; monthly disabled; nightly encrypted `pg_dump --format=custom` offsite (30-day retention) **[S11]**.
- **Restore drills:** monthly in staging, recording RTO/RPO and verifying deletion-ledger replay (`docs/RETENTION_AND_DELETION.md` §6).
- **Local:** Docker Compose Postgres matching Railway's major version (added in M1).
