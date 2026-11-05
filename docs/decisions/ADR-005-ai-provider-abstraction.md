# ADR-005: Provider-neutral AI interfaces; models chosen by evaluation

- **Status:** Accepted (abstraction) · Pending (provider/model selection after M0)
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
| Listener (primary ASR) | TBD | TBD | TBD | TBD | TBD |
| Listener (secondary, optional) | TBD | | | | |
| Context assistant | TBD | | | | |
| Translator | TBD | | | | |
| Verifier | TBD | | | | |

## Consequences
Slightly more code than calling one SDK directly; in exchange we can benchmark, swap, and audit providers.
