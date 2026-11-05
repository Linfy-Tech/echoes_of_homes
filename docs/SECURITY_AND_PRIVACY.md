# Security and Privacy

**Authority:** Rank 1. **Not legal advice.** Controls documented here do **not** by themselves make the product POPIA-compliant. Items marked **LEGAL REVIEW** are collected in `OPEN_QUESTIONS.md` §Legal.

---

## 1. Security baseline

- Verification baseline: **OWASP ASVS 4.x/5.x Level 2** for `api` and `web` (version chosen in M1; checklist tracked in `tests/security/README.md`).
- Secure-by-default: deny by default, fail closed, least privilege, defence in depth.
- Every security-relevant rule has an automated test (`TEST_STRATEGY.md` §6).

## 2. Data inventory and classification

| Data | Class | Notes |
|---|---|---|
| Story audio (original, playback) | **Restricted** | Voice + life story; may contain special personal information of storyteller and third parties |
| Consent evidence audio | **Restricted** | |
| Transcript / translation text | **Restricted** | |
| Story title, description | **Restricted** (encrypted columns) | Can reveal content |
| Storyteller / person names | **Restricted** (encrypted) | |
| Family glossary (clan names, praise names) | **Restricted** | Kinship/clan data |
| User email | **Confidential** (encrypted + lookup hash) | |
| Consent records (scopes, timestamps) | **Confidential** | |
| Audit events | **Confidential** | Content-free by design |
| Operational metrics, job states, IDs | **Internal** | |

**Voice and biometrics.** POPIA's definition of biometrics includes "voice recognition" as a technique of personal identification **[VERIFIED S25]**. Echoes of Home **does not perform speaker identification, voice recognition, voiceprints, or speaker embeddings**, and never synthesises voices. Diarisation (who-spoke-when without identity) is **not** used in R1. Whether storing recordings of a voice constitutes processing biometric (special) information is a **LEGAL REVIEW** item (OQ-023). Adding any speaker-identification feature requires an ADR, legal review, and separate consent.

## 3. POPIA — control mapping (to be validated by legal review)

POPIA sets out conditions for lawful processing (accountability, processing limitation, purpose specification, further processing limitation, information quality, openness, security safeguards, data subject participation). Section references below are from the structure of the Act; operative wording must be confirmed by counsel (UNVERIFIED except where cited).

| Condition / topic | Our controls | Status |
|---|---|---|
| Accountability | Information Officer designated (founder by default; registration with the Information Regulator — s55 — **LEGAL REVIEW**); this doc set; DPIA-style review before pilot | Planned (M9) |
| Processing limitation / consent | Granular scopes, informed explanation, evidence, withdrawal at any time (`CONSENT_AND_OWNERSHIP.md`); consent defined as voluntary, specific, informed **[VERIFIED S25]** | Designed |
| Purpose specification | Purposes = preserve, transcribe, review, translate, share within family. Stated in consent script and privacy notice | Designed |
| Further processing | No training, no analytics on content, no marketing use; any new purpose requires new consent | Designed |
| Information quality | Human review and correction of transcripts; storyteller can request corrections | Designed |
| Openness | Privacy notice in isiXhosa + English; processor list; region disclosure | Planned (M2) |
| Security safeguards (s19) | This document | Designed |
| Operators (s20–21: written contract, security measures) | DPAs with Railway, Cloudinary, OpenAI/Nebius/other AI providers, email and observability vendors; verify each provider's DPA terms (**LEGAL REVIEW**, OQ-014) | Open |
| Security compromise notification (s22) | Incident plan (§14): notify Information Regulator through the **mandatory eServices portal** and affected data subjects in writing, "as soon as reasonably" sure a compromise occurred **[VERIFIED S27]** | Designed |
| Data subject participation (s23–25: access, correction) | Export (access), review/correction requests, activity log | Designed |
| Special personal information (s26–33) | Stories may contain religious beliefs, health, ethnic origin, etc. of storyteller and third parties; consent-based processing; private by default — **LEGAL REVIEW** (OQ-023) | Open |
| Children (s34–35) | Under-18 storytellers excluded in R1 | Designed |
| Direct marketing (s69) | No marketing messages; transactional emails only | Designed |
| Cross-border transfers (s72) | See §6 | Open |

## 4. Data minimisation

- Collected: email, display name, UI language, storyteller display name + preferred language, optional storyteller contact email, adult attestation (boolean), consent data, story content.
- **Not collected:** date of birth, ID numbers, phone numbers (R1), precise location, contacts, device identifiers, advertising IDs, third-party analytics/trackers.
- IP addresses: used transiently for rate limiting as HMAC hashes, purged within 24 h; not stored with audit events (audit stores actor user ID).
- No product analytics SDKs in R1. Operational metrics only (`OBSERVABILITY.md`).

