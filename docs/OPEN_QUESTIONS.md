# Open Questions

Undecided items. **Do not implement behaviour that depends on an open question** unless the milestone explicitly says to implement the provisional default. When resolved: record the answer, date, and evidence; update the affected docs/ADRs; mark `Resolved`.

Legend — **Owner:** F = founder/product owner, E = engineering, L = legal counsel, X = language advisors. **Needed by:** milestone that blocks.

## Needs your input (decisions only the product owner can make)

| ID | Question | Provisional recommendation | Needed by |
|---|---|---|---|
| OQ-020 | What is the acceptable AI + media cost per audio minute (pilot budget)? | Set a pilot cap (e.g. a monthly total) after M0 benchmark prices are known | M4 |
| OQ-021 | Business model: free pilot; later family subscription, institutional partnerships, or grants? Affects terms and data roles | Free closed pilot; decide after pilot learning; never ads or data sales | M10 |
| OQ-031 | Which legal entity is the "responsible party" (Linfy Tech Solutions?) and who is the Information Officer? Registration with the Information Regulator? | Linfy Tech Solutions as responsible party; founder as Information Officer; confirm registration with counsel | M9 |
| OQ-032 | Team capacity and target pilot window (to turn effort ranges into a schedule) | Plan milestone by milestone; re-estimate at each checkpoint | M1 |
| OQ-033 | Production domain name and sender email domain | Use a Linfy Tech–controlled domain; separate subdomains `app.` and `api.` | M1 |
| OQ-018 | Budget and recruitment for fluent isiXhosa reviewers, translators, and a language-community advisor | Contract 2 translators + 1 advisor for M0–M2; pay pilot reviewers | M0 |
| OQ-026 | External penetration test before the closed pilot? | Yes if budget allows; mandatory before public sharing (R3) | M9 |
| OQ-015a | Deletion cancellation window: 72 hours? | 72 h with "delete now" option after re-confirmation | M8 |

## Legal (requires qualified South African counsel)

| ID | Question | Why it matters | Provisional position | Owner | Needed by | Status |
|---|---|---|---|---|---|---|
| OQ-014 | Lawful basis and contracts for cross-border transfers (s72) to Railway (EU), Cloudinary (region TBC), AI providers; adequacy of each provider's DPA as an operator agreement (s20–21) | No SA hosting region **[S12]** | Rely on s72(1)(a) via DPAs + explicit consent (s72(1)(b)) **[S26]** | L | M9 (wording by M2) | Open |
| OQ-015 | Retention: is a 35-day backup residual window acceptable? Must consent evidence be kept after story deletion to evidence lawful processing? Legal-hold process? | Deletion promises in consent script | 35 days disclosed; evidence deleted with story unless counsel advises otherwise | L | M8 | Open |
| OQ-019 | Copyright in oral works and recordings; who owns what (storyteller vs recorder); IK Act 6 of 2019 **[S28]** applicability to clan praises/communal histories; moral rights | Terms of service; public sharing; exports | Storyteller owns; platform gets limited service licence; public sharing deferred | L | M9 (R3 for public) | Open |
| OQ-022 | Do incidental speakers (recorder, relatives) need their own consent? | Their voices are in originals | Inform + recorder confirmation; exclusion of segments; counsel to confirm | L | M3 | Open |
| OQ-023 | Special personal information (s26) in stories about storyteller/third parties; does storing voice recordings constitute biometric information given the definition includes "voice recognition" **[S25]**? | Lawful basis; safeguards | Consent-based; no voice recognition performed; private by default | L | M9 | Open |
| OQ-034 | Consent wording validity: does assisted verbal consent with evidence audio satisfy "voluntary, specific and informed" **[S25]** for elders? Requirements for illiterate data subjects? | Core flow | Assisted protocol as specified in `CONSENT_AND_OWNERSHIP.md` §3.1 | L | M2 | Open |
| OQ-035 | Rules for minors (s34–35) and adults lacking capacity, for future releases | R3 scope | Excluded in R1 | L | R3 | Open |

## Technical

