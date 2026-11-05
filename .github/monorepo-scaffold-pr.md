# [M1] Monorepo scaffold and CI skeleton

## Milestone / slice
M1 / monorepo-scaffold, branch `m1/monorepo-scaffold`, targeting `main`.

## What changed (files)
- Root pnpm/Turbo/TypeScript/ESLint configuration and ten workspace manifests/configs.
- `tooling/boundaries.mjs` and `tests/unit/`: dependency boundaries and config regressions.
- `packages/validation/src/env.ts`: non-secret env scaffold, fake local defaults, public sharing off.
- `.github/workflows/ci.yml`: typecheck, lint (including boundary tests), config tests, Gitleaks.
- `docs/OPEN_QUESTIONS.md`: alternatives only; founder retains OQ-012/OQ-013 decisions.

Dependencies: pnpm 12.16.1 (MIT, workspace/package-manager pin); Turbo 2.11.10 (MIT, task orchestration); TypeScript 5.9.3 (Apache-2.0, compatible compiler); ESLint 10.14.0 + typescript-eslint 8.72.1 (MIT, TS parsing and boundaries); Zod 4.6.7 (MIT, runtime validation). Gitleaks 8.30.0 (MIT) runs as an external scanner. Licences checked from installed metadata/distribution. TS is within typescript-eslint's supported peer range; ESLint 10 avoids deprecated ESLint 9. No framework or provider SDK installed.

## Spec references implemented (doc §)
`ARCHITECTURE.md` §4; `DEVELOPMENT_WORKFLOW.md` §1/§3/§5/§6; `SYSTEM_DESIGN.md` §2/§12; `SECURITY_AND_PRIVACY.md` §9. This implements only the scaffold portion of M1, not the milestone's staging acceptance criteria.

## Tests added / run (commands + results)
- `pnpm install --frozen-lockfile --offline`: passes with temporary pnpm 12.16.1.
- `pnpm typecheck`: all ten workspaces pass locally.
- `pnpm lint`: passes, including forbidden-import CLI exit-code regression.
- `pnpm test`: five tests pass (allowed/forbidden import matrix, lint CLI, env defaults, invalid config).
- Gitleaks 8.30.0 `dir <tracked-and-untracked-snapshot> --redact` and `git . --redact`: no leaks.
- `git diff --check`: passes. Checks run on Node 24.15.0. Hosted CI results will be recorded on the PR after publication; its runtime step prints the exact version.

## Assumptions made
- Founder explicitly authorised Node 24 LTS fallback after diagnosing Node 26.13.0. `.nvmrc` pins 24.15.0; engines restrict Node to `>=24.15.0 <25`; CI reads `.nvmrc`. This is an authorised exception to DEVELOPMENT_WORKFLOW §1's current Active LTS preference. The clean Node 26 npm archive matched its registry SHA-512 integrity, and its fully extracted 150,084,448-byte x86_64 binary still aborted with missing `__libcpp_verbose_abort` in system libc++. `otool -l` reports minimum macOS 13.5; this host is 12.7.6. [Node 26 supported platforms](https://github.com/nodejs/node/blob/v26.13.0/BUILDING.md#platform-list). Node 24.15.0 starts locally.
- Workspace scope is `@echoes-of-home`; provider adapter location is `src/adapters/`. External imports fail closed; later slices must explicitly review/extend the allowlist alongside dependencies. Relative imports stay inside a workspace.
- Env parsing takes an explicit input object, strips unrelated variables, and throws without rejected values. Service-specific secrets and startup wiring belong to later slices.
- The explicit slice request defers integration/contract/e2e/dependency-scan CI from the general M1/AGENTS requirements until corresponding components exist. Native Node tests avoid another runner for this tooling slice.

## Known limitations / follow-ups
- Lint enforces imports and placement of named policy entry points, not arbitrary program semantics or authorisation correctness. Later policy/route tests and review remain required. No runtime auth, consent, server, schema, or UI exists.
- Automated review only: two separate Codex sub-agents were launched via `collaboration.spawn_agent`, each with the `reviewer` role and read-only instructions. `review_boundaries` checked dependency/import-rule bypasses; `review_scaffold` checked workspace/TypeScript/Turbo/CI/env configuration. They reported boundary bypasses and missing TSX discovery; fixes were applied and regression checks passed. These were separate automated review tasks within the same Codex session, not independent human reviews. This work has not yet had human review.
- Founder approved one slice with the generated lockfile reviewed separately: handwritten changes remain below 600 lines; lockfile is 1,120 generated lines. The generated lockfile remains part of this single slice, as authorised.
- M0 rows/ADR-009 still describe already-completed spikes as open/proposed; left untouched in this slice. OQ-002, latency, and founder's M0 tracks remain outside scope.

## Open questions raised (OPEN_QUESTIONS.md IDs)
### OQ-012 — authentication (proposal only)
- [Better Auth](https://better-auth.com/docs/plugins/email-otp): maintained OTP tooling; exact session/schema/security contract needs a fit review.
- Minimal in-house sessions using vetted `node:crypto`: exact contract control; greater security and maintenance burden.
Recommend evaluating Better Auth first against `SECURITY_AND_PRIVACY.md` §7. Email-provider choice remains open; fake email stays the local default. No selection implemented.

### OQ-013 — observability (proposal only)
- [Grafana Cloud OTLP](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/): unified telemetry backend; retention/cardinality controls required.
- [Better Stack OTLP](https://betterstack.com/docs/logs/open-telemetry/): hosted alternative; metric/trace coverage and cost need review.
Recommend a synthetic, content-free comparison; confirm region, DPA, redaction, retention, and costs before founder selection. No vendor selected.

## Security & privacy check (constraints in AGENTS.md §5 touched? how verified?)
§5.1: policy entry-point placement and import boundaries tested; policy implementation deferred. §5.5: public sharing cannot be enabled in the R1 scaffold. §5.9–10: no credentials/content added; Gitleaks clean; config errors exclude values. No routes, data processing, external provider calls, or infrastructure changes.
