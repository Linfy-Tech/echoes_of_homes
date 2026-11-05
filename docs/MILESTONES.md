# Milestones

Implement **one milestone at a time**. Within a milestone, deliver small reviewable slices (PRs). Each milestone ends with a **review checkpoint**: a human reviews the demo, the AC checklist, the test report, and open questions before the next milestone starts.

**Estimation assumptions:** 1 full-time full-stack engineer working with AI coding assistants; founder as product owner/reviewer part-time; fluent isiXhosa reviewers and legal counsel contracted externally. Effort = *ideal engineer-weeks*, not calendar time. Ranges reflect uncertainty; no timeline is promised without knowing team capacity.

**Critical path:** M0 (Cloudinary + queue spikes, ASR benchmark, legal review start, consent-script translation) → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10. Language data collection, legal review, and isiXhosa copywriting run in parallel and gate M2 (copy/consent script), M4 (provider selection), and M10 (pilot).

---

## M0 — Research and risk reduction

**Goal:** Retire the riskiest unknowns before product code depends on them.
**Read first:** `RISK_REGISTER.md`, `OPEN_QUESTIONS.md`, `ASR_BENCHMARK.md`, `MEDIA_STORAGE.md`, ADR-009.
**Scope:**
1. **Cloudinary spike** (throwaway code in `spikes/`, not merged into apps): authenticated audio upload via signed chunked upload; interrupted-upload resume behaviour (OQ-004); eager low-bitrate audio derivative syntax; server-side Range streaming through a signed URL; `destroy` + derived deletion + backup-version deletion (OQ-010); webhook signature scheme; account region (OQ-002); plan feature matrix (OQ-003).
2. **Queue spike:** Graphile Worker `add_job` inside a Drizzle transaction — prove job exists iff commit; rollback leaves no job; `job_key` dedupe (OQ-005).
3. **Railway spike:** EU-region latency from Cape Town mobile networks; Postgres private networking; IaC `railway config plan` on a toy project.
4. **ASR benchmark v0:** recruit and record a first consented slice (≥ 2 h) of Echoes Eval Set; run C1, C2 (baseline only), C3, C4, C5 where accessible; produce report (`ASR_BENCHMARK.md` §6).
5. **Legal review kickoff:** brief counsel with `OPEN_QUESTIONS.md` §Legal.
6. **Language & UX:** consent-script English draft → isiXhosa by two fluent translators; paper prototype test of consent flow with ≥ 5 elders (`USER_JOURNEYS.md` §7).
7. **Discovery interviews** (8–12 families) — learning, not selling.

**Non-goals:** production code; UI beyond paper/clickable prototype.
**Dependencies:** provider accounts; eval participant consent form approved by counsel (or at least reviewed).
**Acceptance criteria:**
- M0-AC1: Spike report answers OQ-002/003/004/005/010 with evidence (logs/screenshots/links), each marked resolved or with a fallback decision.
- M0-AC2: ASR benchmark v0 report exists with real numbers for ≥ 2 candidates, settings, costs, and limitations; provisional provider choice recorded in ADR-005 (or "no candidate passes" decision).
- M0-AC3: isiXhosa consent script v0.1 reviewed by two fluent speakers; prototype comprehension ≥ 4/5 participants on key points.
- M0-AC4: Legal review engaged; list of questions acknowledged; target date for opinions recorded.
**Tests:** spike scripts include assertions (e.g. upload → download hash equality; tx rollback → no job).
**Risks:** participant recruitment delays; provider access (gated models).
**Demo outcome:** short write-up + recorded spike demos; benchmark table.
**Effort:** 3–5 engineer-weeks + external (translators, counsel, participants).
**Review checkpoint:** go/no-go on Cloudinary, Graphile Worker, and ASR provider shortlist.

## M1 — Foundation