## 5. Encryption

| Layer | Control |
|---|---|
| In transit (client) | HTTPS only; HSTS (1 year, includeSubDomains after domain review); TLS from Railway edge |
| In transit (internal) | Railway private network is WireGuard-encrypted **[VERIFIED S15]**; DB connections over private network (TLS additionally if supported — verify, OQ-008) |
| In transit (providers) | HTTPS to Cloudinary and AI providers |
| At rest (DB) | Railway volume encryption status **UNVERIFIED** (OQ-008); application-layer AES-256-GCM for 🔒 columns (`DATA_MODEL.md`) with key IDs for rotation |
| At rest (media) | Cloudinary storage encryption status **UNVERIFIED** (OQ-002/OQ-008) |
| At rest (offsite dumps) | Encrypted before upload with a key not stored in Railway |
| Browser local data | IndexedDB recording buffers are plain browser storage; mitigated by deleting after verification and "Remove from this phone"; shared-device risk disclosed (R-15) |

## 6. Processors and cross-border transfers

Railway has no Africa region **[VERIFIED S12]**; every data flow leaves South Africa.

| Processor | Data | Region | Retention / training | Status |
|---|---|---|---|---|
| Railway | All DB data, transient media in worker | EU West (Amsterdam) — chosen | Our control; backups per §RAILWAY | DPA: verify |
| Cloudinary | Audio, consent evidence, exports | **UNVERIFIED** (OQ-002) | Until deleted; backups until backup versions deleted **[S10]** | DPA: verify |
| OpenAI (if selected) | Audio chunks, glossary hints, transcript/translation text | US or EU regional processing for transcription **[VERIFIED S4]** | Not used for training by default; abuse-monitoring logs up to 30 days unless ZDR/MAM **[VERIFIED S4]**; transcription endpoint ZDR-eligible with approval **[VERIFIED S4]** | Apply for ZDR or MAM (OQ-006) |
| Nebius Token Factory (if selected) | Transcript/translation text | Public endpoints "Global" (location can change); dedicated endpoints regional **[VERIFIED S16]** | Without ZDR, inputs/outputs retained (stored in Finland) for speculative decoding; ZDR org-wide; no training **[VERIFIED S16]** | Enable ZDR; prefer dedicated endpoint for production |
| Self-hosted ASR (if selected) | Audio chunks | Region of GPU host | Our control | Host TBD |
| Email provider | Email addresses, content-free notifications | TBD (OQ-012) | Provider policy | — |
| Observability vendor | Content-free telemetry | TBD (OQ-013) | Provider policy | — |

POPIA s72(1) permits transfers if (a) the recipient is subject to law/binding rules/agreement providing adequate protection, (b) the data subject consents, (c)/(d) contract necessity, or (e) benefit where consent is impracticable **[VERIFIED S26]**. **RECOMMENDATION:** rely on (a) via DPAs/adequate jurisdictions **and** obtain explicit `cross_border_processing` consent (b) as a second basis, with the processor list shown in the consent explanation. **LEGAL REVIEW** (OQ-014).

## 7. Authentication and session security

- Email one-time link/code (FR-AUTH-01); codes 6 digits, 10-minute expiry, 5 attempts, hashed at rest; links single-use.
- Opaque session tokens (≥ 256-bit random), stored hashed with pepper; cookie `HttpOnly; Secure; SameSite=Lax`; absolute expiry 30 days, idle expiry 7 days (configurable); rotation on sign-in; revoke-all.
- CSRF: Origin allow-list + custom header for unsafe methods.
- Account enumeration resistance: identical responses and timing for unknown emails.
- Admin accounts: mandatory second factor (passkey or TOTP) before admin routes — R1 requirement for `platform_admin` even though passkeys for members are R2.
- Library choice (OQ-012): adopt a maintained session/auth library or implement the minimal flows with vetted primitives; either way the rules above are binding.

## 8. Audit events

Written in the same transaction as the change; append-only; HMAC hash chain (`DATA_MODEL.md` §10). Catalogue (R1):

`auth.sign_in`, `auth.sign_out`, `auth.sessions_revoked`, `family.created`, `family.member_invited`, `family.member_joined`, `family.member_removed`, `person.created`, `person.account_linked`, `story.created`, `story.metadata_updated`, `story.role_granted`, `story.role_revoked`, `consent.created`, `consent.scope_granted`, `consent.scope_revoked`, `consent.withdrawn`, `custodian.designated`, `custodian.accepted`, `custodian.revoked`, `recording.created`, `recording.verified`, `recording.failed`, `media.original_accessed` (export/original stream), `transcript.generated`, `transcript.review_completed`, `transcript.approved`, `flag.accepted_as_uncertain`, `translation.generated`, `translation.approved`, `translation.rejected`, `verification.issue_dismissed`, `story_version.approved`, `story.audience_changed`, `deletion.requested`, `deletion.cancelled`, `deletion.executed`, `deletion.completed`, `export.requested`, `export.downloaded`, `admin.job_retried`, `admin.break_glass_granted`, `admin.break_glass_content_read`, `account.closed`, `security.authz_denied_burst` (aggregated).

