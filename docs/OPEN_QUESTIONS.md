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
| OQ-005 | Graphile Worker `add_job` inside Drizzle transaction: atomic with commit/rollback? Pool/connection interplay | Spike test | E | M0 | Open |
| OQ-006 | Apply for OpenAI Zero Data Retention or Modified Abuse Monitoring (requires approval **[S4]**)? | Apply before pilot; otherwise disclose 30-day retention | F/E | M9 | Open |
| OQ-007 | If Agents SDK adopted later: tracing defaults and whether SDK calls use only ZDR-eligible endpoints | Not used in R1 | E | R2 | Deferred |
| OQ-008 | Railway volume encryption at rest; TLS on private network for Postgres | Ask Railway / docs; app-level encryption for sensitive columns regardless | E | M1 | Open |
| OQ-009 | Encrypt transcript/translation text columns at application level? | Not in R1 (review UX, constraints); revisit R4 | E | R4 | Deferred |
| OQ-010 | Does `destroy` remove eager derivatives? What remains after deleting backup versions of a reserved public ID **[S10]**? | Explicit derived + backup deletion regardless; confirm with support | E | M0 | Open |
| OQ-011 | Phone/WhatsApp OTP sign-in: cost, SIM-swap risk, provider | Defer to R3 | F/E | R3 | Deferred |
| OQ-012 | Auth implementation (maintained library vs minimal in-house with vetted primitives) and email provider | Evaluate Better Auth first; compare minimal in-house sessions using vetted primitives (options below); founder decides; email provider still open | E | M1 | Open |
| OQ-013 | Observability and error-reporting vendor (must support PII scrubbing; region) | Compare Grafana Cloud and Better Stack via OTLP (options below); founder decides | E | M1 | Open |
| OQ-016 | Incremental SHA-256 library for browser (licence, performance on low-end Android) | Evaluate WASM options in M3 | E | M3 | Open |
| OQ-017 | Shared rate-limit store before scaling API beyond one replica | Postgres-backed limiter | E | R4 | Deferred |
| OQ-024 | Should named private viewers require `share_family` scope or a separate scope? | Require `share_family` in R1 | F/L | M7 | Open |
| OQ-025 | Is `docs/MACHINE.md` intended as the state-machine spec? | Yes (interpreted) | F | — | Open |
| OQ-027 | Do content-free quality metrics computed from reviewer corrections need explicit consent? | Treat as operational quality monitoring; disclose in privacy notice; counsel to confirm | L/F | M5 | Open |
| OQ-028 | Licences of datasets used to train `Sunbird/asr-whisper-51-african-languages` **[S19]** | Diligence before selection | E | M0 | Open |
| OQ-029 | Is isiXhosa (`xho_Latn`) in Omnilingual ASR `supported_langs` **[S20]**? | Check programmatically | E | M0 | Open |
| OQ-030 | GPU hosting for self-hosted ASR (Railway GPU availability UNVERIFIED; alternatives incl. Nebius compute) and its data region | Only if a self-hosted candidate wins | E | M4 | Open |

## Language and UX

| ID | Question | Provisional position | Owner | Needed by |
|---|---|---|---|---|
| OQ-036 | Agreed isiXhosa terms for "consent", "translation", "family circle", "rights holder", "custodian" | Copy glossary built with translators | X | M2 |
| OQ-037 | Should praise poetry segments default to "keep in isiXhosa" rather than translated? | Ask families in discovery | X/F | M6 |
| OQ-038 | Appropriate honorific register for addressing elders in UI copy | Translators + advisor | X | M2 |

## M1 scaffold proposals — pending founder decision

No library, vendor, or paid resource is selected or installed by these proposals.

- **OQ-012:** [Better Auth](https://better-auth.com/docs/plugins/email-otp) provides email OTP tooling, but needs a fit review for our hashed/peppered sessions, schema, enumeration resistance, and admin MFA. Minimal in-house sessions using vetted `node:crypto` primitives fit the exact contract but add security implementation and maintenance burden. Recommend evaluating Better Auth first against §7; retain fake email locally and decide the live email provider separately.
- **OQ-013:** [Grafana Cloud via OTLP](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/) offers a unified telemetry backend but needs retention/cardinality controls. [Better Stack via OpenTelemetry](https://betterstack.com/docs/logs/open-telemetry/) is another hosted ingestion option but needs a metric/trace coverage and cost review. Recommend comparing both using synthetic, content-free telemetry; confirm region, DPA, redaction, retention, and costs before selection. Application-side field allow-lists remain mandatory regardless of vendor.