**Goal:** A deployable, secure skeleton with auth, policy engine, audit, i18n, and CI.
**Read first:** `ARCHITECTURE.md`, `SYSTEM_DESIGN.md` §1–2, §12–14, `DATA_MODEL.md` §1, §3, §10, `SECURITY_AND_PRIVACY.md` §7–9, `DEVELOPMENT_WORKFLOW.md`, ADR-007/008/009.
**Scope:** pnpm/Turborepo monorepo; strict TS; lint boundaries (`ARCHITECTURE.md` §4); Zod config validation; Drizzle setup + migrations for `users`, `sessions`, `auth_challenges`, `audit_events`, `idempotency_keys`; app/migrator DB roles; Fastify server with plugins (correlation, headers, CSRF, rate limit, session, error mapper); email sign-in (link + code) with fake email provider; `/v1/me`, sessions endpoints; `packages/auth` policy engine skeleton + table-driven matrix test harness; audit hash chain + verifier; Next.js PWA shell with xh/en catalogues and language choice (S-01..S-04, S-10, S-11); OpenTelemetry + structured logging with redaction; `.railway/railway.ts` for staging (web, api, worker stub, postgres); health checks; CI (typecheck, lint, unit, integration with Testcontainers, secret scan, dependency scan, OpenAPI generation).
**Non-goals:** families, stories, media, AI.
**Dependencies:** M0 queue/Railway spikes; OQ-012 (auth library decision), OQ-013 (observability vendor) — provisional defaults allowed.
**Acceptance criteria:**
- M1-AC1: J1-AC1 and J1-AC2 pass in e2e on staging.
- M1-AC2: Unauthenticated access to every non-public route returns 401 (route inventory test).
- M1-AC3: Audit chain verification detects a tampered row in test.
- M1-AC4: Log redaction tests prove forbidden fields never appear.
- M1-AC5: `railway config plan` runs in CI; staging deploy reproducible from repo + variables.
- M1-AC6: Missing `xh` message key fails CI.
**Tests:** unit (session, code hashing, policy core), integration (auth flows with Postgres), contract (auth routes), e2e (sign-in), security (CSRF, headers, rate limits).
**Risks:** auth library fit; IaC maturity.
**Demo outcome:** sign in on a phone in isiXhosa or English; see sessions; sign out everywhere.
**Effort:** 2–3 weeks.

## M2 — Families, storytellers, stories, consent (self)

**Goal:** Create a family circle and story, and capture self consent with evidence-grade records.
**Read first:** `CONSENT_AND_OWNERSHIP.md` (all), `MACHINE.md` §1, §10, §11, §14, §15, `DATA_MODEL.md` §3–4, `USER_JOURNEYS.md` J1, J2, J13.
**Scope:** families, memberships, invitations; persons; stories (draft, private); story roles; consent scripts (seeded v1 xh/en with human-recorded audio), consent records + scope grants, comprehension check; custodian designation + invitation; storyteller account linking; screens S-12..S-15, S-20..S-24, S-26; privacy notice page (xh/en).
**Non-goals:** assisted verbal evidence capture (needs media — M3), recording.
**Dependencies:** M1; consent script approved by fluent reviewers (M0-AC3); counsel's initial view on consent wording (may be provisional).
**Acceptance criteria:** F02, F03, F04, F05, F07 AC (`FEATURE_CATALOG.md`); J2-AC1 (as "recording blocked" API check), J2-AC2, J2-AC4, J2-AC5, J2-AC6; J13-AC2; DB constraints from `DATA_MODEL.md` §12 for consent.
**Tests:** consent state machine (all transitions + forbidden ones), policy matrix rows for families/stories/consent, invitation expiry, a11y (axe + keyboard) on consent screens, e2e consent journey (self).
**Risks:** consent UX length for elders; legal wording changes.
**Demo outcome:** storyteller consents on their own phone; summary screen in isiXhosa; recorder sees "Ready to record".
**Effort:** 2–3 weeks.

## M3 — Recording, upload, verification, playback, assisted consent

**Goal:** Capture audio reliably on poor connections and keep it safe.
**Read first:** `MEDIA_STORAGE.md`, `SYSTEM_DESIGN.md` §6–8, `MACHINE.md` §2, `API_CONTRACTS.md` §3.4, §3.10, §3.11, `USER_JOURNEYS.md` J3, J4.
**Scope:** `MediaStorageProvider` + fake + Cloudinary adapters; recording UI with IndexedDB buffering, recovery; file upload; hashing worker; upload session API; webhook; `/complete`; `media.verify` job (Graphile Worker setup + `processing_jobs` + task wrapper with consent gate); playback rendition; stream proxy; assisted verbal consent evidence capture (S-25) — completes F06; abandoned-upload maintenance task.
**Non-goals:** ASR.
**Dependencies:** M0 Cloudinary spike outcomes; M2.
**Acceptance criteria:** F06, F08–F12 AC; J2-AC3; J3-AC1..3; J4-AC1..3; J10-AC2 (stream with Range on throttled network); TH-06, TH-07, TH-08 tests pass.
**Tests:** fake-adapter integration tests (upload → verify → stream), chunk-resume e2e with network throttling (Playwright), webhook forgery, hash mismatch, corrupt file, consent-withdrawn-before-verify cancellation, no provider URLs in API responses.
**Risks:** Safari `MediaRecorder` quirks; resume support (OQ-004 fallback).
**Demo outcome:** record 5 minutes on a throttled phone connection, kill the tab mid-upload, reopen, finish, play back.
**Effort:** 3–4 weeks.

