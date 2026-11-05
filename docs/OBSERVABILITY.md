# Observability

Goal: know when promises are at risk (privacy, consent, reliability, quality, cost) **without** collecting story content.

## 1. Principles

- Content-free telemetry by construction (`SECURITY_AND_PRIVACY.md` §9): allow-listed log fields and span attributes only.
- Every request and job carries a `correlationId` (NFR-OBS-01) propagated API → `processing_jobs.correlation_id` → worker spans → `model_runs`.
- OpenTelemetry SDK in api and worker; OTLP export to the chosen vendor (OQ-013). Web: error reporting only (no session replay, no product analytics).

## 2. Logs

Structured JSON: `ts`, `level`, `service`, `env`, `correlationId`, `route`/`jobType`, `userId`, `storyId`, `status`, `durationMs`, `errorCode`, `attempt`. Retention 30 days. No request/response bodies for content routes.

## 3. Metrics

| Area | Metrics |
|---|---|
| API | request rate, p50/p95/p99 latency by route group, 4xx/5xx rates, 401/403/404 by route (spikes = probing), rate-limit hits |
| Authorisation | denies by reason code; break-glass grants count |
| Consent | consents created by method; comprehension failures; withdrawals; jobs cancelled by consent gate |
| Upload | sessions created, completions, verification failures by reason, resume events, median upload duration |
| Jobs | queue depth by type, age of oldest queued job, run duration, retries, permanent failures, `waiting_budget` count |
| AI | calls, latency, error codes, schema-invalid rate per role/model; cost per audio minute; flags per minute by reason; machine→final CER per story (content-free); verifier issues by check ID |
| Media | stream TTFB, bytes streamed, provider errors |
| Deletion | requests, executions, exceptions, age of oldest incomplete deletion, ledger replication lag |
| Backups | last successful offsite dump age, last restore drill date |
| Worker | heartbeat age |
| Audit | daily chain verification result |

## 4. Traces

Spans: HTTP request → domain service → DB queries (statement names, not parameters) → enqueue; job → steps → provider calls (provider, model, outcome, latency, cost). Sampling: 100% errors, 10% success in production (adjust with volume).

## 5. Alerts (initial)

| Alert | Condition | Severity |
|---|---|---|
| API down | `/readyz` failing > 2 min | SEV1 |
| Worker heartbeat stale | > 2 min | SEV2 |
| Oldest queued job age | > 30 min (non-budget) | SEV2 |
| Permanent job failures | ≥ 3 in 1 h | SEV2 |
| Provider circuit open | any | SEV2 |
| Deletion overdue | incomplete > 24 h after `execute_after` | SEV2 |
| Ledger replication lag | > 1 h | SEV2 |
| Audit chain verification failed | any | SEV1 |
| Authz deny spike | > 5× baseline in 10 min | SEV2 (possible probing) |
| Break-glass granted | any | Notify (informational, reviewed weekly) |
| Offsite dump stale | > 36 h | SEV2 |
| Daily AI budget 80% | reached | Notify |
| Redaction canary | sentinel content string seen in telemetry pipeline | SEV1 |

## 6. Dashboards

1. **Service health** (API/worker/DB).
2. **Pipeline** (stories by status, job queues, failures).
3. **Trust** (consent events, authz denies, break-glass, deletion SLAs, audit verification).
4. **Language quality** (per model/prompt: machine→final CER, flag precision/recall proxies, verifier issues, review minutes per audio minute).
5. **Cost** (per day, per role, per audio minute).

## 7. Error reporting

- Browser and server error reporting with `beforeSend` scrubbing (drop request bodies, URLs' query strings, breadcrumbs with text content).
- Errors grouped by stable `errorCode`.

## 8. Health checks

- `GET /healthz` — process alive.
- `GET /readyz` — DB reachable, migrations at expected version, config valid. No dependency on third-party providers (so provider outages don't restart the API).
- Worker heartbeat row (`worker_heartbeats` table or Graphile Worker internal metrics) every 30 s.