| ID | Question | Provisional position | Owner | Needed by | Status |
|---|---|---|---|---|---|
| OQ-001 | Does OpenAI `gpt-transcribe` accept/handle isiXhosa (`xh`) language hints, and how well? Model page doesn't list languages **[S3]** | Test empirically in M0 benchmark | E | M0 | Open |
| OQ-002 | Cloudinary account storage/processing region; non-US options on our plan; at-rest encryption | Ask Cloudinary sales/support; record in ADR-003 | E | M0 (disclosure text M2) | Open |
| OQ-003 | Which Cloudinary plan? Token-based expiring delivery needs Advanced plan or higher **[S8]** | Start on the lowest plan that supports authenticated delivery + backups; proxy streaming | F/E | M0 | Open |
| OQ-004 | Can Cloudinary chunked uploads resume after interruption with the same `X-Unique-Upload-Id`, and across a refreshed signature? | Spike; fallback = restart from local data | E | M0 | Open |
| OQ-005 | Graphile Worker `add_job` inside Drizzle transaction: atomic with commit/rollback? Pool/connection interplay | Spike test | E | M0 | **Resolved for the tested scope.** The M0 queue spike proved commit/rollback atomicity and `job_key` dedupe on one transaction-scoped connection. Application enqueue services, worker task registration, retries, consent gates, and production version pinning remain implementation work in the durable M4/M6 wiring slice, not unresolved queue semantics. |
| OQ-006 | Apply for OpenAI Zero Data Retention or Modified Abuse Monitoring (requires approval **[S4]**)? | Apply before pilot; otherwise disclose 30-day retention | F/E | M9 | Open |
| OQ-007 | If Agents SDK adopted later: tracing defaults and whether SDK calls use only ZDR-eligible endpoints | Not used in R1 | E | R2 | Deferred |
| OQ-008 | Railway volume encryption at rest; TLS on private network for Postgres | Ask Railway / docs; app-level encryption for sensitive columns regardless | E | M1 | Open |
| OQ-009 | Encrypt transcript/translation text columns at application level? | Not in R1 (review UX, constraints); revisit R4 | E | R4 | Deferred |
| OQ-010 | Does `destroy` remove eager derivatives? What remains after deleting backup versions of a reserved public ID **[S10]**? | Explicit derived + backup deletion regardless; confirm with support | E | M0 | Open |
| OQ-011 | Phone/WhatsApp OTP sign-in: cost, SIM-swap risk, provider | Defer to R3 | F/E | R3 | Deferred |
| OQ-012 | Auth library, email-OTP flow, and session store | Founder selected Better Auth + email-OTP plugin + Postgres sessions on 2026-11-05; see ADR-010. Storage compatibility resolved in OQ-039; live email vendor is OQ-040 | F/E | M1 | Resolved (selection) |
| OQ-013 | Observability and error-reporting vendor (must support PII scrubbing; region) | Resolved 2026-11-06: Grafana Cloud free tier, EU stack, via direct OTLP for traces, metrics, and logs. Endpoint, instance ID, and API key are supplied only through environment variables; application-side allow-list redaction remains mandatory | E | M1 | Resolved |
| OQ-016 | Incremental SHA-256 library for browser (licence, performance on low-end Android) | Evaluate WASM options in M3 | E | M3 | Open |
| OQ-017 | Shared rate-limit store before scaling API beyond one replica | Postgres-backed limiter | E | R4 | Deferred |
| OQ-024 | Should named private viewers require `share_family` scope or a separate scope? | Require `share_family` in R1 | F/L | M7 | **Resolved.** Named private viewers require the existing `share_family` scope in R1; no separate scope is introduced. This keeps the consent surface small and matches the existing implementation. |
| OQ-025 | Is `docs/MACHINE.md` intended as the state-machine spec? | Yes (interpreted) | F | — | Open |
| OQ-027 | Do content-free quality metrics computed from reviewer corrections need explicit consent? | Treat as operational quality monitoring; disclose in privacy notice; counsel to confirm | L/F | M5 | Open |
| OQ-028 | Licences of datasets used to train `Sunbird/asr-whisper-51-african-languages` **[S19]** | Diligence before selection | E | M0 | Open |
| OQ-029 | Is isiXhosa (`xho_Latn`) in Omnilingual ASR `supported_langs` **[S20]**? | Check programmatically | E | M0 | Open |
| OQ-030 | GPU hosting for self-hosted ASR (Railway GPU availability UNVERIFIED; alternatives incl. Nebius compute) and its data region | Only if a self-hosted candidate wins | E | M4 | Open |
| OQ-039 | How will Better Auth's logical user/session/verification records map to DATA_MODEL §3 without weakening SECURITY_AND_PRIVACY §7? | Custom Postgres adapter verified for the restricted email-OTP/session subset: twelve real PostgreSQL 16.15 tests pass with Better Auth 1.7.16. See [compatibility evidence](auth-storage-compatibility.md) for guarantees and unsupported operations | E/F | M1 auth-library implementation | Resolved (restricted storage compatibility) |
| OQ-040 | Which live email delivery provider will carry sign-in codes/links? | Keep fake email for local/tests; founder selects vendor after region, DPA, cost, and deliverability review. Better Auth's OTP plugin does not select a delivery vendor | F/E | M1 live email integration | Open |
| OQ-041 | How should the storage-level `AuditSink` tuples (`model`, `operation`, `entityId`) be assigned canonical audit actions and request actors? The tuple alone cannot distinguish `auth.sign_out` from `auth.sessions_revoked`, and verification mutations have no direct catalogue action | Resolved 2026-11-06: fixed storage actions are `user/create → user.registered`, `user/update → user.updated`, `session/create → session.created`, `session/revoke → session.revoked`, `verification/create → auth.challenge_persisted`, `verification/consume → auth.challenge_consumed`, and `verification/revoke → auth.challenge_revoked`. `model` is `entity_type`; `operation` is content-free metadata. A request/job-scoped context resolver supplies `actor_type`, optional `actor_user_id`, `story_id`, and `correlation_id`; business-level `auth.sign_out`/`auth.sessions_revoked` remain separate events | F/E | M1 audit writer | Resolved |
| OQ-042 | Should `idempotency_keys` expire after 24 hours (`DATA_MODEL.md` §10 and `API_CONTRACTS.md` §1.4) or be purged after 30 days (`SYSTEM_DESIGN.md` §4.4)? | Resolved 2026-11-06: 24 hours. `DATA_MODEL.md` and `API_CONTRACTS.md` are higher-authority and agree; `SYSTEM_DESIGN.md` §4.4 now assigns 24 h to auth challenges/idempotency keys and retains 30 days only for webhook receipts. The schema supplies the `created_at` purge index; the later maintenance task enforces TTL | E | M1 maintenance task | Resolved |
| OQ-043 | Where and how often should audit-chain head hash/count checkpoints be anchored so the verifier can detect suffix truncation, not only edits, interior gaps, and reordering? | The local verifier cannot cryptographically distinguish an empty/truncated suffix from a legitimately shorter chain. Choose an independently protected store and retention cadence before relying on daily verification for truncation detection | E | Audit verification/operations slice | Open |
| OQ-044 | Does a `family_admin` count as a current family member for approved family-audience story access? `CONSENT_AND_OWNERSHIP.md` §5 denies the explicit “Family admin (no story role)” column, while §8 says all current family-circle members can access a family-audience story. | **Resolved.** A `family_admin` without a story role is denied story content; they may still propose glossary terms. This is the secure interpretation of the explicit §5 denial while preserving the glossary capability. | F/E | M7 sharing policy | **Resolved** |