## M4 — Processing pipeline and isiXhosa ASR

**Goal:** Durable, consent-gated, budgeted transcription with honest uncertainty.
**Read first:** `AGENT_DESIGN.md` §1–3, `AI_PROVIDER_STRATEGY.md`, `SYSTEM_DESIGN.md` §4–5, §11, `MACHINE.md` §3, §6, ADR-005, ADR-006.
**Scope:** `AsrProvider` interface, fake adapter, adapter for the M0-selected provider; audio prep/chunking/stitching; segments; uncertainty heuristics + calibrated thresholds from M0; `model_runs`; `job_step_results`; budgets (`ai_usage_daily`); circuit breaker; processing status UI (S-40); admin failed-jobs view (content-free).
**Non-goals:** review UI; context assistant; translation.
**Dependencies:** M0 provider decision (ADR-005 updated); M3.
**Acceptance criteria:** F13, F14, F33 AC; F27-AC (ASR cancelled on withdrawal); J5-AC1, J5-AC2; idempotent rerun creates no duplicates; no content in logs (staging log audit).
**Tests:** job wrapper (consent at enqueue/start/checkpoint), retries and permanent failures, chunk stitching with overlap fixtures, hallucination heuristics fixtures, provider adapter contract tests on recorded responses, budget exhaustion, evaluation regression on dev set (L3) for the chosen settings.
**Risks:** ASR quality below gates (R-01) → fall back per `ASR_BENCHMARK.md` §7.
**Demo outcome:** upload a consented test story; watch status; open raw machine transcript with flags (admin/dev view in staging).
**Effort:** 3–4 weeks.

## M5 — Transcript review, cultural context flags, glossary, approval

**Goal:** Reviewers can turn a machine draft into an approved transcript without technical help.
**Read first:** `AGENT_DESIGN.md` §4, `MACHINE.md` §3–5, `USER_JOURNEYS.md` J6, J7, `API_CONTRACTS.md` §3.5–3.7.
**Scope:** reviewer invitations (F34); review UI S-50..S-53 with segment playback, edits, revisions, split/merge, flags navigation and resolution, accept-as-uncertain; optimistic concurrency; context-assist job + glossary matcher; family glossary S-16 with approval; content-free notifications (F35); approve for translation.
**Non-goals:** translation.
**Dependencies:** M4.
**Acceptance criteria:** F15–F18, F34, F35 AC; J6-AC1..4; J7-AC1, J7-AC2; usability test with ≥ 5 reviewers: ≥ 4/5 complete review without help.
**Tests:** segment/flag state machines, concurrency conflict, policy matrix for reviewer roles, context-role "no text change" test, injection fixtures, a11y on review screens, e2e review → approval.
**Risks:** reviewer fatigue from too many flags (tune thresholds).
**Demo outcome:** an aunt reviews a 10-minute story on her phone, resolves flags, and the storyteller (or custodian) approves it.
**Effort:** 3–4 weeks.

## M6 — Translation, verification, translation review

**Goal:** Faithful, reviewable English from approved transcripts only.
**Read first:** `AGENT_DESIGN.md` §5–6, `TRANSLATION_EVALUATION.md`, `MACHINE.md` §7–8, `USER_JOURNEYS.md` J8.
**Scope:** `TextModelProvider` + fake + selected adapter; translation job (close + natural; batch with context); verifier (deterministic + model); verification report UI; translation review S-60/S-61; approve/reject.
**Non-goals:** back-translation; multiple target languages.
**Dependencies:** M5; translation model choice from M0/M6 evaluation.
**Acceptance criteria:** F19–F21 AC; J8-AC1, J8-AC2; translation from non-approved transcript blocked at DB and service (test); seeded-defect verifier recall meets provisional targets on dev set.
**Tests:** trigger test, alignment completeness, marker preservation, verifier deterministic checks, injection fixtures, e2e translation review.
**Risks:** translation quality (R-02).
**Demo outcome:** bilingual reviewer approves an English translation with names preserved and an unclear part honestly marked.
**Effort:** 2–3 weeks.

## M7 — Final approval, reader, sharing

