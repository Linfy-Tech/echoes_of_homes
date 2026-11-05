# System Design

Detailed internal design of the components in `ARCHITECTURE.md`. Requirement IDs from `SPEC.md`; states from `MACHINE.md`.

---

## 1. API request lifecycle (`apps/api`)

Fastify hook order for every request:

1. **Correlation** — read/generate `X-Correlation-Id`; attach to logger and OpenTelemetry context.
2. **Security headers** — HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, strict CORS (`ALLOWED_ORIGINS`, credentials true).
3. **Rate limit** — bucket by route group (§10).
4. **Session** — resolve cookie → `sessions` (hash lookup) → `actor` (`{ userId, accountRole }`) or anonymous. Touch `last_seen_at` at most once per 5 minutes.
5. **CSRF** — for unsafe methods: `Origin` ∈ allow-list **and** `X-Requested-With: eoh-web`.
6. **Validation** — Zod schema (body, params, query, headers). Unknown body keys rejected (`.strict()`).
7. **Handler** — calls one **domain service** function. Handlers contain no business rules.
8. **Response serialisation** — Zod response schema (prevents accidental field leaks).
9. **Error mapping** — domain errors → RFC 9457 problem JSON (`API_CONTRACTS.md` §1.3).

Module layout:

```
apps/api/src/
  server.ts               # build Fastify instance, register plugins
  plugins/                # correlation, session, csrf, rate-limit, error-mapper, otel
  routes/<area>/*.ts      # thin: schema + policy action + call domain service
  domain/<aggregate>/     # services: transitions, guards, side effects (shared with worker via packages/database/domain)
  webhooks/media.ts
```

Domain services live in `packages/database/src/domain/` so the worker uses exactly the same transition code. A domain service signature:

```ts
// illustrative
async function approveTranscriptForTranslation(
  tx: Tx, actor: Actor, transcriptId: Uuid, expectedVersion: number, ctx: RequestCtx
): Promise<Result<ApprovedTranscript, DomainError>>
```

Each service: (1) loads the aggregate `FOR UPDATE`, (2) `assertCan(actor, action, resource)`, (3) checks state + guards, (4) writes changes with version check, (5) writes `audit_events`, (6) enqueues jobs via `enqueueJob(tx, …)` — all in one transaction.

## 2. Authorisation engine (`packages/auth`)