Audit metadata contains IDs and state names only. Verification job checks the hash chain daily and alerts on breaks.

## 9. Logging, tracing, error reporting

- Structured JSON logs with `correlationId`, `userId` (UUID), `storyId` (UUID), route, status, duration, error code.
- **Forbidden in logs/traces/errors:** audio bytes, URLs to media, transcript/translation text, titles, names, emails, glossary terms, consent evidence, prompts, model completions, request/response bodies of content routes, cookies, tokens, signatures.
- Enforcement: a logger redaction layer with an allow-list of fields; error-reporting `beforeSend` scrubber; unit tests that assert redaction; a CI grep for `console.log` in server code.
- OpenTelemetry: span attributes limited to an allow-list; no HTTP body capture.

## 10. Rate limiting and abuse prevention

- Per-route buckets (`API_CONTRACTS.md` §1.7); exponential lockout on repeated failed codes.
- Upload size/duration caps; per-user daily upload cap (configurable).
- AI budget caps (FR-COST-01) prevent cost-amplification abuse.
- Invitation limits per day per user.
- Public endpoints (R3) will need bot protection and abuse reporting — out of R1 scope.

## 11. Prompt injection and untrusted content

Sources of untrusted content: ASR output (speech can contain instructions), user-entered titles/descriptions, glossary entries, uploaded file metadata.

Controls (`AGENT_DESIGN.md` §1): minimal inputs; delimited data blocks; no tools; structured outputs with deterministic validation (IDs, substrings, enums, lengths); outputs only create suggestions; no model output reaches authorisation, consent, audience, or deletion code paths; output rendered as text (React escaping; no `dangerouslySetInnerHTML`); file metadata (ID3 tags etc.) ignored and stripped from derivatives where possible.

## 12. Secrets management

- Railway variables per service and environment; never in code, docs, tests, or logs. `.env.example` placeholders only.
- CI secret scanning (e.g. gitleaks) on every PR; pre-commit hook recommended.
- Rotation: documented per secret (`DEPLOYMENT.md` §6); rotate immediately on suspected exposure and on team member departure.
- Field-encryption keyring supports multiple key IDs; re-encryption job for rotation (R2).

## 13. Administrative access

- Platform admins have no content access by default (FR-ADM-01); admin views are built from content-free projections.
- Break-glass (FR-ADM-02): reason, ≤ 60 min, audit, rights-holder notification, weekly review of all grants.
- Production DB tunnel access: two named people; every session logged in an ops log; prefer `eoh_readonly` role.
- Provider consoles (Cloudinary, OpenAI, Railway): 2FA, least-privilege members, no shared logins.

## 14. Incident response and breach handling

1. **Detect & triage** (alerts, reports) → severity (SEV1 = possible exposure of Restricted data).
2. **Contain** (revoke sessions/keys, disable feature flags, block routes).
3. **Assess** what data, whose, how many, which processors.
4. **Notify:** POPIA s22 — notify the Information Regulator and affected data subjects as soon as reasonably possible after becoming reasonably sure a compromise occurred; reporting to the Regulator is mandatory through the **eServices portal**; notifications include what happened, mitigation steps, advice to data subjects, and who accessed the data if known; data subjects notified in writing (email/letter/website notice) **[VERIFIED S27]**. Operators must notify us immediately **[VERIFIED S27]** — require this in DPAs.
5. **Recover & review:** blameless post-mortem within 5 working days; update threat model and tests.

Runbook with contacts and templates (isiXhosa + English): `infrastructure/railway/README.md` → incident section (written in M9).

## 15. Data subject rights (operational)

| Right | Mechanism |
|---|---|
| Access | Export (FR-EXP-01); account data view |
| Correction | Transcript/translation correction via review; metadata edit; correction request to rights holder |
| Deletion | Deletion pipeline (`RETENTION_AND_DELETION.md`) |
| Objection / withdrawal | Consent withdrawal (FR-WDR-01) |
| Complaint | Contact the Information Officer; right to complain to the Information Regulator stated in privacy notice |

## 16. Security testing

See `THREAT_MODEL.md` (threats → controls → tests) and `TEST_STRATEGY.md` §6 (authorisation matrix, consent gates, injection, headers, dependency scanning, DAST against staging before pilot).
