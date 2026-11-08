# ADR-005: Provider-neutral AI interfaces; models chosen by evaluation

- **Status:** Accepted (abstraction) · Provider selection blocked pending Echoes Eval Set v1
- **Date:** 2026-11-04

## Context
Candidate providers include OpenAI (current recommended transcription model `gpt-transcribe`; older transcription models deprecated with shutdown on 2027-02-26 **[S1]**), Nebius Token Factory for open-weight LLMs (ZDR option; public endpoints have "Global" region **[S16]**), self-hosted open ASR checkpoints (Apache-2.0 **[S19][S20]**), and Google Cloud STT (`xh-ZA` listed for Chirp models **[S21]**). Quality, data terms, regions, and availability differ and change over time.

## Decision
- `packages/ai-providers` defines `AsrProvider` and `TextModelProvider`; adapters per provider plus `fake`.
- Provider SDKs are imported only in adapters.
- Model IDs, prompt versions, and thresholds are configuration; every call is recorded in `model_runs`.
- No silent failover between providers (processor disclosure and quality must stay consistent).
- Deprecated models are never newly adopted for production (e.g. `gpt-4o-transcribe` may be used as a benchmark baseline only).

## Selection record (to be completed after M0)
| Role | Provider | Model ID | Settings | Eval report | Date |
|---|---|---|---|---|---|
| Listener (primary ASR) | TBD — provisional hosted lead: Google STT V2 `chirp_2`/`chirp_3` only because `xh-ZA` is documented; not selected | TBD | TBD | `tests/evaluation/reports/asr-2026-11-08.md` (no accuracy run) | 2026-11-08 |
| Listener (secondary, optional) | TBD | | | | |
| Context assistant | TBD | | | | |
| Translator | TBD | | | | |
| Verifier | TBD | | | | |

## Consequences
Slightly more code than calling one SDK directly; in exchange we can benchmark, swap, and audit providers.

## M0 benchmark outcome (2026-11-08)

The repository has no real, consented isiXhosa audio or gold transcripts and
no access to the separate evaluation store. Therefore no candidate has
measured WER/CER, latency, entity accuracy, hallucination rate, uncertainty
recall, or review-effort results. No paid provider calls were made.

The provisional hosted lead is Google Cloud Speech-to-Text V2 because the
current supported-language table documents `xh-ZA` and a `chirp_2` entry in
`europe-west4`; this is a documentation-based lead, not a provider decision.
OpenAI remains a controlled-test candidate, Meta Omnilingual ASR a
self-hosted candidate, and Lelapa AI Vulavula a specialist candidate whose
current STT language list and commercial terms still require confirmation.
Azure standard STT is not currently listed for `xh-ZA` and is excluded unless
Microsoft confirms support.

Provider selection is blocked until Echoes Eval Set v1 is collected under
separate research consent, annotated, run through the offline harness, and
reviewed against `docs/ASR_BENCHMARK.md` §7. M4 can proceed only with the
provider-neutral pipeline/fake adapter or a flagged provisional adapter and a
mandatory re-evaluation step.
