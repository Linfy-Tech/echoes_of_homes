# Echoes of Home

> *Every voice deserves to be remembered.*

Echoes of Home is an AI-assisted oral-history preservation platform. It helps families record spoken stories in the storyteller's own language — starting with **isiXhosa** in South Africa — verify AI-generated transcripts with human reviewers, translate approved transcripts into **English** responsibly, and share the result **only** with the storyteller's permission.

The original recording is always the source of truth. AI drafts; people decide.

**Status:** Specification phase. No application code yet. This repository is the source of truth for building the product in controlled, testable milestones.

---

## What makes this product different

| Principle | What it means in the system |
|---|---|
| The voice comes first | Original audio is preserved unmodified, hashed, and never replaced by derivatives. |
| Uncertainty is visible | The transcript marks unclear speech instead of guessing. Unresolved uncertainty blocks translation unless a person explicitly accepts it as uncertain. |
| Humans approve, code enforces | Consent, authorisation, sharing, and deletion are enforced in deterministic application code. AI never decides who can see a story. |
| Transcript before translation | Translation can only start from a transcript version approved for translation. Enforced in the database and the service layer. |
| Private by default | Every story starts private. Sharing requires explicit, recorded permission from the rights holder. |
| No voice cloning, no silent training | Voices are never synthesised. Stories are never used to train models without separate, explicit consent (not offered in Release 1). |

## Architecture at a glance

```
                ┌──────────────────────┐
  Browser/PWA ─►│ apps/web (Next.js)   │──── HTTPS (cookies) ───┐
                └──────────────────────┘                         ▼
                                                    ┌──────────────────────┐
  Direct signed chunked upload ───────────────────► │ apps/api (Fastify)   │
  (browser → Cloudinary, signature from API)        │ authz · consent ·    │
                                                    │ state machines       │
                                                    └─────────┬────────────┘
                                                              │ SQL + transactional job enqueue
                                                    ┌─────────▼────────────┐
                                                    │ Railway PostgreSQL   │
                                                    │ (domain + job queue) │
                                                    └─────────▲────────────┘
                                                              │
                                                    ┌─────────┴────────────┐
                                                    │ workers/story-       │──► ASR / LLM providers
                                                    │ processing (Graphile │    (via packages/ai-providers)
                                                    │ Worker)              │──► Cloudinary (authenticated)
                                                    └──────────────────────┘
```

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md).

## Key decisions (summary)

| Area | Decision | Record |
|---|---|---|
| Hosting | Railway, EU West (Amsterdam) region — Railway has no Africa region | [ADR-001](docs/decisions/ADR-001-railway.md) |
| Database | Railway PostgreSQL; media never stored in Postgres | [ADR-002](docs/decisions/ADR-002-postgresql.md) |
| Media | Cloudinary `authenticated` delivery behind a `MediaStorageProvider` abstraction; private audio streamed through the API | [ADR-003](docs/decisions/ADR-003-cloudinary.md) |
| Language | isiXhosa → English first; evaluation before model selection | [ADR-004](docs/decisions/ADR-004-isi-xhosa-first.md) |
| AI providers | Provider abstraction; OpenAI, Nebius, self-hosted open models as candidates | [ADR-005](docs/decisions/ADR-005-ai-provider-abstraction.md) |
| Orchestration | Deterministic pipeline; no agent framework in Release 1 | [ADR-006](docs/decisions/ADR-006-agent-orchestration.md) |
| API framework | Fastify + Zod | [ADR-007](docs/decisions/ADR-007-api-framework.md) |
| Data access | Drizzle ORM with reviewed SQL migrations | [ADR-008](docs/decisions/ADR-008-data-access.md) |
| Jobs | Graphile Worker on PostgreSQL + domain `processing_jobs` table | [ADR-009](docs/decisions/ADR-009-job-queue.md) |

## Repository layout

```
apps/web                    Next.js PWA (mobile-first UI)
apps/api                    Fastify HTTP API (the only writer of domain state from user actions)
workers/story-processing    Background jobs: media verification, ASR, flagging, translation, verification, deletion, export
packages/database           Drizzle schema, migrations, repositories
packages/shared-types       Domain enums and TypeScript types (no runtime deps)
packages/validation         Zod schemas shared by API, web, worker
packages/ai-providers       ASR / LLM provider abstraction + adapters
packages/agent-workflows    AI role modules (Listener, Cultural Context, Translator, Verifier), prompts, output schemas
packages/media-storage      MediaStorageProvider interface + Cloudinary adapter
packages/auth               Sessions + deterministic authorisation policy (`can()`)
infrastructure/railway      Railway IaC plan and runbooks
infrastructure/database     Migration policy, extensions, backup/restore runbooks
docs/                       Specifications (authoritative)
tests/                      Cross-package unit, integration, e2e, evaluation, security suites
spikes/                     (M0 only, created then) throwaway experiments + REPORT.md; never imported
```

Every folder contains a `README.md` describing its responsibilities and boundaries.

## Where to begin

1. **Product:** [`docs/VISION.md`](docs/VISION.md) → [`docs/PRD.md`](docs/PRD.md) → [`docs/USER_JOURNEYS.md`](docs/USER_JOURNEYS.md)
2. **Rules that must never be broken:** [`docs/CONSENT_AND_OWNERSHIP.md`](docs/CONSENT_AND_OWNERSHIP.md), [`docs/SECURITY_AND_PRIVACY.md`](docs/SECURITY_AND_PRIVACY.md)
3. **Build plan:** [`docs/MILESTONES.md`](docs/MILESTONES.md) — implement **one milestone at a time**
4. **For AI coding assistants:** [`AGENTS.md`](AGENTS.md)
5. **What is still undecided:** [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md), [`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md)

## Setup expectations (once Milestone 1 lands)

- Node.js LTS (≥ 22; see `docs/DEVELOPMENT_WORKFLOW.md`), pnpm, Docker (for local PostgreSQL), ffmpeg (worker).
- Copy `.env.example` → `.env.local`. **Never commit real credentials.**
- Local development runs against local PostgreSQL and **fake** AI/media providers by default; real providers are opt-in per developer with their own test accounts.

See [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) and [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md).

## Important caveats

- **Language quality is unproven.** No ASR or translation model has yet been benchmarked by this project on isiXhosa oral storytelling. See [`docs/ASR_BENCHMARK.md`](docs/ASR_BENCHMARK.md).
- **Not legal advice.** POPIA and related analysis in this repo identifies issues for qualified legal review; documented controls do not by themselves make the product compliant.
- Provider facts were verified on 2026-11-04 against official documentation ([`docs/SOURCES.md`](docs/SOURCES.md)) and must be re-checked before production.
