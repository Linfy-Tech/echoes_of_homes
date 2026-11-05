# AI Workflow and Role Design

**Principle:** AI drafts and flags; deterministic code enforces; humans decide. The workflow is a **fixed pipeline of typed steps**, not an autonomous agent. The six logical roles from the concept are kept as named modules for clarity, but each is implemented as the simplest mechanism that works.

| Role | Implementation | Where |
|---|---|---|
| Guardian | **Deterministic code only** (consent gate + authorisation policy). No model. | `packages/auth`, `packages/database/domain` |
| Listener | Deterministic audio code + ASR model call(s) + deterministic uncertainty heuristics | worker `asr.transcribe`, `packages/agent-workflows/listener` |
| Cultural Context Assistant | Single structured LLM call per batch + deterministic glossary matcher; **flags only** | worker `transcript.context_flags`, `packages/agent-workflows/context` |
| Translator | Structured LLM call per segment batch | worker `translation.generate`, `packages/agent-workflows/translator` |
| Verifier | Deterministic checks + structured LLM call; back-translation diagnostic in R2 | worker `translation.verify`, `packages/agent-workflows/verifier` |
| Story Publisher | **Deterministic code only** (snapshot + policy check). No model. | `packages/database/domain/storyVersion` |
| Human review | Reviewer and rights-holder UI actions | `apps/web`, `apps/api` |

Why not an agent framework in Release 1: every step has fixed inputs, outputs, and ordering; we need reproducibility, provenance, cost control, and tight data boundaries. Agent autonomy (choosing tools, looping) adds non-determinism and injection surface without benefit. See ADR-006 for when this may change.

---

## 1. Common rules for every model-backed role

1. **Input boundary:** models receive only the minimum data for the step (segment text + IDs; approved glossary terms; no user emails, no consent data, no other stories).
2. **No tools, no side effects.** Model calls cannot call functions, fetch URLs, or write anything. The worker persists validated outputs.
3. **Structured output** validated by Zod schemas in `packages/agent-workflows/<role>/schema.ts`. Invalid → one retry → step failure (never "best-effort parse").
4. **Output can never change authorisation, consent, audience, status beyond the step's own machine-defined transition, or delete anything.**
5. **Untrusted content handling:** transcript text, titles, and glossary entries are user/ASR content and may contain instructions ("ignore previous instructions…", spoken or typed). Prompts place them inside clearly delimited data blocks, state that the content is data to be processed, and outputs are checked deterministically (IDs must match inputs, spans must be substrings, categories must be enumerated). Injection can at worst produce a bad suggestion that a human reviews — never an action.
6. **Provenance:** every call writes a `model_runs` row (provider, model ID, prompt ID + version, params, input/output hashes, cost, latency, outcome).
7. **Prompt versioning:** prompts live in `packages/agent-workflows/prompts/<role>/<semver>.md` with frontmatter (`id`, `version`, `owner`, `evaluatedAt`, `evalReport`). A prompt or model change requires an evaluation run on the fixture set and an updated `evalReport` link (`AI_EVALUATION.md`).
8. **Logging:** log IDs, counts, durations, outcome codes. **Never** log prompts or completions in production. Provider-side retention follows `AI_PROVIDER_STRATEGY.md` §4.
9. **Temperature** 0 (or provider minimum) for all roles; deterministic seeds where supported.
10. **Provider-agnostic:** roles call `packages/ai-providers` interfaces (`AsrProvider`, `TextModelProvider`), never SDKs directly.

---

## 2. Guardian (deterministic)

