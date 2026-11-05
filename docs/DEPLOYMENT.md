# Deployment

Infrastructure details: `RAILWAY_INFRASTRUCTURE.md`. Variables: `ENVIRONMENT_VARIABLES.md`.

## 1. Pipeline

```
PR ──► CI (typecheck, lint, unit, integration, contract, security scans, OpenAPI diff, `railway config plan` if .railway/ changed)
   └─► review (1 reviewer; 2 for auth/consent/deletion/infra changes)
main ──► auto-deploy to staging ──► smoke e2e on staging ──► manual promotion to production (tagged release)
```

- Production deploys only from signed tags `vX.Y.Z` created after the release DoD (`DEFINITION_OF_DONE.md` §4).
- IaC changes: `railway config plan` output attached to the PR; `railway config apply` run by a maintainer **[S14]**.

## 2. Release order per deploy

1. **Migrations** (pre-deploy step of `api`, role `eoh_migrator`). Must be backward-compatible with the currently running code (expand/contract).
2. **api** deploy (health: `/readyz` checks DB + migration version).
3. **worker** deploy (drains: finishes current job steps; Graphile Worker graceful shutdown on SIGTERM).
4. **web** deploy.
5. Post-deploy smoke: sign-in (fake email in staging), story read, stream range request, job round-trip with fake providers (staging) / synthetic canary story (production, owned by the team, consented).

## 3. Database migrations

- Drizzle-kit generates SQL; a human reviews and edits; migrations are committed SQL files (ADR-008).
- Forward-only. Rollback = deploy previous code that is compatible with the expanded schema; destructive "contract" migrations happen one release later.
- Long-running migrations (index builds) use `CONCURRENTLY` and run in a dedicated release.
- Data migrations are jobs (idempotent, resumable), not inline migration scripts, when they touch > 10k rows.
- Every migration has an integration test (up on empty DB + up on previous-release fixture DB).

## 4. Rollback strategy

| Situation | Action |
|---|---|
| Bad api/web/worker deploy | Redeploy previous image via Railway; schema compatible by expand/contract rule |
| Bad migration (expand) | Ship a fix-forward migration; never edit applied migrations |
| Bad model/prompt config | Revert config variables; jobs in flight complete with old values recorded in `model_runs` |
| Data corruption | PITR into sibling service → verify → ledger replay → cut over (`RETENTION_AND_DELETION.md` §6) |

## 5. Model and prompt releases

- Model IDs and prompt versions are configuration; changes follow `AI_EVALUATION.md` §2 gates and are listed in release notes.
- Canary: new model/prompt applied first to the team's synthetic canary story in production, then to new jobs.
- Never regenerate existing approved content automatically.

## 6. Secret rotation runbook (summary)

| Secret | Rotation | Impact |
|---|---|---|
| `SESSION_TOKEN_PEPPER` | On compromise only | Invalidates all sessions (users sign in again) |
| `AUDIT_HMAC_KEY` | On compromise; new key starts a new chain segment with a signed boundary event | None for users |
| `FIELD_ENCRYPTION_KEYS` | Add new key ID, set current, background re-encrypt (R2 job), retire old | None |
| `CLOUDINARY_API_SECRET` | Generate new in console; update api + worker; revoke old | In-flight upload signatures fail → clients refresh session |
| Provider API keys | Create new key; deploy; revoke old | None |
| DB password | Rotate via Railway; redeploy services | Brief reconnects |
| Offsite bucket creds | Rotate; update ops-cron/worker | None |

## 7. Data migration strategy (provider changes)

Media provider or AI provider changes follow `MEDIA_STORAGE.md` §9 and `AI_PROVIDER_STRATEGY.md` §6: dual-run/copy with verification, per-row cutover, old-provider deletion through the deletion pipeline.

## 8. Production readiness checklist

- [ ] Region `europe-west4-drams3a` for all services and Postgres (ADR-001).
- [ ] Postgres: daily + weekly backups on, monthly off, PITR on; offsite dump job succeeding; restore drill < 30 days old.
- [ ] Public TCP proxy for Postgres disabled; DB roles `eoh_app`/`eoh_migrator`/`eoh_readonly` configured.
- [ ] `FEATURE_PUBLIC_SHARING=false`; startup assertion active.
- [ ] Cloudinary: authenticated delivery self-test passes; unsigned presets absent; strict transformations on; backups on.
- [ ] Provider data controls checklist complete (`AI_PROVIDER_STRATEGY.md` §4).
- [ ] Secrets set only in Railway; secret scan clean; 2FA on Railway, Cloudinary, OpenAI/Nebius, email, observability accounts.
- [ ] Alerts configured and tested (`OBSERVABILITY.md` §5).
- [ ] Incident runbook and Information Regulator reporting steps accessible to on-call (`SECURITY_AND_PRIVACY.md` §14).
- [ ] Consent script version published (xh/en) and privacy notice live.
- [ ] Budgets set; cost dashboard live.
- [ ] Admin second factor enforced.
- [ ] Two-person sign-off recorded.
