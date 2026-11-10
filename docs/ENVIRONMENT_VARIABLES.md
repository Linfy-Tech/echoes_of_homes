# Environment Variables

Template: `/.env.example` (placeholders only). All variables are validated at process start by a Zod config schema (`packages/shared-types` defines types; each app owns its schema). Invalid or missing required variables → process exits with a list of problems (values never printed).

**Scope:** W = web, A = api, K = worker, C = ops-cron. **Secret:** 🔐 = must be set via Railway variables; never in code, logs, or the browser.

| Variable | Scope | Secret | Required | Description |
|---|---|---|---|---|
| `NODE_ENV` | W A K C | | yes | `development` / `production` |
| `APP_ENV` | W A K C | | yes | `local` / `staging` / `production` |
| `LOG_LEVEL` | A K C | | yes | `info` in production; `debug` forbidden in production (startup check) |
| `SERVICE_NAME` | A K C | | yes | Telemetry service name |
| `WEB_BASE_URL` | A | | yes | Used in email links |
| `API_BASE_URL` | A K | | yes | Webhook URLs, absolute links |
| `NEXT_PUBLIC_API_BASE_URL` | W | | yes | Public API origin for the browser |
| `ALLOWED_ORIGINS` | A | | yes | Exact-match CORS/CSRF origin allow-list |
| `DATABASE_URL` | A K C | 🔐 | yes | Private-network connection string |
| `DATABASE_POOL_MAX` | A K | | no | Default 10 |
| `DATABASE_SSL_MODE` | A K C | | yes | `require` unless private-network TLS posture documented (OQ-008) |
| `SESSION_TOKEN_PEPPER` | A | 🔐 | yes | ≥ 32 random bytes |
| `SESSION_LOOKUP_KEY` | A | 🔐 | yes when `DATABASE_URL` is set | Independent ≥ 32-byte HMAC key for email/OTP lookup |
| `SESSION_ABSOLUTE_TTL_HOURS` | A | | no | Default 720 |
| `SESSION_IDLE_TIMEOUT_MINUTES` | A | | no | Default 10080 |
| `AUDIT_HMAC_KEY` | A K | 🔐 | yes | Audit hash-chain key |
| `FIELD_ENCRYPTION_KEYS` | A K | 🔐 | yes | JSON keyring `{id: base64key}` |
| `FIELD_ENCRYPTION_KEY_CURRENT_ID` | A K | | yes | Key ID for new writes |
| `EMAIL_PROVIDER` | A | | yes | `fake` locally |
| `EMAIL_FROM` | A | | yes | Sender address |
| `EMAIL_PROVIDER_API_KEY` | A | 🔐 | prod | |
| `MEDIA_STORAGE_PROVIDER` | A K | | yes | `fake` / `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | A K | | if cloudinary | Not secret |
| `CLOUDINARY_API_KEY` | A K | | if cloudinary | Public key (sent in signed upload params) |
| `CLOUDINARY_API_SECRET` | A K | 🔐 | if cloudinary | Never sent to clients **[S7]** |
| `CLOUDINARY_FOLDER_PREFIX` | A K | | yes | e.g. `eoh/prod` — no personal data |
| `CLOUDINARY_NOTIFICATION_URL` | A | | if cloudinary | Webhook URL |
| `AI_PROVIDER_MODE` | K | | yes | `fake` / `live`; CI forces `fake` |
| `ASR_PRIMARY_PROVIDER`, `ASR_PRIMARY_MODEL_ID` | K | | live | From ADR-005 decision |
| `ASR_SECONDARY_PROVIDER`, `ASR_SECONDARY_MODEL_ID` | K | | no | With `FEATURE_SECONDARY_ASR` |
| `TRANSLATION_PROVIDER`, `TRANSLATION_MODEL_ID` | K | | live | |
| `VERIFIER_PROVIDER`, `VERIFIER_MODEL_ID` | K | | live | |
| `CONTEXT_ASSIST_PROVIDER`, `CONTEXT_ASSIST_MODEL_ID` | K | | live | |
| `OPENAI_API_KEY` | K | 🔐 | if openai | Worker only |
| `OPENAI_PROJECT_ID` | K | | if openai | Separate projects for staging/prod |
| `OPENAI_BASE_URL` | K | | no | Only for a data-residency endpoint |
| `NEBIUS_API_KEY` | K | 🔐 | if nebius | |
| `NEBIUS_BASE_URL` | K | | if nebius | Dedicated endpoint URL in production |
| `SELF_HOSTED_ASR_URL` | K | | if self_hosted | Private URL |
| `SELF_HOSTED_ASR_TOKEN` | K | 🔐 | if self_hosted | |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | K | 🔐 | if google | |
| `WORKER_CONCURRENCY` | K | | no | Default 2 |
| `WORKER_POLL_INTERVAL_MS` | K | | no | Default 2000 |
| `JOB_DEFAULT_MAX_ATTEMPTS` | A K | | no | Default 5 (per-type overrides in code) |
| `FFMPEG_PATH` | K | | no | Default `ffmpeg` |
| `AI_DAILY_BUDGET_USD` | A K | | yes | Budget gate |
| `AI_PER_STORY_BUDGET_USD` | A K | | yes | Budget gate |
| `MAX_RECORDING_MINUTES` | W A K | | no | Default 90 |
| `RATE_LIMIT_AUTH_PER_15MIN` | A | | no | Default 10 |
| `RATE_LIMIT_API_PER_MIN` | A | | no | Default 120 |
| `RATE_LIMIT_UPLOAD_SIGN_PER_HOUR` | A | | no | Default 60 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | A K C | | prod | |
| `GRAFANA_CLOUD_OTLP_INSTANCE_ID` | A K C | 🔐 | prod | Grafana Cloud OTLP instance ID |
| `GRAFANA_CLOUD_OTLP_API_KEY` | A K C | 🔐 | prod | Grafana Cloud OTLP token; never commit |
| `OTEL_SERVICE_NAME` | A K C | | prod | `api` or `story-processing` |
| `ERROR_REPORTING_DSN` | W A K | 🔐* | prod | *DSNs for browsers are semi-public; scrubbing mandatory |
| `DELETION_LEDGER_S3_ENDPOINT`, `_BUCKET` | K | | prod | Offsite ledger |
| `DELETION_LEDGER_S3_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | K | 🔐 | prod | Write-only credentials where possible |
| `BACKUP_OFFSITE_S3_ENDPOINT`, `_BUCKET` | C | | prod | Offsite dumps |
| `BACKUP_OFFSITE_S3_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | C | 🔐 | prod | Write-only credentials where possible |
| `EXPORT_LINK_TTL_HOURS` | A | | no | Default 24 |
| `EXPORT_RETENTION_DAYS` | K | | no | Default 7 |
| `FEATURE_PUBLIC_SHARING` | A W | | yes | Must be `false` in R1; production startup refuses `true` |
| `FEATURE_SECONDARY_ASR` | K | | no | Default `false` |

Rules:
1. `web` receives only `NEXT_PUBLIC_*`, `NODE_ENV`, `APP_ENV`, feature flags, and the browser error DSN.
2. Different credentials per environment; production secrets accessible to two named people.
3. Adding a variable requires updating `.env.example`, this table, and the config schema in the same PR.