**Responsibility:** decide whether a step may run and whether an actor may act — using consent scopes, story state, roles, and audience.
**Non-responsibilities:** content moderation; judging sensitivity of content; legal judgement.
**Inputs:** actor, action, resource context (`SYSTEM_DESIGN.md` §2), active consent scopes.
**Outputs:** `allow | deny(reason)`.
**Data access:** consent, roles, memberships, story metadata (no content).
**Injection risk:** none (no model).
**Validation:** exhaustive table-driven tests for every action × role × state; property tests that no `deny` path performs a write.
**Failure behaviour:** fail closed (errors → deny).
**Human review:** policy changes require code review by two people (founder + one reviewer) and a spec update.
**Observability:** deny counts by reason code; alert on spikes.

> An optional *advisory* model that suggests "this story mentions health information about a third party" may be evaluated in R2. It would only show a notice to the rights holder; it would never gate or permit anything.

## 3. Listener (code + ASR model)

**Responsibility:** produce a faithful isiXhosa(/code-switched) machine transcript with timestamps and explicit uncertainty — without inventing words.
**Non-responsibilities:** correcting spelling to "standard" isiXhosa; interpreting meaning; speaker identification (no voice biometrics — see `SECURITY_AND_PRIVACY.md` §2).

### 3.1 Steps
1. Audio prep and chunking (`SYSTEM_DESIGN.md` §5) — code.
2. Language hinting: request `xh` (and `en` for code-switching) where the provider supports hints (e.g. `languages` on `gpt-transcribe` **[VERIFIED S2]**; whether isiXhosa is a supported value is **UNVERIFIED** — OQ-001).
3. Keyword hints: approved family glossary terms (names, places) where supported (`keywords` on `gpt-transcribe` **[VERIFIED S2]**). Hints are sent only with `ai_transcription` consent; they are personal data and are covered by the same disclosure.
4. ASR call per chunk (primary provider; optional secondary provider when `FEATURE_SECONDARY_ASR` for disagreement detection).
5. Stitch, segment (code).
6. Uncertainty detection (code, §3.2).

### 3.2 Uncertainty signals → flags

| Signal | Flag reason | Notes |
|---|---|---|
| Token logprobs below calibrated threshold (only where provider returns them, e.g. `gpt-4o-transcribe` family **[VERIFIED S2]**; not documented for `gpt-transcribe`) | `low_confidence` | Threshold calibrated on benchmark set (`AI_EVALUATION.md` §4) |
| Provider word/segment confidence (e.g. Google `chirp_2` word-level confidence **[VERIFIED S21]**) | `low_confidence` | Provider-specific scales; never compared across providers |
| Text emitted where audio energy indicates silence/noise | `suspected_hallucination` | Energy from ffmpeg `astats` per segment |
| Repeated n-gram loops (≥ 3 repeats of the same 3+ word span) | `suspected_hallucination` | Known ASR failure mode |
| Characters-per-second outside plausible range | `suspected_hallucination` / `low_confidence` | Range calibrated per language on benchmark |
| Detected language ≠ expected for a region | `code_switch` | Informational unless combined with low confidence |
| Digits or number words | `number_or_date` | Always flagged for confirmation |
| Primary vs secondary ASR differ beyond threshold (normalised CER on segment) | `asr_disagreement` | R1 optional |
| Overlapping speech detected (energy + provider hint) | `overlap` | Heuristic; low precision expected |
| Segment with no ASR output but speech energy | `inaudible` (proposed) | Reviewer decides |

**Rule:** the Listener never fills gaps or "repairs" text. `machine_text` is stored exactly as returned (whitespace-normalised).

### 3.3 Inputs / outputs
- Input: processing derivative audio chunks; language hints; approved glossary terms.
- Output (per chunk, validated): `{ text, segments?: [{startMs, endMs, text, confidence?}], languages?: string[], logprobs?: [...] }` mapped from provider response by the adapter.

### 3.4 Failure & retry
Retryable: timeouts, 429, 5xx. Permanent: unsupported format (after one re-encode attempt), schema mismatch twice. Partial-chunk results persisted in `job_step_results`; retries skip completed chunks.

### 3.5 Evaluation
WER/CER, entity error rate, hallucination rate on silence/noise fixtures, uncertainty recall/precision (`ASR_BENCHMARK.md`).