## Language and UX

| ID | Question | Provisional position | Owner | Needed by |
|---|---|---|---|---|
| OQ-036 | Agreed isiXhosa terms for "consent", "translation", "family circle", "rights holder", "custodian" | Copy glossary built with translators | X | M2 |
| OQ-037 | Should praise poetry segments default to "keep in isiXhosa" rather than translated? | Ask families in discovery | X/F | M6 |
| OQ-038 | Appropriate honorific register for addressing elders in UI copy | Translators + advisor | X | M2 |

## M1 auth decision and remaining proposals

Better Auth is selected by the founder and its pinned dependency is installed locally; no paid resource has been provisioned. OQ-039 is resolved for the documented restricted adapter; OQ-040 remains open.

- **OQ-012 (selection resolved):** Better Auth + email-OTP plugin, with server-side sessions in Postgres. Version 1.7.17's MIT licence and Postgres support were verified before coding; its standard persistence contract is not a direct match for our schema. ADR-010 records the evidence and proposed compatibility slice (OQ-039). Custom storage integration is now verified for the documented subset; Fastify is not required for these tests. Email delivery vendor selection is tracked separately as OQ-040.
- **OQ-013 (resolved):** [Grafana Cloud free tier via OTLP](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/) is selected for an EU-region stack, keeping the planned residency/DPA posture aligned with Railway Amsterdam and the existing EU Cloudinary choice. The application sends only allow-listed, content-free telemetry; credentials are environment variables and real Grafana credentials are not committed.
