# Test Strategy

Tests prove the promises: consent is enforced, private stays private, uncertainty is never hidden, deletion is complete, and the workflow survives bad networks and flaky providers.

## 1. Tooling (proposed, confirm in M1)

| Layer | Tool |
|---|---|
| Unit | Vitest |
| Integration (DB) | Vitest + Testcontainers PostgreSQL (same major version as Railway) |
| API contract | Fastify `inject` + Zod schemas + OpenAPI diff |
| E2E | Playwright (Chromium, WebKit; Android emulation; network throttling) |
| Accessibility | axe-core (Playwright), manual TalkBack/VoiceOver passes |
| Security | Authorisation matrix suite, ZAP baseline (staging), gitleaks, OSV/`pnpm audit` |
| AI evaluation | Offline harness in `tests/evaluation/` (fixtures; no live calls in CI) |
| Load/cost | k6 (or similar) against staging with fake providers + a small real-provider run |

## 2. Test pyramid and locations

| Suite | Location | Scope | Runs |
|---|---|---|---|
| Unit | `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts`; cross-package in `tests/unit/` | Pure logic: policies, transitions, validators, heuristics, stitching, hashing | Every PR |
| Integration | `tests/integration/` | Domain services with real Postgres; job wrapper with Graphile Worker; fake media/AI providers | Every PR |
| Contract | `apps/api/test/contract/` | Every route: schema valid/invalid, error format, auth required | Every PR |
| Migration | `tests/integration/migrations/` | Up from empty; constraint tests (`DATA_MODEL.md` §12) | Every PR touching schema |
| E2E | `tests/e2e/` | Journeys J1–J13 AC | PR (smoke subset), nightly (full) on staging |
| Accessibility | within e2e + manual | WCAG 2.2 AA | PR (axe), per UI milestone (manual) |
| Security | `tests/security/` | Matrix, injection, headers, CSRF, redaction, provider URL leakage | Every PR; DAST before release |
| Evaluation | `tests/evaluation/` | Schema/behaviour (L1–L2) in CI; benchmark (L3) on demand | PR (L1–L2), manual (L3) |
| Load/cost | `tests/load/` (added in M9) | 60-min recordings, concurrency, cost per minute | Before release |

## 3. Domain and state-machine tests

For every machine in `MACHINE.md`:
- Each allowed transition: happy path test asserting new state, audit event, enqueued jobs.
- At least one forbidden transition per state: `409 invalid_state_transition`, no side effects.
- Concurrency: two simultaneous transitions → exactly one succeeds.
- Property-based tests (fast-check) on transcript segment operations (split/merge preserve coverage and ordering; timestamps monotonic).

## 4. Consent and deletion tests (must-have)

| ID | Test |
|---|---|
| CT-01 | Recording creation without `record_and_store`/`cross_border_processing` → 409 |
| CT-02 | Job enqueue without scope → not enqueued; job start after withdrawal → `cancelled`, no `model_runs` |
| CT-03 | Withdrawal mid-ASR → cancelled at next checkpoint; partial outputs removed |
| CT-04 | Revoke `share_family` → family member's next request 404 |
| CT-05 | Custodian cannot grant scopes; can revoke; widening requires assisted confirmation |
| CT-06 | Assisted consent without evidence asset → 400; DB CHECK rejects direct insert |
| CT-07 | Only one active consent record per story (DB) |
| DT-01 | Deletion request → immediate inaccessibility for all non-requesters |
| DT-02 | Deletion execute → zero rows referencing story; all media `head()` absent (fake + staging Cloudinary) |
| DT-03 | Deletion idempotent (run twice) |
| DT-04 | Partial provider failure → `completed_with_exceptions` → retried → `completed` |
| DT-05 | Restore older backup → ledger replay removes deleted story |
| DT-06 | Export link expiry and file purge |

## 5. Failure, retry, and upload-interruption tests

- Provider fakes inject: timeouts, 429 with `Retry-After`, 5xx, malformed JSON, schema-invalid outputs, partial chunk failure.
- Worker crash simulation (kill mid-job) → retry resumes from `job_step_results`, no duplicate charges.
- Upload: Playwright throttling (3G profile), offline toggles at 10/50/90%, tab close/reopen, signature expiry mid-upload, duplicate `/complete` calls, webhook before/after client completion, webhook replay.
- Recording: simulated tab crash (IndexedDB recovery), mic permission denial, device storage near-full warning (mocked quota).

## 6. Security and authorisation tests

- **Authorisation matrix:** generated from the policy table (`CONSENT_AND_OWNERSHIP.md` §5): for every action × role × relevant story state, assert allow/deny and 404-vs-403 semantics via API.
- Route inventory test: every registered route declares a policy action (fails CI otherwise).
- CSRF (missing/foreign Origin, missing header), session fixation/rotation, cookie flags, CSP/HSTS headers.
- Log/trace/error redaction: inject sentinel strings into content fields → assert absent from captured logs, spans, error events.
- No provider media URLs in any API response (response scanner across e2e runs).
- Prompt-injection fixtures (spoken-style and typed): outputs remain schema-valid suggestions; no state changes beyond the step; Context role leaves text hash unchanged.
- Admin endpoints return no content fields without break-glass.
- Dependency and secret scanning on every PR; ZAP baseline on staging before release.

## 7. Accessibility tests

- axe: zero serious/critical violations on every screen in e2e.
- Keyboard-only completion of J2, J6, J8, J9, J11.
- Screen-reader manual scripts per UI milestone; `lang` attributes correct for xh/en content.
- Text scaling 200% layout check; touch-target size lint (CSS audit).

## 8. AI evaluation tests

- L1/L2 in CI (`AI_EVALUATION.md` §1): recorded provider responses → adapter mapping; role output validation; hallucination heuristics on fixtures; translator marker/term preservation; verifier seeded defects (deterministic checks).
- L3/L4 on demand with reports in `tests/evaluation/reports/`.

## 9. Performance and cost tests (M9)

- 60-minute recording end-to-end processing time and cost (real provider, staging).
- 10 concurrent stories processing; API p95 under review-editing load; stream endpoint TTFB.
- Budget enforcement under load.

## 10. Test data policy

- Synthetic data by default; isiXhosa-like synthetic text generated by fluent team members (not real stories).
- Consented evaluation audio stays in the evaluation store; CI uses short consented snippets only if the research consent covers it, otherwise synthetic recordings by team members.
- No production data in any test environment, ever.

## 11. Acceptance criteria traceability

Every AC ID (`J*-AC*`, `F*-AC`, `M*-AC*`, `CT-*`, `DT-*`) is referenced in a test name or tag (e.g. `test('J11-AC1 revoke family access is immediate', …)`). CI produces an AC coverage report listing ACs without tests (must be empty at milestone checkpoint for that milestone's ACs).
