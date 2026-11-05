# Translation Evaluation Plan (isiXhosa → English)

**Status: NOT YET RUN.** No translation model has been evaluated by this project.

## 1. Purpose

Choose the translation model and prompt for the Translator role, calibrate the Verifier, and set acceptance criteria — using human judgement by fluent bilingual reviewers as the primary signal.

## 2. Candidates

Text-model candidates are accessed through `TextModelProvider` (`AI_PROVIDER_STRATEGY.md`):
- OpenAI general-purpose models (current model IDs chosen at evaluation time from OpenAI's model list; record exact IDs and dates).
- Open-weight models served by Nebius Token Factory (model IDs chosen at evaluation time; ZDR enabled; dedicated endpoint for production region stability **[S16]**).
- Specialist MT systems (e.g. Google Cloud Translation) as baselines — terms and isiXhosa support to verify.
- Models with non-commercial licences (e.g. NLLB family is believed to be CC-BY-NC — **UNVERIFIED**) are **baseline-only** and cannot be selected.

## 3. Test set

- Source: approved gold transcripts from Echoes Eval Set v1 (`ASR_BENCHMARK.md` §3) — same research consent, which must explicitly cover translation testing.
- Size (provisional): 300–500 segments across ≥ 20 recordings, stratified by variety, content type (narrative, dialogue, praise poetry, code-switched), and presence of names/kinship terms/idioms/numbers.
- **References:** two independent human English translations per segment (close + natural guidance given), by experienced isiXhosa–English translators; differences kept (multiple valid translations).
- Glossary for test families created by annotators (names, clan names, kinship terms).

## 4. Human evaluation protocol

- Raters: ≥ 3 fluent bilingual raters per segment (mix of Eastern Cape and Western Cape backgrounds), blind to system identity, randomised order.
- Each rater sees: source isiXhosa segment (+ audio optional), ±2 context segments, candidate close and natural translations.
- Ratings per variant:

| Dimension | Scale | Definition |
|---|---|---|
| Adequacy | 1–5 | How much of the source meaning is preserved |
| Fluency (natural only) | 1–5 | Reads as natural English |
| Entity handling | pass/fail | Names, clan/praise names, places preserved correctly |
| Kinship/relationship | pass/fail/NA | Relationships not changed or over-specified |
| Cultural term handling | 1–3 | Kept / acceptably rendered / distorted |
| Critical error | yes/no + type | Meaning reversal, negation flip, wrong person/relationship, invented fact, harmful mistranslation, omission of a clause |

- Agreement: Krippendorff's α reported per dimension; low-agreement items discussed in calibration sessions.
- Automatic metrics (chrF, BLEU, COMET-style if a suitable model exists for isiXhosa) reported **only as secondary signals**; they are known to be unreliable for low-resource and morphologically rich languages and cannot overrule human ratings.

## 5. Deterministic checks (also used by the Verifier)

Entity preservation rate, number/date match rate, segment alignment completeness, marker preservation, length-ratio distribution (to calibrate `len.ratio` band).

## 6. Verifier evaluation (seeded defects)

Create a seeded-defect set from good translations by applying controlled corruptions: drop a clause, add a sentence, swap a kinship term (e.g. grandmother ↔ mother), change a number/date, alter a name, flip a negation, add an unsupported cultural explanation. Measure:
- Detection recall per defect type (target provisional: ≥ 0.9 for number/name/marker — deterministic; ≥ 0.7 for model-detected kinds),
- False-positive rate on clean translations (target provisional: ≤ 1 blocking issue per 20 segments).

Back-translation (R2) is evaluated as a diagnostic only: does showing it help raters catch errors faster? Never as an automatic pass/fail.

## 7. Selection gates (provisional)

| Gate | Threshold |
|---|---|
| T-LIC | Licence/data terms permit commercial use; no training on inputs; retention acceptable or ZDR |
| T-CRIT | Critical-error rate ≤ 2% of segments (natural variant), ≤ 1% (close variant) |
| T-ENT | Entity preservation ≥ 98% with glossary constraints |
| T-ADQ | Median adequacy ≥ 4 on both variants |
| T-OPS | Stable availability; cost within budget |

Thresholds are provisional and revised after the first run with rationale recorded here.

## 8. Production monitoring

Per approved translation: share of segments edited by reviewers, edit distance (content-free numbers), verifier issues raised vs dismissed. Drift > 20% from baseline triggers review.

## 9. Results

| Date | Test set version | Model (exact ID) | Prompt version | Adequacy (close/natural) | Fluency | Critical errors | Entity pres. | Cost / 1k segments | Notes |
|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | **not run** | | | | | |
