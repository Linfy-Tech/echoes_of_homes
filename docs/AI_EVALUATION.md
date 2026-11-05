# AI Evaluation Framework

How we measure and protect AI quality across development, release, and production. Specific benchmark protocols: `ASR_BENCHMARK.md`, `TRANSLATION_EVALUATION.md`.

**Honesty rule:** results are reported only from runs that happened, with dataset version, settings, model IDs, and date. Untested properties are labelled "not yet measured".

## 1. Evaluation layers

| Layer | What | When | Data |
|---|---|---|---|
| L1 Schema & contract | Role outputs validate against Zod schemas; adapters map provider responses correctly | Every PR (CI) | Recorded provider responses (fixtures), synthetic |
| L2 Behavioural fixtures | Deterministic checks on recorded model outputs: no text changes by Context role, IDs/substrings valid, markers preserved, injection fixtures produce no unsafe actions | Every PR touching `agent-workflows`/`ai-providers` | Synthetic isiXhosa-like fixtures + consented eval snippets (access-controlled) |
| L3 Offline benchmark | Full ASR/translation/verifier metrics | M0, on model/prompt change, quarterly | Echoes Eval Set (dev/test) |
| L4 Human evaluation | Ratings by fluent bilingual reviewers; timed review studies | M0, before R1, on major change | Eval set |
| L5 Production monitoring | Content-free quality metrics from reviewer actions | Continuous | Production (numbers only) |

CI never calls live providers. L3/L4 runs happen in a controlled evaluation environment with eval-only credentials.

## 2. Regression gates for changes

A change to a model ID, prompt version, chunking, or flag thresholds must include an evaluation report showing, on the dev set:
- No regression beyond confidence intervals on CER/EER (ASR) or critical-error rate / entity preservation (translation).
- Uncertainty recall not below gate (`ASR_BENCHMARK.md` §7).
- Schema-invalid rate ≤ 1% of calls.
The test set is used only for final selection decisions, not iterative tuning.

## 3. Hallucination and omission tests

- Non-speech fixtures (silence, room noise, music, TV) → expected empty or flagged output.
- Long pauses mid-story; abrupt end; very fast speech; repeated phrases.
- Translation: inputs with uncertainty markers, inaudible segments, glossary terms, numbers, negations, kinship terms — check preservation.
- Context role: confirm zero text modifications and no meaning assertions (lexical rule: questions must end with `?`; ban phrases like "means", "refers to", "is the clan of" in outputs — tuned with reviewers).

## 4. Uncertainty calibration

1. On the dev set, collect per-token/segment signals (provider confidence/logprobs if available, heuristics).
2. Label each hypothesis span as correct/incorrect via alignment with reference.
3. Choose thresholds per provider+model to maximise recall at an acceptable precision (target operating point: recall ≥ 0.80 on entity/number errors; overall flag density ≤ 1 flag per 20 words — provisional, adjust with reviewer feedback).
4. Report reliability diagrams and expected calibration error where confidence values exist.
5. Store thresholds in config with the evaluation report ID; re-calibrate on model change.

## 5. Production monitoring (content-free)

Computed at transcript approval / translation approval and stored as numbers:
- Machine→final CER/WER per story (from `machine_text` vs approved text), flags raised, flags corrected, flags accepted as uncertain, segments edited share.
- Translation: segments edited share, verifier issues raised/resolved/dismissed by check ID.
- Review time (active editing minutes) per audio minute.
Dashboards by provider/model/prompt version; alerts on drift > 20% vs baseline over a rolling 4-week window. (Consent implications of computing these metrics: OQ-027.)

## 6. Human evaluation operations

- Rater recruitment, training, calibration sessions, fair pay; raters sign confidentiality agreements.
- Blind, randomised presentation; agreement statistics reported.
- Rater feedback captured as structured notes to improve prompts and guidelines.

## 7. Reporting template

`tests/evaluation/reports/<kind>-<YYYY-MM-DD>.md`:
```
Dataset: name, version, hash, split
Systems: provider, model ID, version label, prompt ID@version, settings
Metrics: table with 95% CIs
Stratified results: variety, age band, condition, code-switch density
Cost & latency
Failure examples (described, no raw personal content unless consented and access-controlled)
Limitations
Decision / recommendation
```

## 8. Not yet measured (as of this specification)

All metrics for all candidates; reviewer time per audio minute; flag calibration; translation critical-error rates; verifier recall. These are M0 deliverables.