- Pure function core: `can(actor, action, resourceCtx): Decision` where `resourceCtx` is a fully loaded snapshot (story status, audience, storyteller/rights holder user IDs, actor's story roles, circle membership, active consent scopes, break-glass grant).
- `loadResourceCtx(tx, actor, ref)` loads everything with one or two queries per request. **No caching across requests** (FR-SHR-03).
- Decision is `allow` or `deny` with a reason code (`not_member`, `missing_role`, `state_forbids`, `consent_missing`, `audience_excludes`). Reason codes are logged; they are not returned to clients beyond 403/404.
- The policy matrix (`CONSENT_AND_OWNERSHIP.md` §5) is encoded as a table-driven policy file and tested exhaustively: every action × every role × relevant states.
- Platform admins are just another actor type with **no content actions** unless a valid `break_glass_grants` row exists for that story.

## 3. Consent gate

`consentGate(tx, storyId, requiredScopes[])`:

1. Selects the story's `active` consent record and its `consent_scope_grants` **inside the current transaction** (`FOR SHARE`).
2. Returns `ok` only if every required scope is `granted = true`.
3. Is called (a) by domain services before enqueuing work, and (b) by the worker job wrapper at job start, and (c) between long-running steps (each ASR chunk, each translation batch) for cooperative cancellation.

Withdrawal (`consent.apply_withdrawal`) sets affected `processing_jobs` to `cancelled` and calls Graphile Worker's job removal for queued jobs by `job_key`; running jobs observe cancellation at the next checkpoint (≤ 1 chunk of work, bounded to ~1 provider call).

## 4. Durable jobs (`workers/story-processing`)

### 4.1 Enqueue
```sql
-- illustrative, executed inside the domain transaction
INSERT INTO processing_jobs (id, story_id, type, status, input_ref, idempotency_key, max_attempts, correlation_id)
VALUES ($1, $2, 'asr.transcribe', 'queued', $3, $4, $5, $6)
ON CONFLICT (idempotency_key) DO NOTHING;
SELECT graphile_worker.add_job('asr.transcribe', json_build_object('processingJobId', $1),
       job_key := $1::text, max_attempts := $5);
```
Because `add_job` is a SQL function **[VERIFIED S24]**, calling it within the domain transaction means the job exists if and only if the state change commits (**to be proven by the M0 spike test**, OQ-005). Payloads carry IDs only.

### 4.2 Task wrapper
Every task runs inside `runJob(type, handler)`:

1. Load `processing_jobs` row; if status is terminal → return (idempotent no-op).
2. Transaction: story not `paused`/`deletion_pending`/`deleted`; `consentGate`; budget check → `running` (or `cancelled` / `waiting_budget`).
3. Execute handler with a `JobContext` (`checkpoint()` = re-run consent + cancellation check; `recordModelRun()`; `tmpDir()` auto-cleaned).
4. Handler returns outputs; wrapper persists outputs + `succeeded` + domain transition in one transaction.
5. Errors classified: `RetryableError` (timeouts, 429, 5xx, network) → rethrow for Graphile backoff and mark `failed_retryable`; `PermanentError` → `failed_permanent` + admin alert; `CancelledError` → `cancelled`.
6. Attempts exhausted → `failed_permanent`.

### 4.3 Idempotency of outputs
- ASR writes the transcript version under a unique key `(story_id, asr_processing_job_id)`; a retry after partial work first deletes rows for that job's uncommitted version (versions in `generating` are rebuilt from scratch) — and persists each chunk result in `job_step_results` keyed by `(processing_job_id, 'asr_chunk', chunk_index)` so retries skip completed chunks and avoid re-paying providers.
- Translation and verification persist per-batch results in `job_step_results` the same way (`translation_batch`, `verify_batch`).
- `model_runs` are written even for failed calls (cost and audit).

### 4.4 Scheduling and maintenance
Graphile Worker cron-style tasks: `maintenance.abandon_uploads` (hourly), `deletion.scan_due` (every 15 min — promotes due `requested` deletions), `export.expire` (hourly), `maintenance.ledger_replicate` (every 15 min), `maintenance.purge_ephemeral` (daily: auth challenges, idempotency keys, webhook receipts > 30 days), `maintenance.audit_chain_verify` (daily).

## 5. Audio pipeline (Listener)

1. **Fetch** original via `MediaStorageProvider.download()` to the worker's temp dir (ephemeral container disk; deleted in `finally`).
2. **Verify** (job `media.verify`): SHA-256 streaming hash; `ffprobe` for streams/duration/codec.
3. **Prepare** (in `asr.transcribe`): `ffmpeg` → mono, 16 kHz, FLAC or Opus (provider-specific setting in adapter); loudness normalisation (EBU R128 `loudnorm`) applied **only to the processing copy**.
4. **Chunk**: silence detection (ffmpeg `silencedetect` in R1; a VAD model may be evaluated later — licence check required) to cut at pauses; target chunk ≤ 10 min and below provider size limits (OpenAI file limit 25 MB **[VERIFIED S1]**); add 1.0 s overlap at forced cuts with no silence; never cut mid-segment when silence exists within ±15 s.
5. **Transcribe** each chunk through `AsrProvider.transcribe()`; checkpoint between chunks.
6. **Stitch**: offset timestamps by chunk start; de-duplicate overlap region by aligning token sequences (longest common subsequence on overlap window); if alignment is ambiguous, keep both and add `asr_disagreement` flag rather than dropping words.
7. **Segment**: segments come from provider timestamps when available; otherwise from silence boundaries (each inter-silence region = one segment, max 30 s, split at punctuation).
8. **Signals → flags**: provider confidence/logprobs (if available), heuristics (`AGENT_DESIGN.md` §3.2).
9. Persist transcript version (`machine_draft`) + segments + flags + model runs in one transaction.

## 6. Upload client (`apps/web`)

- **Recording:** `MediaRecorder` with `timeslice = 5000 ms`; each `dataavailable` blob appended to an IndexedDB store `recordings/<localId>/chunks/<n>` with metadata (mime, startedAt). On reopen, unfinished local recordings are offered for recovery (S-35).
- **Hashing:** incremental SHA-256 over the assembled blob in a Web Worker (WebCrypto `digest` is not incremental; use a vetted WASM/JS incremental implementation — dependency chosen in M3 with licence check, OQ-016).
- **Upload:** request upload session → send chunks to Cloudinary with `X-Unique-Upload-Id` and `Content-Range` **[VERIFIED S7]**; persist per-chunk confirmation in IndexedDB; on failure retry with exponential backoff; on page reopen resume from first unconfirmed chunk. Whether Cloudinary accepts re-sent/resumed chunks for the same upload ID after a long gap is **UNVERIFIED** → M0 spike (OQ-004). Fallback if not supported: restart the provider upload from local data (still no user-visible loss).
- **Completion:** after the final chunk response (`done: true`), call `POST /v1/recordings/{id}/complete`. The webhook is the primary signal; the client call covers webhook delays. Both are idempotent.
- **Cleanup:** local data deleted only after the recording reaches `verified`, or when the user discards.
- **Service worker:** caches app shell; never caches API responses containing story content.

## 7. Streaming proxy

- `GET /v1/stories/{id}/audio`: authorise → resolve `media_assets` (role `playback` or `original`) → generate a signed authenticated delivery URL server-side for this request → `fetch` with the client's `Range` header → pipe status, `Content-Range`, `Content-Length`, `Content-Type` back; strip provider headers; `Cache-Control: private, no-store`.
- Timeouts: connect 5 s, idle 30 s. Client disconnect aborts upstream fetch.
- Cost note: playback bytes traverse Railway egress (trade-off accepted for privacy; `MEDIA_STORAGE.md` §5). Low-bitrate rendition limits volume.

## 8. Webhooks

- Verify provider signature and timestamp freshness (reject > 10 min old) using the scheme from Cloudinary's notification docs (verified during M3).
- Dedupe via `webhook_receipts`.
- Webhooks only *nudge* state; authoritative data (hash, duration) always comes from worker verification.

## 9. Review concurrency

- Segment-level optimistic concurrency (`version`). The UI autosaves per segment on blur/explicit save; on `409` it shows both versions and lets the reviewer choose, keeping unsaved text in local draft storage.
- Transcript-level transitions (`review-complete`, approval) require the transcript `version` and recheck all segment states inside the transaction.

## 10. Rate limiting

- `@fastify/rate-limit` (or equivalent) per instance in R1 with **one API replica** (pilot). Before scaling to > 1 replica, move counters to a Postgres-backed store (OQ-017).
- Groups: `auth` (per email hash + IP hash), `upload-session`, `export`, `stream` (per user, generous), `default`.

## 11. Cost controls

- Before enqueue and at job start: estimate cost (audio seconds × provider unit price from config; tokens estimated from segment character counts) and compare with `AI_PER_STORY_BUDGET_USD` remainder and the daily budget (`ai_usage_daily`).
- Exceeding → `waiting_budget` with retry at next UTC day or admin override (audited).
- Unit prices live in config (`packages/ai-providers/pricing.ts`) with a `verifiedAt` date; stale (> 30 days) prices raise a startup warning.

## 12. Feature flags and configuration

- R1 flags are environment variables validated at startup by a Zod config schema (process exits on invalid config). Flags: `FEATURE_PUBLIC_SHARING` (must be `false` in R1 — startup assertion in production), `FEATURE_SECONDARY_ASR`.
- Model IDs and prompt versions are configuration, recorded in every `model_run`.

## 13. Internationalisation

- Message catalogues `xh.json`, `en.json` in `apps/web/messages/`; ICU message format; library chosen in M1.
- Missing key in `xh` fails CI (no silent English fallback on storyteller-facing screens).
- API error `title` is a message key resolved by the client; API never returns translated prose.

## 14. Time, IDs, and hashing

- All server timestamps from the DB (`now()`) within transactions; job scheduling uses DB time.
- UUIDv7 generated in app code; never derived from content.
- Content hashes: SHA-256 over canonical JSON (sorted keys, NFC-normalised strings) for transcripts, translations, story versions, consent scripts.

## 15. Failure-mode summary

| Failure | Behaviour |
|---|---|
| Provider timeout / 5xx / 429 | Retry with backoff + jitter; circuit breaker opens after N consecutive failures per provider (`AI_PROVIDER_STRATEGY.md` §6) |
| Provider returns invalid schema | Retry once with same input; then `failed_permanent` for that step, story `attention_reason` set |
| Webhook never arrives | Client completion call or hourly reconciliation (list pending recordings older than 30 min → check provider) |
| Worker crash mid-job | Graphile lock expiry → retry; chunk results make retries cheap |
| DB unavailable | API `/readyz` fails → Railway restarts/routes; worker pauses polling |
| Consent withdrawn mid-job | Next checkpoint → `cancelled`; partial outputs for that version deleted |
