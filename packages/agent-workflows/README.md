# packages/agent-workflows

The AI role modules — Listener heuristics, Cultural Context Assistant, Translator, Verifier — as pure functions: typed input → provider call via `packages/ai-providers` → Zod-validated output + deterministic post-validation (`docs/AGENT_DESIGN.md`).

- `prompts/<role>/<semver>.md` with frontmatter (`id`, `version`, `owner`, `evaluatedAt`, `evalReport`).
- `<role>/schema.ts` output schemas; `<role>/validate.ts` deterministic checks (IDs in batch, quotes are substrings, enums, lengths).
- No database, media, or network access other than through the injected provider interface. No tools/function-calling.
- Guardian and Story Publisher are **not** here — they are deterministic code in `packages/auth` and `packages/database/src/domain`.