## 4. Cultural Context Assistant (LLM, flags only)

**Responsibility:** point reviewers at places that probably need human knowledge: possible person names, clan names (*iziduko*), praise names, place names, kinship terms, idioms, culturally specific expressions — and ask a short question for each.
**Non-responsibilities:** explaining meaning; asserting that something *is* a clan name; correcting text; adding glossary entries; inferring relationships.

- **Inputs:** segment IDs + current text (batched ≤ ~3,000 characters), approved glossary terms (term + category only), instructions.
- **Output schema:**
  ```ts
  { flags: Array<{
      segmentId: Uuid;               // must be in input batch
      quote: string;                 // must be an exact substring of that segment's text
      category: 'possible_name'|'possible_clan_name'|'possible_praise_name'|'possible_place'|'kinship_term'|'idiom';
      question: string;              // ≤ 160 chars, phrased as a question to the reviewer
  }> }
  ```
- **Deterministic post-validation:** segmentId ∈ batch; `quote` found (first occurrence → char offsets); category enumerated; question ≤ 160 chars and ends with `?`; max 1 flag per 8 words of input (anti-flood). Invalid items dropped and counted (`context_assist.invalid_items` metric).
- **Glossary matcher (code):** exact/case-insensitive matches of approved glossary terms add `possible_*` flags with source `heuristic` and pre-filled question "Glossary term — please confirm spelling?".
- **Failure:** non-fatal. If the step fails permanently, the transcript still moves to `in_review` with a banner "Name and phrase hints unavailable".
- **Human review:** every flag is resolved or accepted by a person (`MACHINE.md` §5).
- **Evaluation:** precision/recall of flags against annotator-marked names and culturally specific terms; rate of "meaning assertions" in `question` text (target 0, checked by a lexical rule + manual sample).

## 5. Translator (LLM)

**Responsibility:** produce segment-aligned English **close** and **natural** variants from an approved isiXhosa transcript.
**Non-responsibilities:** translating unapproved text; explaining culture; resolving uncertainty; summarising; adding context.

- **Precondition (code):** transcript version `approved_for_translation` (DB trigger + service), `translation` consent, budget.
- **Inputs:** batches of consecutive segments (with ±2 neighbouring segments as read-only context), approved glossary terms with human-written explanations, segment render flags (`accepted_as_uncertain`, `inaudible`).
- **Output schema (per segment):**
  ```ts
  { segmentId: Uuid; close: string; natural: string;
    preservedTerms: string[];          // terms kept in isiXhosa form
    translatorQueries?: string[] }     // ≤ 2 short questions for reviewer; become warnings
  ```
- **Rules in prompt and checked in code:** keep names/clan names/praise names/approved glossary terms verbatim; uncertain spans become `[unclear in the original]`; inaudible segments become `[inaudible in the original]` (rendered by code, not the model — such segments are not sent); no added explanations, honorifics translations follow glossary when present; no omission of content.
- **Deterministic validation:** one output per input segment ID; non-empty; preservedTerms ⊆ terms found in source; markers present where required. Failures → one retry for the batch → step failure.
- **Retry:** retryable errors as standard; failing batch does not discard successful batches.
- **Human review:** translation reviewer reviews every segment (`MACHINE.md` §7).
- **Evaluation:** human adequacy/fluency ratings, entity preservation, omission/addition rates (`TRANSLATION_EVALUATION.md`).

## 6. Verifier (code + LLM)

**Responsibility:** find likely translation defects for the human reviewer.
**Non-responsibilities:** approving or rejecting; rewriting translation.

Deterministic checks (always run; versioned IDs):

