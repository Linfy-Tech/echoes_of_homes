# Source Register

All external technical, provider, model, and legal claims in this repository cite a source ID from this register (e.g. `[S4]`). Access date for every source below: **2026-11-04** unless stated otherwise.

**Evidence labels used throughout the docs**

| Label | Meaning |
|---|---|
| **VERIFIED [Sx]** | Read in the cited primary source on the access date. Still re-check before relying on it in production — providers change. |
| **UNVERIFIED** | Believed or plausible but not confirmed in a primary source during this phase. Must be verified before implementation depends on it. |
| **ASSUMPTION** | A working assumption made by the spec team to proceed. Recorded in `OPEN_QUESTIONS.md` when material. |
| **RECOMMENDATION** | Our design choice. Not a fact about the world. |
| **LEGAL REVIEW** | A legal interpretation that requires a qualified South African attorney. Nothing in this repo is legal advice. |

## Register

| ID | Source | URL | What it was used for |
|---|---|---|---|
| S1 | OpenAI — Speech to text guide | https://developers.openai.com/api/docs/guides/speech-to-text | Current transcription models (`gpt-transcribe` recommended; `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` deprecated with shutdown 2027-02-26); 25 MB file limit; chunking guidance |
| S2 | OpenAI — Create transcription API reference | https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create | Parameters: `languages` and `keywords` (`gpt-transcribe` only), `include: ["logprobs"]` (only `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-mini-transcribe-2025-12-15`, json only), `timestamp_granularities` (requires `verbose_json`), `chunking_strategy`; accepted formats flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm |
| S3 | OpenAI — GPT-Transcribe model page | https://developers.openai.com/api/docs/models/gpt-transcribe | Feature list (language hints, keyword hints, streaming); does **not** list supported languages; listed price per minute (not relied upon — re-check) |
| S4 | OpenAI — Data controls in the OpenAI platform | https://developers.openai.com/api/docs/guides/your-data | API data not used for training by default; abuse-monitoring logs retained up to 30 days by default; `/v1/audio/transcriptions` is ZDR-eligible; ZDR requires OpenAI approval; data-residency regions; transcription regional *processing* only US and EU |
| S5 | OpenAI — Agents: guardrails and human review | https://developers.openai.com/api/docs/guides/agents/guardrails-approvals | Agents SDK TypeScript (`@openai/agents`): input/output/tool guardrails, `needsApproval`, `interruptions`, serialisable run state |
| S6 | npm — `@openai/agents` | https://www.npmjs.com/package/@openai/agents | MIT licence; Node.js 22+ requirement. Version shown on the page appeared stale — **re-check version at install time** |
| S7 | Cloudinary — Uploading guide | https://cloudinary.com/documentation/upload_images | Audio uses the `video` asset type; signatures generated server-side, valid 1 hour; never expose `api_secret`; files > 100 MB must be chunked; default chunk 20 MB, minimum 5 MB; `X-Unique-Upload-Id` + `Content-Range`; `notification_url` |
| S8 | Cloudinary — Media access control | https://cloudinary.com/documentation/control_access_to_media | Delivery types `upload` / `private` / `authenticated`; `authenticated` requires signed URLs for original **and** derived assets and disallows on-the-fly transformations (eager only); signed URLs do not expire and can be shared once exposed; token/cookie access require the Advanced plan or higher |
| S9 | Cloudinary — Delete assets | https://cloudinary.com/documentation/delete_assets | `destroy` with `resource_type: video` for audio, `type: authenticated`, `invalidate: true`; derived-asset deletion methods; backups behaviour pointer |
| S10 | Cloudinary — Backups and version management | https://cloudinary.com/documentation/backups_and_version_management | Automatic backup off by default, available on all plans, originals only; deleted backed-up assets keep a reserved public ID; Admin API "delete backed up versions" is irreversible |
| S11 | Railway — Back up and restore Postgres | https://railway.com/guides/postgres-backups-restores | Volume backups: daily (kept 6 days), weekly (1 month), monthly (3 months); manual backups ≤ 50% volume size; wiping a volume deletes its backups; same project/environment restore; PITR via pgBackRest ≈ 4-week window; `pg_dump --format=custom` via `railway connect postgres --tunnel-only`; offsite dump via cron |
| S12 | Railway — Deployment regions | https://docs.railway.com/deployments/regions | Regions: `us-west2`, `us-east4-eqdc4a`, `europe-west4-drams3a` (Amsterdam), `asia-southeast1-eqsg3a`; **no Africa region**; volumes follow service region |
| S13 | Railway — Config as Code reference | https://docs.railway.com/reference/config-as-code | `railway.json`/`railway.toml` **deprecated**; legacy files stop being read 2026-12-01 |
| S14 | Railway — Infrastructure as Code | https://docs.railway.com/infrastructure-as-code | `.railway/railway.ts` (TypeScript DSL, GA); `railway config plan/apply/migrate`; `preserve()` keeps variable values out of source |
| S15 | Railway — Private networking | https://docs.railway.com/networking/private-networking | `SERVICE_NAME.railway.internal`; per-environment isolated network; WireGuard-encrypted inter-service traffic |
| S16 | Nebius Token Factory — Legal quick guide | https://docs.tokenfactory.nebius.com/legal/legal-quick-guide | Without ZDR inputs/outputs retained (stored in Finland, EU) for speculative decoding; ZDR is org-wide; no training on customer content; public endpoints are region "Global" and not recommended for workloads needing a stable region; dedicated endpoints process in selected region; DPA incorporated in ToS |
| S17 | Nebius — Token Factory launch announcement | https://nebius.com/newsroom/nebius-launches-nebius-token-factory-to-deliver-production-ai-inference-at-scale | Product context only |
| S18 | Hugging Face — Sunbird organisation models | https://huggingface.co/Sunbird/models | Sunflower family is LLM/translation/speech-LLM work focused on Ugandan languages; ASR checkpoints listed separately |
| S19 | Hugging Face — `Sunbird/asr-whisper-51-african-languages` | https://huggingface.co/Sunbird/asr-whisper-51-african-languages | Includes Xhosa (`xho`) and Zulu; Apache-2.0 model licence; gated; preview release (weights may change, not for pinned production); vendor-reported Xhosa WER 0.262 / CER 0.054 on n=126 dev clips ≤ 30 s; training data FLEURS, ASR Africa Data Efficiency Benchmark, African Next Voices (dataset licences not stated on page) |
| S20 | Hugging Face — `facebook/omniASR-LLM-7B` | https://huggingface.co/facebook/omniASR-LLM-7B | Apache-2.0 model and code; corpus CC-BY-4.0; CTC and LLM variants 300M–7B; ≈17 GiB VRAM for LLM 7B; language codes like `eng_Latn`; isiXhosa support **not confirmed on page** (must check `supported_langs`) |
| S21 | Google Cloud — Speech-to-Text supported languages | https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages | `xh-ZA` listed for `chirp_2` (word-level confidence) and `chirp_3` (no word-level confidence) in the visible region table (`asia-northeast1`); other regions not confirmed |
| S22 | Lelapa AI — Vulavula docs | https://docs.lelapa.ai/overview/introduction | Transcription languages listed did **not** include isiXhosa; isiXhosa appears under translation |
| S23 | SADiLaR — NCHLT isiXhosa Auxiliary Speech Corpus | https://repo.sadilar.org/handle/20.500.12185/514 | CC BY 3.0; orthographically transcribed broadband speech; useful as a public sanity set, not representative of oral storytelling |
| S24 | Graphile Worker — `add_job` SQL | https://worker.graphile.org/docs/sql-add-job | `graphile_worker.add_job(identifier, payload, queue_name, run_at, max_attempts, job_key, priority, flags, job_key_mode)`; `max_attempts` default 25; `job_key` for de-duplication |
| S25 | POPIA — Section 1 definitions (popia.co.za) | https://popia.co.za/section-1-definitions/ | Definitions of "consent", "biometrics" (includes voice recognition), "personal information" (living natural persons), "operator", "child" |
| S26 | POPIA — Section 72 (acts.co.za) | https://source.acts.co.za/protection-of-personal-information-act-2013/72__transfers_of_personal_info.php | Cross-border transfer conditions 72(1)(a)–(e) |
| S27 | Information Regulator — Fact sheet on security compromises | https://inforegulator.org.za/wp-content/uploads/2025/08/Fact-Sheet-on-security-compromises-2.pdf | Notify as soon as reasonably sure a compromise occurred; mandatory reporting through the eServices portal; content of notification; operators notify responsible party immediately |
| S28 | Gov.za — Protection, Promotion, Development and Management of Indigenous Knowledge Act 6 of 2019 | https://www.gov.za/documents/acts/protection-promotion-development-and-management-indigenous-knowledge-act-6-2019 | Existence of the Act; applicability to oral histories is a **LEGAL REVIEW** item |

## Sources referenced but not read in full this phase

These are cited only as pointers; any claim depending on them is labelled UNVERIFIED.

- POPIA full text (Act 4 of 2013), sections 11, 14, 18, 19, 21, 22, 23–25, 26–33, 34–35, 55, 69, 71 — section numbers are referenced from the structure of the Act; operative wording must be confirmed by legal review. Index: https://popia.co.za/
- Nebius Token Factory API reference — https://docs.tokenfactory.nebius.com/api-reference/introduction.md
- Google Chirp 3 model page — https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
- Fastify, Next.js, Drizzle ORM, Prisma, NestJS, pg-boss official docs — consulted for architectural reasoning only; version-specific claims must be re-checked at install time.

## Rules for adding sources

1. Prefer primary sources (official docs, model cards, statutes, regulator publications).
2. Add the access date if different from the register default.
3. Never upgrade an UNVERIFIED claim to VERIFIED without adding a source row.
4. When a provider page changes, update the claim and note the change in the relevant ADR.
