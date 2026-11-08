# ADR-005: Provider-neutral AI interfaces; models chosen by evaluation

- **Status:** Accepted (abstraction) · Provider selection blocked pending Echoes Eval Set v1
- **Date:** 2026-11-04

## Context
Candidate providers include OpenAI (current recommended transcription model `gpt-transcribe`; older transcription models deprecated with shutdown on 2027-02-26 **[S1]**), Nebius Token Factory for open-weight LLMs (ZDR option; public endpoints have "Global" region **[S16]**), self-hosted open ASR checkpoints (Apache-2.0 **[S19][S20]**), Google Cloud STT (`xh-ZA` listed for Chirp models **[S21]**), and Sunbird AI's Apache-2.0 SunflowerASR/Whisper adaptation plus its hosted STT API. Quality, data terms, regions, and availability differ and change over time.

## Decision
- `packages/ai-providers` defines `AsrProvider` and `TextModelProvider`; adapters per provider plus `fake`.
- Provider SDKs are imported only in adapters.
- Model IDs, prompt versions, and thresholds are configuration; every call is recorded in `model_runs`.
- No silent failover between providers (processor disclosure and quality must stay consistent).
- Deprecated models are never newly adopted for production (e.g. `gpt-4o-transcribe` may be used as a benchmark baseline only).

## Selection record (to be completed after M0)
| Role | Provider | Model ID | Settings | Eval report | Date |
|---|---|---|---|---|---|
| Listener (primary ASR) | TBD — provisional hosted lead: Google STT V2 `chirp_2`/`chirp_3` only because `xh-ZA` is documented; not selected | TBD | TBD | `tests/evaluation/reports/asr-2026-11-08.md` (no Echoes accuracy run) | 2026-11-08 |
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

The provisional hosted lead remains Google Cloud Speech-to-Text V2 because the
current supported-language table documents `xh-ZA` and a `chirp_2` entry in
`europe-west4`; this is a documentation-based lead, not a provider decision.
OpenAI remains a controlled-test candidate and Meta Omnilingual ASR a
self-hosted candidate. Lelapa AI Vulavula has a live REST API and paid plans,
but its current language-support table marks isiXhosa unavailable for
Transcribe/ASR (isiXhosa is listed for translation as beta/early access), so
it is excluded from the current xh ASR shortlist unless Lelapa grants access
or updates the documented capability.

Sunbird AI is now included as a sixth candidate. Its original
`Sunbird/asr-whisper-51-african-languages` model card documents Xhosa (`xho`)
and Sunbird-reported WER 0.262 / CER 0.054 on 126 examples. This is an
external, Sunbird-owned result—not an Echoes result—and is not assumed to be
oral-storytelling-domain audio. The model is a self-hostable Apache-2.0
release; Sunbird also operates a hosted STT endpoint using an OAuth2-style
token endpoint and Bearer access tokens. The hosted API's price is not publicly listed, while self-hosting
requires GPU operations, maintenance, scaling, and licence/data diligence.
Sunbird's hosted terms permit use of user content for model improvement or
training unless an authenticated user opts out, and allow processing in
Uganda or international cloud regions; this is a material privacy concern for
story audio.

The Sunbird point is directional only. It does not change the conclusion that
no real provider decision is possible until the Echoes Eval Set v1 is run with
the same methodology across candidates.
Azure standard STT is not currently listed for `xh-ZA` and is excluded unless
Microsoft confirms support.

Provider selection is blocked until Echoes Eval Set v1 is collected under
separate research consent, annotated, run through the offline harness, and
reviewed against `docs/ASR_BENCHMARK.md` §7. M4 can proceed only with the
provider-neutral pipeline/fake adapter or a flagged provisional adapter and a
mandatory re-evaluation step.