| Check ID | What | Severity |
|---|---|---|
| `seg.alignment` | Every included source segment has exactly one translation segment | blocking |
| `num.mismatch` | Digit sequences / dates in source ↔ translation differ | blocking |
| `name.missing` | Approved glossary terms and reviewer-confirmed name/place/clan spans present verbatim in both variants | blocking |
| `marker.missing` | Uncertain/inaudible markers preserved | blocking |
| `empty.output` | Empty variant | blocking |
| `len.ratio` | Char-length ratio outside calibrated band | warning |
| `query.open` | Translator raised a query | warning |

Model-assisted checks (one structured call per batch):
```ts
{ issues: Array<{ segmentId: Uuid;
    kind: 'omission'|'addition'|'relationship_changed'|'negation_changed'|'unsupported_claim'|'name_changed';
    sourceQuote?: string;  // must be substring of source segment
    targetQuote?: string;  // must be substring of translation
    explanation: string;   // ≤ 200 chars
}> }
```
Validated like §4. `relationship_changed`, `name_changed`, `negation_changed` are **blocking**; others warnings. If the model step fails, the report is `incomplete`, which adds a blocking issue "Automated check incomplete — reviewer must confirm manual check" (dismissable with reason).

**Back-translation (R2):** English → isiXhosa by a different model, shown to reviewers only as "a rough check", never as evidence of correctness (FR-VER-03).

**Evaluation:** seeded-defect test set (deliberately corrupted translations: dropped clause, swapped kinship term, changed number, added sentence) → detection recall per kind; false-positive rate on clean translations.

## 7. Story Publisher (deterministic)

**Responsibility:** assemble the bilingual story version and enforce publication rules.
- Creates `story_versions` only when: actor is rights holder; transcript `approved_for_translation`; translation `approved` or absent with `translation` not granted; no open blocking issues.
- Computes `snapshot_hash`; marks prior version `superseded`.
- Does **not** change audience (FR-FIN-02). Audience changes go through `story.audience.change` with consent checks.
- No model involvement in formatting; reader layout is deterministic UI code.

## 8. Human review points (summary)

| Point | Who | Blocks |
|---|---|---|
| Consent | Storyteller (self/assisted) | All processing |
| Transcript segment review & flag resolution | Transcript reviewers | Transcript approval |
| Accepting uncertainty | Rights holder | — (allows approval with visible uncertainty) |
| Transcript approval for translation | Rights holder | Translation |
| Translation review & issue resolution | Translation reviewer | Final approval |
| Final approval | Rights holder | Story version |
| Sharing | Rights holder (within consent) | Audience |
| Glossary approval | Rights holder of source story | Use as hints/constraints |

## 9. OpenAI Agents SDK evaluation (for ADR-006)

**VERIFIED [S5][S6]:** The TypeScript SDK (`@openai/agents`, MIT, Node 22+) supports input/output/tool guardrails, tool approval via `needsApproval` with `interruptions` and serialisable run state for later resumption.

Where it *could* add value later (R2+):
- An interactive "Ask about this phrase" helper for reviewers (read-only tools over the same story's approved glossary), where the human approval pattern maps naturally to `needsApproval`.

Why not in R1:
- No R1 step needs autonomous tool selection or multi-turn planning.
- Additional data-flow surface: SDK tracing behaviour and whether trace content leaves our infrastructure by default is **UNVERIFIED** — if adopted, tracing must be disabled or routed to our own processor before any story content passes through it (OQ-007).
- OpenAI's data-controls page lists "Agents" among endpoints that are **not** ZDR-eligible **[VERIFIED S4]**; whether the SDK's normal calls go only through ZDR-eligible endpoints (e.g. Responses) must be confirmed before use (OQ-007).
- Our deterministic pipeline already provides checkpoints, approvals, and resumability via the state machines.

## 10. Observability for AI steps

Metrics per role and model: calls, latency p50/p95, error rate by code, schema-invalid rate, cost per audio minute, flags per minute by reason, reviewer edit rate per segment (from `segment_revisions`), verifier issue rates. Dashboards in `OBSERVABILITY.md`.
