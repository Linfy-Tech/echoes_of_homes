# Threat Model

Method: assets → actors → trust boundaries → STRIDE threats → controls → tests. Review at every milestone that changes a boundary, and before each release.

## 1. Assets

A1 story audio · A2 consent evidence · A3 transcripts/translations · A4 names/glossary (clan, praise names) · A5 consent records · A6 sessions/credentials · A7 provider secrets · A8 audit log integrity · A9 availability of originals (irreplaceable) · A10 storyteller autonomy (freedom from coercion).

## 2. Threat actors

| Actor | Motivation / capability |
|---|---|
| T1 Curious or controlling family member | Wants to hear/read a story without permission; may pressure an elder to consent or share |
| T2 Former family-circle member | Retains old links/sessions |
| T3 External attacker | Credential stuffing, phishing, API abuse, scraping |
| T4 Malicious uploader | Uploads malware/oversized/crafted files; prompt-injection content |
| T5 Insider (platform admin / developer) | Curiosity, mistakes, compromised laptop |
| T6 Compromised third-party processor | Breach at media/AI/email/observability vendor |
| T7 AI model misbehaviour | Hallucination, injection-driven output, over-confident translation |
| T8 Device thief / shared device user | Access to an unlocked phone with an active session or local buffers |

## 3. Trust boundaries

B1 browser ↔ API · B2 browser ↔ Cloudinary (direct upload) · B3 API/worker ↔ Postgres · B4 worker ↔ AI providers · B5 API/worker ↔ Cloudinary · B6 model output ↔ application · B7 admin ↔ production · B8 CI/CD ↔ production.

## 4. Threats and controls

| ID | Boundary | STRIDE | Threat | Controls | Test |
|---|---|---|---|---|---|
| TH-01 | B1 | S | Session theft via XSS | React escaping, strict CSP (no inline script; nonce-based), HttpOnly cookies, no `dangerouslySetInnerHTML` | CSP header test; XSS payload fixtures in transcript text render inert |
| TH-02 | B1 | S | Credential stuffing / code brute force | Email codes only (no passwords), 5 attempts, rate limits, uniform responses | Rate-limit integration tests |
| TH-03 | B1 | E | IDOR: access another family's story by ID | `assertCan` on every route; 404 for unknown; UUIDv7 (not a control alone) | Authorisation matrix tests per route; fuzz IDs |
| TH-04 | B1 | E | Family member (T1) reads unapproved transcript | Policy: family members see approved versions only | Matrix test: family member + `in_review` → 404 |
| TH-05 | B1 | E | Removed member (T2) keeps access | Per-request membership check; no auth caching | Remove member → immediate 404 test |
| TH-06 | B2 | T | Client alters upload params (public type, different public_id) | Signature covers all params; server-side param generation; startup assertion `type=authenticated` | Contract test: tampered params rejected by provider (staging) / fake adapter |
| TH-07 | B2 | I | Leaked media URL grants permanent access | No provider URLs reach clients; proxy stream with per-request authz **[S8]** | Response-scan test: no `res.cloudinary.com` URLs in any API response |
| TH-08 | B5 | S | Forged media webhook marks recording uploaded | Signature + timestamp check + dedupe; worker re-verifies hash | Webhook forgery test |
| TH-09 | B4/B6 | T | Prompt injection in speech/titles alters outputs | Data delimiting, no tools, schema + substring validation, suggestions only | Injection fixture suite (`tests/security/prompt-injection/`) |
| TH-10 | B6 | T | Model invents names/meaning presented as fact | Flags only; translator preserves terms; verifier checks; human approval | Evaluation hallucination tests |
| TH-11 | B3 | T | Tampering with audit log | App role lacks UPDATE/DELETE; HMAC chain; daily verification | DB privilege test; chain-break test |
| TH-12 | B3 | I | SQL injection | Drizzle parameterised queries; no string-built SQL; lint rule for raw SQL usage review | Static check + injection tests on search/filter params |
| TH-13 | B4 | I | Provider retains or trains on content | Provider settings (no training default **[S4][S16]**), ZDR applications, DPAs, minimal inputs | Config checklist in release gate |
| TH-14 | B7 | I | Admin browses stories | No content in admin projections; break-glass with audit + notification | Admin API response tests; break-glass audit test |
| TH-15 | B8 | E | Malicious dependency / CI secret theft | Lockfile, `pnpm audit`/OSV scan, pinned actions by SHA, minimal CI secrets, no prod secrets in CI | CI policy checks |
| TH-16 | B1 | D | Upload or AI cost amplification | Size/duration caps, upload rate limits, AI budgets | Budget enforcement tests |
| TH-17 | B1 | R | User denies having consented | Consent evidence, script hash, audit events | Consent record completeness test |
| TH-18 | — | E | Coercion of elder (T1) during assisted consent | "You can say no" card, comprehension check, evidence audio, storyteller can later revoke; pilot facilitator guidance | Usability validation; content review of script |
| TH-19 | B1 | I | Shared device exposes stories (T8) | Session list + sign out, idle timeout, no story content in Cache Storage, "Remove from this phone" | Service-worker cache test |
| TH-20 | B5 | D | Loss of originals (provider incident/accidental delete) | Cloudinary backups **[S10]**, hash records, deletion only via pipeline, R3 independent copy | Restore drill |
| TH-21 | B3 | D | Accidental volume wipe deletes native backups **[S11]** | Offsite encrypted dumps, restricted prod access | Restore-from-offsite drill |
| TH-22 | B4 | I | Logs/traces leak content to observability vendor | Redaction allow-list, scrubbers, no body capture | Log redaction unit tests; staging log audit |
| TH-23 | B1 | T | Malicious audio file (parser exploits in ffmpeg) | Worker runs ffmpeg as non-root, time/memory limits, up-to-date ffmpeg, only probe/convert known codecs | Fuzzed/corrupt file fixtures |
| TH-24 | B1 | I | Email notifications reveal content | Content-free templates | Template snapshot tests |
| TH-25 | B1 | E | Custodian over-reaches (shares beyond storyteller intent) | Scopes bound custodian; assisted confirmation for widening; storyteller sees activity and can revoke | Policy tests for custodian |
| TH-26 | — | I | Restored backup resurrects deleted stories | Deletion ledger replay mandatory before go-live | Restore drill includes ledger replay |

## 5. Security test plan (summary)

| Activity | When |
|---|---|
| Authorisation matrix tests (all routes × roles × key states) | Every PR touching routes/policy |
| Consent-gate tests (enqueue + start + checkpoint) | Every PR touching jobs/consent |
| Prompt-injection fixture suite | Every PR touching `agent-workflows` |
| Dependency + secret scanning | Every PR |
| Security headers / CSP check | Every PR touching web/api config |
| DAST (e.g. OWASP ZAP baseline) against staging | Before each release |
| Manual review against ASVS L2 checklist | M9 and before R1 pilot |
| External penetration test | Before public sharing (R3) — recommended before pilot if budget allows (OQ-026) |
| Restore + ledger replay drill | Monthly and before releases |
