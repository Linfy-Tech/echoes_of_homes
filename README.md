# Echoes of Home

> Preserve the voice. Keep the story with the family.

**Andela x OpenAI Codex Capstone Hackathon**

**Theme: Telling African Stories**

Built by **Linford Musiyambodza**

Echoes of Home is a consent-first oral-history platform for families preserving spoken stories, memories, and cultural knowledge in the storyteller's own language—starting with **isiXhosa** and reviewed English translations.

It is designed for families, storytellers, recorders, and trusted reviewers who want to keep an elder's voice and story without treating AI output as unquestionable truth. The original recording remains the source of truth; software can assist with transcription and translation, but people retain control over consent, corrections, approval, sharing, and deletion.

> **Status:** Live hackathon demonstration with a publicly accessible frontend, healthy backend API, and verified production email OTP sign-in. The wider storytelling workflow remains in active development and is not yet ready for a real-family production pilot.

## Live demo

- **Web app:** [echoes-of-home-web.vercel.app](https://echoes-of-home-web.vercel.app)
- **API health:** [echoes-of-home-api.fly.dev/healthz](https://echoes-of-home-api.fly.dev/healthz)

The frontend and API are publicly deployed. The API health endpoint returns a successful response.

Email OTP authentication has also been verified end to end in the deployed environment:

1. An OTP email was sent through Resend.
2. The email arrived in a real inbox.
3. The received OTP completed sign-in.
4. A real session was issued.
5. The authenticated session was verified through `/v1/me`.

The live deployment is a hackathon demonstration environment, not an uptime-guaranteed production service. Fly.io cold starts and account-tier/platform constraints may affect demo availability or response time.

## Contents

- [Why Echoes of Home](#why-echoes-of-home)
- [What is built today](#what-is-built-today)
- [What remains incomplete](#what-remains-incomplete)
- [Architecture](#architecture)
- [Technology](#technology)
- [What we built during the hackathon](#what-we-built-during-the-hackathon)
- [Roadmap after the hackathon](#roadmap-after-the-hackathon)
- [Local development](#local-development)
- [Project documentation](#project-documentation)
- [Contributing and licensing](#contributing-and-licensing)
- [Acknowledgements](#acknowledgements)

## Why Echoes of Home

Family histories are often carried in spoken memories: childhood stories, migration histories, praise names, everyday knowledge, family relationships, and language itself. When elders pass away, those voices and the context around them can be difficult to recover.

Echoes of Home approaches preservation as a trust problem before it is an AI problem:

- A storyteller decides whether their story may be recorded, processed, translated, reviewed, or shared.
- Stories are private by default.
- Human reviewers correct machine drafts.
- Uncertainty should be visible rather than silently guessed.
- The platform does not offer voice cloning, public sharing in Release 1, advertising use, or model-training use of stories.
- Consent, permissions, and sharing decisions belong to deterministic application code—not to an AI model.

The project starts with isiXhosa-to-English support because language preservation requires systems that respect the language people actually speak at home, not only the language most convenient for software.

## What is built today

Feature labels in this section are deliberately precise:

- **Implemented** — represented in repository code and tests.
- **Foundation / partially durable** — implemented, but has known persistence, provider, or production-readiness limitations.
- **Planned** — documented intent, not represented as complete functionality.

| Area | Status | Evidence-based summary |
|---|---|---|
| Bilingual web shell | Implemented | Next.js pages and English/isiXhosa message catalogues support language selection, sign-in, family, consent, recording, review, translation, reader, profile, and session screens. |
| Authentication and sessions | Implemented | Fastify exposes OTP challenge, verification, session listing, revocation, logout, and `/v1/me` endpoints. With `DATABASE_URL`, startup selects the Better Auth/PostgreSQL-backed service; without it, local development uses an in-memory service. |
| Production OTP delivery | Implemented and verified | Resend delivers sign-in OTP emails in the deployed environment. The full flow—delivery, inbox receipt, OTP verification, session issuance, and authenticated `/v1/me` request—has been verified end to end. |
| Family, person, story, invitation, and consent records | Implemented | Drizzle-backed repository and API routes support family circles, people, stories, invitations, consent records, scope grants, and custodian designation. |
| Consent-aware recording | Foundation | Browser recording uses `MediaRecorder`, IndexedDB recovery, hashing, resumable chunks, and recording-completion API calls. Storage uses a provider abstraction with fake and Cloudinary adapters. |
| Assisted verbal consent evidence | Foundation | UI and API support assisted consent evidence capture; production consent copy, language review, and legal approval remain open work. |
| Background processing | Foundation | A separate Graphile Worker process, durable `processing_jobs`, media verification flow, consent checks, retries, and durable ASR enqueueing exist. |
| ASR pipeline | Foundation | Chunking, stitching, uncertainty handling, budget/circuit-breaker foundations, and provider-neutral interfaces exist. The current runtime adapter is deterministic and fake. |
| Transcript review | Foundation / partially durable | Review UI and API workflow support segment edits, flags, optimistic concurrency, and approval transitions. Its primary review store is currently in-memory. |
| Translation review | Foundation / partially durable | Translation review, verification issues, edits, and approval flow exist, but use a fake text provider and in-memory workflow state. |
| Final approval, reader, and family sharing | Foundation / partially durable | Final approval, reader, private/family audience controls, and public-sharing safeguards exist. The final-sharing foundation currently holds primary state in memory. |
| Audit integrity | Implemented | Database audit events use a hash-chain writer and verifier with dedicated tests. |
| Security controls | Implemented foundations | The API includes CORS, CSRF-style origin checks, security headers, rate limiting, correlation IDs, structured logging, and policy checks. Production security review remains planned. |

### AI is intentionally not the authority

The project's AI design is deliberately provider-neutral:

- `packages/ai-providers` defines ASR and text-model interfaces.
- The worker uses deterministic fake adapters by default.
- Providers are expected to be selected through evaluation, not marketing claims.
- Models cannot decide consent, permissions, sharing, or deletion.
- The project does not silently fail over between AI providers.

See [ADR-005](docs/decisions/ADR-005-ai-provider-abstraction.md) and the [ASR benchmark plan](docs/ASR_BENCHMARK.md).

## What remains incomplete

The repository should not be mistaken for a finished production system.

### Not yet production-ready

- No production ASR provider has been selected or integrated.
- No Echoes isiXhosa oral-storytelling benchmark has been run.
- Translation currently uses a deterministic fake provider.
- Transcript review, translation review, and final approval/sharing require further durable-persistence work.
- Withdrawal, deletion, export, account closure, administrative operations, and pilot hardening remain later milestones.
- Legal review, consent-script review by fluent isiXhosa speakers, provider data controls, backup/restore drills, observability operations, and accessibility field testing remain open.
- Public sharing is not a Release 1 feature and must remain disabled.

See [Milestones](docs/MILESTONES.md), [Open Questions](docs/OPEN_QUESTIONS.md), and the [risk register](docs/RISK_REGISTER.md).

## Architecture

```text
                         ┌───────────────────────────────┐
                         │  Next.js web application       │
                         │  English + isiXhosa interface  │
                         └───────────────┬───────────────┘
                                         │ HTTPS / cookies
                                         ▼
                         ┌───────────────────────────────┐
                         │ Fastify API                    │
                         │ auth · policy · consent · API  │
                         │ audit · media orchestration    │
                         └───────────────┬───────────────┘
                                         │ PostgreSQL
                     ┌───────────────────┼───────────────────┐
                     ▼                   ▼                   ▼
          ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
          │ PostgreSQL      │  │ Graphile Worker  │  │ Media provider   │
          │ domain data     │  │ processing jobs  │  │ fake / Cloudinary│
          │ audit chain     │  │ consent gates    │  └──────────────────┘
          └─────────────────┘  └────────┬─────────┘
                                        │
                                        ▼
                           ┌───────────────────────────┐
                           │ Provider-neutral AI layer │
                           │ fake adapter by default   │
                           └───────────────────────────┘
```

### Core trust boundaries

- The API is the entry point for user-initiated domain writes.
- PostgreSQL holds structured application data; media is handled through a storage-provider boundary.
- Background work is persisted as processing-job state and executed separately.
- Provider SDKs belong behind provider adapters.
- AI output is draft material; deterministic policy and human approval control outcomes.
- Content should not be written to structured logs.

For the fuller design, see [Architecture](docs/ARCHITECTURE.md), [System Design](docs/SYSTEM_DESIGN.md), and [Consent and Ownership](docs/CONSENT_AND_OWNERSHIP.md).

## Technology

| Category | Technology | Current role |
|---|---|---|
| Frontend | Next.js 15, React 19, Vercel | Mobile-oriented public web interface and PWA shell |
| Backend | Fastify 5, Zod, Fly.io | Public API, request validation, CORS, headers, rate limits, OpenAPI generation, and deployed health endpoint |
| Authentication | Better Auth, PostgreSQL, Resend | Durable email-OTP/session path when a database is configured; live OTP delivery is verified |
| Database | PostgreSQL, Drizzle ORM | Schema, reviewed SQL migrations, repositories, audit events, processing jobs |
| Background work | Graphile Worker | Job execution for media and language-processing workflows |
| Media | `MediaStorageProvider`, Cloudinary SDK | Fake adapter by default; Cloudinary adapter available |
| Observability | OpenTelemetry-oriented package | Structured, redacted telemetry foundation |
| Testing | Node test runner, Testcontainers, Playwright, axe-core | Unit, database, route, accessibility, recording-recovery, and visual-regression coverage |
| Tooling | pnpm, Turborepo, TypeScript, ESLint | Monorepo orchestration, type checks, linting, dependency boundaries |
| Containers | Docker | API and worker Dockerfiles are built in GitHub Actions |

### Infrastructure status

The public web frontend is deployed on Vercel and the API is deployed on Fly.io.

The working tree also contains Fly.io configuration for separate API and worker services, plus a Neon configuration file. At the time of this README review, those files are not yet tracked in Git. They contain no detected credentials or connection strings, but should be reviewed and committed separately before being treated as fully reproducible infrastructure-as-code.

No production database provider claim beyond PostgreSQL is made here until the Neon configuration and deployment record are committed and reviewed.

## What we built during the hackathon

During the **Andela x OpenAI Codex Capstone Hackathon**, the project progressed from an initial product specification and risk-reduction work into a demonstrable full-stack foundation.

Repository history records work across:

- M0 Cloudinary, queue, and Railway spikes.
- M1 monorepo, CI, policy, authentication, API, web shell, observability, and database foundations.
- M2 family, story, and consent foundations.
- M3 media upload, recording recovery, playback, and assisted-consent evidence foundations.
- M4 provider-neutral ASR pipeline foundations.
- M5 transcript review foundations.
- M6 translation review foundations.
- M7 final approval, reader, sharing, and later durable media/ASR orchestration work.
- UI accessibility, visual-review, and screenshot-capture improvements.
- Public frontend/API deployment and end-to-end Resend OTP verification.

A significant later integration slice, **M7.6**, made media upload state and ASR enqueueing durable. It did not complete durable persistence for all review, translation, and final-sharing workflow state. That follow-up remains explicit roadmap work.

The repository's CI workflow is configured to run Docker image builds, dependency auditing, type checks, linting, provider-neutral pipeline tests, API checks, migration tests, audit-chain tests, web i18n checks, accessibility checks, recording-recovery tests, and a full-history secret scan. This README does not claim a particular current CI run is green.

## Roadmap after the hackathon

| Priority | Current status | Why it matters | Next practical step |
|---|---|---|---|
| 1. Select production ASR | Not selected | isiXhosa speech recognition quality is central to the product's usefulness and trustworthiness. | Build the consented Echoes Eval Set, annotate it with fluent reviewers, then evaluate candidates with the documented protocol. |
| 2. Complete durable workflow persistence | Partially complete | M7.6 made media upload state and ASR enqueueing durable, but review, translation, and final-sharing foundations still contain in-memory state. | Replace remaining non-canonical/in-memory workflow routes with repository-backed services and add HTTP-level black-box end-to-end tests. |
| 3. Validate consent and language in the real world | Not complete | A culturally appropriate product cannot rely on placeholder consent copy or synthetic evaluation data. | Produce a human-reviewed isiXhosa consent script; test comprehension with elders; recruit and compensate consented evaluation participants. |
| 4. Production provider/data controls | Not complete | Audio is sensitive, and provider choice affects privacy, region, retention, and cost. | Complete each provider's data-controls checklist, contracts, retention review, and cost limits before pilot use. |
| 5. Complete change-of-mind workflows | Planned | Withdrawal, deletion, export, and account closure are essential product promises. | Implement and test M8 deletion propagation, backup handling, export expiry, and restore/ledger drills. |
| 6. Production hardening | Planned | A closed pilot needs operational confidence, not only feature coverage. | Complete M9: security review, accessibility audit, load/cost testing, backups, restore drill, alerting, incident runbooks, and legal checkpoint. |
| 7. Closed pilot | Planned | Real families and reviewers must determine whether the workflow is useful and respectful. | Run M10 with a facilitated, consented 5–10 family pilot after the earlier gates are complete. |

### Production speech recognition candidates

No ASR provider is selected.

#### Managed candidate: Google Cloud Speech-to-Text

Google Cloud Speech-to-Text documents isiXhosa as `xh-ZA` for Chirp models. A managed provider could reduce GPU and model-serving work, but introduces provider data-processing, regional, pricing, and model-change dependencies.

Next step: run it against the consented Echoes evaluation set and compare review effort, accuracy, uncertainty behaviour, latency, cost, and data controls with self-hosted candidates.

- [Google Cloud Speech-to-Text supported languages](https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages)
- [Echoes ASR benchmark plan](docs/ASR_BENCHMARK.md)

#### Self-hosted candidate: Sunbird SunflowerASR

Sunbird's gated Apache-2.0 SunflowerASR model explicitly supports Xhosa through the forced `xho` language token. Its model card reports Xhosa WER `0.252` and CER `0.049` over 527 benchmark clips. These are external model-card measurements, not Echoes results, and must not be treated as evidence for oral-history audio.

Self-hosting offers more deployment control, but requires gated-model access, GPU infrastructure, model operations, cost monitoring, and further licence/data diligence.

Next step: run a bounded, consented GPU evaluation with the required `xho` token, then compare it with the managed candidate using the same Echoes evaluation protocol.

- [SunflowerASR model card](https://huggingface.co/Sunbird/SunflowerASR-51-african-languages)
- [ADR-005: provider-neutral AI interfaces](docs/decisions/ADR-005-ai-provider-abstraction.md)

## Local development

### Requirements

- Node.js `24.15.x` (`.nvmrc`; supported range is `>=24.15.0 <25`)
- pnpm `12.16.1`
- PostgreSQL for durable integration paths
- Docker when running container-based checks
- `ffmpeg` for worker media-processing paths

### Setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Use placeholder or local-only values in `.env.local`. Never commit credentials, private keys, connection strings, audio, or personal data.

### Common checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:asr-pipeline
pnpm test:database-migrations
pnpm test:api-routes
pnpm test:web-i18n
```

For the full environment model and configuration reference, see:

- [Development workflow](docs/DEVELOPMENT_WORKFLOW.md)
- [Environment variables](docs/ENVIRONMENT_VARIABLES.md)
- [Test strategy](docs/TEST_STRATEGY.md)

## Project documentation

| Topic | Read |
|---|---|
| Product and user journeys | [Vision](docs/VISION.md), [PRD](docs/PRD.md), [User Journeys](docs/USER_JOURNEYS.md) |
| Consent, ownership, and privacy | [Consent and Ownership](docs/CONSENT_AND_OWNERSHIP.md), [Security and Privacy](docs/SECURITY_AND_PRIVACY.md) |
| System design | [Architecture](docs/ARCHITECTURE.md), [System Design](docs/SYSTEM_DESIGN.md), [Data Model](docs/DATA_MODEL.md) |
| AI strategy | [AI Provider Strategy](docs/AI_PROVIDER_STRATEGY.md), [ASR Benchmark Plan](docs/ASR_BENCHMARK.md), [Translation Evaluation](docs/TRANSLATION_EVALUATION.md) |
| Delivery plan | [Milestones](docs/MILESTONES.md), [Roadmap](docs/ROADMAP.md), [Open Questions](docs/OPEN_QUESTIONS.md) |
| Technical decisions | [Architecture Decision Records](docs/decisions/) |

## Contributing and licensing

No contribution guide or open-source licence file is currently present in this repository.

Before accepting external contributions or presenting the project as open source, add:

1. A licence selected by the project owner.
2. A contributor guide covering setup, tests, contribution boundaries, and handling of sensitive cultural/personal material.
3. A code-of-conduct and data-handling policy appropriate to a project involving oral histories.

## Acknowledgements

- **Linford Musiyambodza** — creator and builder of Echoes of Home.
- **OpenAI Codex** — AI engineering and build tool used during development.
- **Abraham Omomoh** — contributed OpenAI API credits that supported the project.

---

Echoes of Home is not only about storing recordings. It is about helping families preserve language, memory, and cultural knowledge with technology that remains answerable to the people whose voices it carries.
