# AGENTS.md — Instructions for AI coding agents (Codex and others)

This file is the **canonical** instruction set for any AI coding agent working in this repository. `CLAUDE.md` defers to this file. If anything in another instruction file conflicts with this one, this file wins — and you must report the conflict.

---

## 1. What this project is

Echoes of Home preserves oral histories (isiXhosa first, English translation) with consent, human review, and private-by-default sharing. Read `README.md` and `docs/VISION.md` once before your first task.

## 2. Authority of documents

When documents disagree, the higher-ranked document wins. Report every conflict you find; do not silently pick one.

| Rank | Documents | Governs |
|---|---|---|
| 1 | `docs/CONSENT_AND_OWNERSHIP.md`, `docs/SECURITY_AND_PRIVACY.md`, `docs/RETENTION_AND_DELETION.md` | Non-negotiable rules |
| 2 | `docs/MACHINE.md` (state machines), `docs/DATA_MODEL.md`, `docs/API_CONTRACTS.md` | Exact behaviour, schemas, transitions |
| 3 | `docs/SPEC.md`, `docs/AGENT_DESIGN.md`, `docs/MEDIA_STORAGE.md`, `docs/AI_PROVIDER_STRATEGY.md` | Functional/non-functional requirements and component design |
| 4 | `docs/decisions/ADR-*.md` | Why choices were made; "Accepted" ADRs bind |
| 5 | `docs/MILESTONES.md`, `docs/DEFINITION_OF_DONE.md`, `docs/TEST_STRATEGY.md` | What to build now and how to prove it |
| 6 | `docs/PRD.md`, `docs/USER_JOURNEYS.md`, `docs/FEATURE_CATALOG.md`, other docs | Intent and context |

`docs/OPEN_QUESTIONS.md` items are **not** decided. Never implement a behaviour that depends on an open question unless the milestone explicitly says to implement the documented provisional default.

## 3. Before you write code

For every task:

1. Identify the milestone (`docs/MILESTONES.md`, e.g. `M3`). If the task is not in the current milestone, stop and say so.
2. Read the milestone's **Scope**, **Non-goals**, **Acceptance criteria**, and **Tests**.
3. Read every document the milestone lists under "Read first".
4. List the files you expect to touch and the tests you will add. Keep the change small enough to review in one sitting (guideline: < 600 changed lines excluding generated migrations and fixtures).
5. If a requirement is ambiguous, apply §6.

## 4. Scope discipline

- Implement **one milestone at a time**, and within it one reviewable slice at a time.
- **Do not implement undocumented behaviour.** If you believe something is missing, propose a spec change (§7) instead of coding it.
- Do not add dependencies without stating why, checking the licence, and recording it in the PR description. Copyleft (GPL/AGPL) and non-commercial (e.g. CC-BY-NC) licences are **not allowed** without an ADR.
- Do not "improve" unrelated code in the same change.
- Never build the whole product in one pass.

## 5. Non-negotiable constraints (never bypass, never weaken, never "temporarily disable")

1. **Authorisation** is enforced by `packages/auth` policy functions (`can(actor, action, resource)`) on every API route and every worker job that touches story data. No route without a policy check; a test must prove denial.
2. **Consent gates** are checked in code at enqueue time **and** at job start (consent can be withdrawn while a job is queued). See `docs/CONSENT_AND_OWNERSHIP.md`.
3. **AI never makes access, consent, sharing, publication, or deletion decisions.** Model output is untrusted data. It may create *suggestions* (flags, draft text) only.
4. **Translation only from a transcript version in state `approved_for_translation`.** Enforced by DB constraint/trigger and service check.
5. **Private by default.** New stories have `audience = private`. Changing audience requires the rights holder and an active consent scope.
6. **Original audio is immutable.** Never overwrite, transcode in place, or delete originals except through the deletion pipeline.
7. **No voice cloning / speech synthesis** of any storyteller's voice. Do not add TTS that imitates a speaker.
8. **No model training** on stories. Do not send story content to any provider endpoint or setting that permits training. Do not add fine-tuning jobs.
9. **No secrets in source control.** Use environment variables; update `.env.example` with placeholder names only.
10. **No raw audio, transcript text, translation text, names, or consent evidence in logs, traces, error reports, or analytics.** Log IDs and counts only.
11. **No public media URLs.** Story audio is uploaded as Cloudinary `authenticated` type and delivered through the API stream endpoint.
12. **Audit events** are written for every security- or consent-relevant action, in the same transaction as the change.
13. **Do not disable tests, lint rules, type checks, or security headers** to make a build pass.

If a task cannot be completed without violating one of these, stop and report.

## 6. Handling ambiguity and conflicts

- **Minor ambiguity** (naming, file placement, internal helper shape): choose the option most consistent with existing code and docs, note it in the PR description under "Assumptions".
- **Material ambiguity** (user-visible behaviour, data model, security, consent, cost): do not guess. Add an entry to `docs/OPEN_QUESTIONS.md` with a provisional recommendation and stop that part of the work.
- **Conflict between documents:** follow §2 ranking, and report the conflict with file/section references.

## 7. Changing the spec

When a decision changes:

1. Update the authoritative document(s) in the **same PR** as the code, or in a preceding docs-only PR.
2. For architectural changes, add or supersede an ADR (`docs/decisions/ADR-NNN-*.md`, status `Proposed` until a human accepts it).
3. Update `docs/MACHINE.md`, `docs/DATA_MODEL.md`, and `docs/API_CONTRACTS.md` together when any of them changes.
4. Never edit an ADR's decision after it is Accepted; supersede it.

## 8. Required tests per change

See `docs/TEST_STRATEGY.md`. Minimum for every change:

| Change type | Required tests |
|---|---|
| Domain logic / state transition | Unit tests for every allowed **and** at least one forbidden transition |
| API route | Contract test (request/response schema), authorisation denial test for each non-permitted role, validation error test |
| DB schema | Migration up test on a clean DB, constraint tests for new invariants |
| Worker job | Idempotency test (run twice → same result), retry/failure test, consent-withdrawn-mid-queue test where applicable |
| UI screen | Component test, axe accessibility check, keyboard-only path; e2e for journey changes |
| AI role / prompt | Schema-validation test on recorded fixtures, evaluation run on the fixture set (no live calls in CI) |
| Media / deletion | Fake-provider integration test; deletion propagation test |

CI must be green: typecheck, lint, unit, integration, contract. Never mark work complete with failing tests.

## 9. Reporting completed work

End every task with this report:

```
## Milestone / slice
## What changed (files)
## Spec references implemented (doc §)
## Tests added / run (commands + results)
## Assumptions made
## Known limitations / follow-ups
## Open questions raised (OPEN_QUESTIONS.md IDs)
## Security & privacy check (constraints in AGENTS.md §5 touched? how verified?)
```

Report failures honestly: if tests fail or something was not run, say so. Never claim something was tested, deployed, or verified if it was not.

## 10. Commands (to be finalised in M1)

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test            # unit
pnpm test:integration
pnpm test:e2e
pnpm db:migrate      # local only
pnpm eval:asr --fixtures   # offline, recorded fixtures
```

If a command does not exist yet, do not invent its behaviour — add it as part of M1.

## 11. Data handling while developing

- Use only synthetic or explicitly consented fixture data. Never paste real story audio or transcripts into prompts, issues, PRs, or logs.
- Fixtures containing isiXhosa text must be synthetic or come from the consented evaluation set under `tests/evaluation/` access rules.
- Default local config uses fake providers (`AI_PROVIDER_MODE=fake`, `MEDIA_STORAGE_PROVIDER=fake`).