**Goal:** The storyteller's approved story, readable and listenable by exactly the right people.
**Read first:** `CONSENT_AND_OWNERSHIP.md` §4, §5, §8, `MACHINE.md` §1, §9, §11, `USER_JOURNEYS.md` J9–J11.
**Scope:** story versions (incl. isiXhosa-only, FR-FIN-03); preview S-70/S-71; reader S-80 with synced audio, provenance panel; sharing S-90/S-91 (private/family), viewer roles; custodian assisted confirmation for widening; public sharing UI hidden behind flag.
**Non-goals:** public sharing.
**Dependencies:** M6.
**Acceptance criteria:** F22–F24, F26 AC; J9-AC1, J9-AC2; J10-AC1, J10-AC2; J11-AC1, J11-AC2; `FEATURE_PUBLIC_SHARING=true` in production refused at startup.
**Tests:** audience machine, policy matrix for viewers/family members, revocation-on-next-request test, reader a11y, e2e full trust workflow (consent → approval → family share → revoke).
**Demo outcome:** **the complete Release 1 trust workflow end to end** on staging with synthetic/consented data.
**Effort:** 2–3 weeks.

## M8 — Withdrawal, deletion, export, account closure, activity log

**Goal:** The storyteller can change their mind and leave, with verifiable outcomes.
**Read first:** `RETENTION_AND_DELETION.md`, `CONSENT_AND_OWNERSHIP.md` §7, `MACHINE.md` §12–13, `USER_JOURNEYS.md` J12, J13.
**Scope:** withdrawal propagation job; deletion requests (window, cancel, immediate); deletion pipeline with targets, Cloudinary deletion incl. backups, tombstones, offsite ledger, certificate; export builder + download; account closure; activity log UI (S-95).
**Non-goals:** legal holds UI.
**Dependencies:** M7; M0 deletion spike outcomes.
**Acceptance criteria:** F27–F31 AC; J12-AC1..3; J13-AC1; post-deletion scan finds no rows/assets for the story; restore drill with ledger replay removes a deleted story from a restored backup.
**Tests:** deletion idempotency, partial-failure retries, ledger replication, export expiry, account closure blocked cases, e2e change-my-mind journey.
**Risks:** provider deletion API limits; backup deletion semantics (OQ-010).
**Demo outcome:** request deletion, cancel, request again with immediate deletion, show certificate; show restored backup cleaned by replay.
**Effort:** 2–3 weeks.

## M9 — Production hardening and pilot readiness

**Goal:** Safe to put real families' stories in.
**Read first:** `SECURITY_AND_PRIVACY.md`, `THREAT_MODEL.md`, `OBSERVABILITY.md`, `DEPLOYMENT.md`, `DEFINITION_OF_DONE.md`.
**Scope:** admin operations S-A1 and break-glass S-A2 (F32) with second factor for admins; ASVS L2 review; DAST baseline; dependency audit; accessibility audit (manual screen-reader pass); performance and cost test (60-minute recordings, 10 concurrent stories); production Railway environment via IaC; backups (daily/weekly, PITR), offsite dumps, restore drill; alerting; incident runbook (xh/en templates); provider data-controls checklist complete; legal sign-off checkpoint on consent script, privacy notice, DPAs, cross-border basis.
**Non-goals:** new features.
**Acceptance criteria:**
- M9-AC1: All R1 features meet `DEFINITION_OF_DONE.md`.
- M9-AC2: No open High/Critical findings from ASVS review/DAST.
- M9-AC3: Restore drill RTO/RPO recorded and within targets.
- M9-AC4: Legal checkpoint: counsel's written view on OQ-014/015/019/022/023 received; any blocking issues resolved or pilot scope adjusted.
- M9-AC5: Production configuration checklist (`DEPLOYMENT.md` §8) complete and signed off by two people.
**Demo outcome:** pilot-readiness review.
**Effort:** 2–3 weeks.

## M10 — Release 1 closed pilot

**Goal:** Learn with 5–10 families while keeping every promise.
**Scope:** onboarding with a facilitator; support channel; weekly metrics (`PRD.md` §6); diary study and interviews; weekly risk review; bug fixes only (no new features without spec change).
**Acceptance criteria:** pilot metrics collected; zero privacy incidents (or incidents handled per §14 of `SECURITY_AND_PRIVACY.md`); retrospective with decisions for R2.
**Effort:** ongoing, ~6–8 weeks of operation (assumption).

---

## Milestone summary

| Milestone | Effort (eng-weeks) | Demo outcome |
|---|---|---|
| M0 | 3–5 (+ external) | Spike + benchmark report |
| M1 | 2–3 | Bilingual sign-in |
| M2 | 2–3 | Self consent |
| M3 | 3–4 | Resilient recording + playback |
| M4 | 3–4 | Machine transcript with flags |
| M5 | 3–4 | Reviewed, approved transcript |
| M6 | 2–3 | Reviewed translation |
| M7 | 2–3 | **Full trust workflow** |
| M8 | 2–3 | Change-my-mind + deletion |
| M9 | 2–3 | Pilot readiness |
| **Total to pilot** | **24–35** | |
