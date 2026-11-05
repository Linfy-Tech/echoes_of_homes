# infrastructure/railway

Railway project definition and operational runbooks (`docs/RAILWAY_INFRASTRUCTURE.md`, ADR-001).

**IaC:** Railway Config as Code (`railway.json`/`railway.toml`) is deprecated and stops being read on 2026-12-01 **[S13]**. This project uses Railway Infrastructure as Code: the authoring file lives at the repo root in `.railway/railway.ts` (created in M1) and is managed with `railway config plan` / `railway config apply` **[S14]**. This folder holds documentation and runbooks, not a second source of configuration.

**Runbooks to write (milestone):**
- `runbook-deploy.md` — promotion and rollback (M1)
- `runbook-restore.md` — PITR/offsite restore + deletion-ledger replay (M8)
- `runbook-secrets.md` — rotation steps (M1)
- `runbook-incident.md` — triage, containment, Information Regulator eServices reporting, data-subject notification templates in isiXhosa/English (M9)
- `runbook-db-access.md` — tunnelled access with `railway connect postgres --tunnel-only`, read-only role, ops log (M1)
