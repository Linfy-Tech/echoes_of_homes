# Development Workflow

## 1. Prerequisites (finalised in M1)

- Node.js **LTS** — the OpenAI Agents SDK requires Node 22+ **[S6]**; use the current Active LTS line at M1 (record in `.nvmrc`/`package.json#engines`).
- pnpm (version pinned via `packageManager` field), Docker (local Postgres via Compose / Testcontainers), ffmpeg + ffprobe (worker), Playwright browsers (e2e).
- Railway CLI for IaC plan/apply and DB tunnels (maintainers only).
- The scaffold's pnpm 12.16.1 pin inherits its [24-hour release-age default](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/docs/settings/dependency-resolution.md#minimumreleaseage); the auth-storage slice adds no project override or exception.

## 2. Local setup

```bash
cp .env.example .env.local          # placeholders; local defaults use fake providers
pnpm install
docker compose up -d postgres       # added in M1
pnpm db:migrate
pnpm dev                            # web :3000, api :4000, worker
```

Local development never needs real provider keys. To test a real provider, a developer uses their **own** staging-scoped key, synthetic audio only.

## 3. Branching and PRs

- Trunk-based: short-lived branches `m<milestone>/<slice>` (e.g. `m3/upload-session-api`).
- PR title: `[M3] Upload session API (FR-UPL-02, FR-UPL-03)`.
- PR description uses the report template (`AGENTS.md` §9).
- Reviews: 1 reviewer; **2** for changes to `packages/auth`, consent, deletion, media access, migrations touching constraints, IaC.
- Conventional commits; commit messages never include content or personal data.

## 4. Working with Codex / Claude (spec-driven)

1. Pick the next slice from the current milestone (`MILESTONES.md`).
2. Prompt the agent with: milestone ID, slice, files allowed to change, AC IDs, and "read AGENTS.md and the milestone's Read-first docs".
3. Agent proposes a plan (files, tests) → human approves → agent implements → agent reports per `AGENTS.md` §9.
4. Human reviews diff + test output; runs the demo for the slice.
5. If the agent found a spec gap: docs-only PR first (or same PR) with `OPEN_QUESTIONS.md` entry.

Suggested slice prompt:
```
Milestone M<n>, slice "<name>". Read AGENTS.md, then docs listed under M<n> "Read first".
Implement only: <scope>. Acceptance criteria: <AC IDs>.
Do not touch: <paths>. Add tests per AGENTS.md §8. Report using AGENTS.md §9.
```

## 5. Code standards

- TypeScript strict; no `any` without justification comment; `noUncheckedIndexedAccess`.
- Zod for all external inputs (HTTP, env, provider responses, model outputs).
- Domain errors as typed results; no throwing strings.
- No provider SDK imports outside adapters (lint rule).
- No `console.log` in server code (lint rule); use logger.
- UI: semantic HTML first; components accessible by default; Tailwind; no inline styles for layout-critical sizes.

## 6. Spikes (M0 only)

Throwaway exploration code lives in `spikes/<topic>/` with a `REPORT.md`. Spikes are never imported by apps/packages and are deleted or archived after their findings are recorded in docs.

## 7. Definition of done

See `DEFINITION_OF_DONE.md`.
