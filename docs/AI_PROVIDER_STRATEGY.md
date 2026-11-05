# AI Provider Strategy

**Decision:** All model access goes through provider-neutral interfaces in `packages/ai-providers` (ADR-005). Models are selected by evaluation (`ASR_BENCHMARK.md`, `TRANSLATION_EVALUATION.md`), configured by environment, and recorded in every `model_runs` row.

## 1. Interfaces

```ts
// illustrative — finalised in M4
export interface AsrProvider {
  readonly id: string;                         // 'openai' | 'self_hosted' | 'google' | 'fake'
  capabilities(): AsrCapabilities;             // maxFileBytes, formats, languageHints, keywordHints, confidence, wordTimestamps
  transcribe(req: {
    audioPath: string; mimeType: string;
    languageHints: string[];                   // e.g. ['xh','en']; adapter maps to provider codes
    keywordHints: string[];                    // approved glossary terms only
    modelId: string; correlationId: string; signal: AbortSignal;
  }): Promise<AsrResult>;                      // normalised: text, segments?, languages?, tokenConfidence?, usage, providerRequestId
}

export interface TextModelProvider {
  readonly id: string;                         // 'openai' | 'nebius' | 'fake'
  generateStructured<T>(req: {
    modelId: string; promptId: string; promptVersion: string;
    system: string; dataBlocks: DataBlock[];   // untrusted content, delimited by the adapter
    schema: ZodType<T>; temperature: 0; maxOutputTokens: number;
    correlationId: string; signal: AbortSignal;
  }): Promise<{ output: T; usage: Usage; providerRequestId?: string }>;
}
```

Rules: adapters translate provider-specific options (e.g. OpenAI `languages`/`keywords` for `gpt-transcribe` **[S2]**), map errors to `RetryableError`/`PermanentError`, never log content, and expose capability flags so the Listener knows whether confidence signals exist.

The `fake` providers return deterministic fixture outputs (including injected failures and adversarial content) for tests and local development.

## 2. Provider landscape (verified facts only)

| Provider | Roles | Verified (2026-11-04) | Concerns |
|---|---|---|---|
| **OpenAI** | ASR (C1/C2), Translator, Verifier, Context | `gpt-transcribe` recommended; `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` deprecated with shutdown 2027-02-26 **[S1]**; 25 MB file limit **[S1]**; no training on API data by default; abuse logs ≤ 30 days; transcription ZDR-eligible with approval; EU/US regional processing for transcription **[S4]** | isiXhosa support for `gpt-transcribe` not documented **[S3]**; confidence signals only on deprecated models **[S2]** |
| **Nebius Token Factory** | Translator, Verifier, Context (open-weight LLMs) | No training on customer content; ZDR org-wide toggle; without ZDR, inputs/outputs retained in Finland for speculative decoding; public endpoints "Global" region; dedicated endpoints regional; DPA in ToS **[S16]** | Which open models handle isiXhosa well — evaluate; ASR availability UNVERIFIED |
| **Self-hosted open ASR** (Sunbird C3, Meta Omnilingual C4) | ASR | Apache-2.0 model licences **[S19][S20]** | GPU hosting, ops burden, training-data licence diligence (C3), preview status (C3) |
| **Google Cloud STT** | ASR (C5) | `xh-ZA` for `chirp_2`/`chirp_3` (one region table seen) **[S21]** | Region availability, terms, cost — verify |

Model identifiers are **not** hard-coded in docs as recommendations beyond what is verified; production IDs are chosen at evaluation time and recorded in `config` + ADR updates.

## 3. Selection process

1. Benchmark (M0) → candidate shortlist.
2. Gates (licence/data terms, quality, ops) per `ASR_BENCHMARK.md` §7 and `TRANSLATION_EVALUATION.md` §7.
3. Decision recorded by updating ADR-005 with chosen provider/model IDs, settings, evaluation report link, and date.
4. Prompt + model pair versioned together (`AGENT_DESIGN.md` §1.7).

## 4. Data controls checklist (per provider, before production use)

- [ ] DPA executed/accepted; operator obligations (security, breach notification "immediately" to us) covered.
- [ ] Training on our data disabled/not applicable (verified in provider docs/settings).
- [ ] Retention: ZDR/MAM approved (OpenAI: requires approval **[S4]**) or residual retention disclosed in consent (`RETENTION_AND_DELETION.md` §3 #6).
- [ ] Region: processing region recorded; matches consent disclosure.
- [ ] Separate projects/keys for staging and production; usage limits set in provider console.
- [ ] Logging/tracing features that store prompts in provider dashboards disabled where possible.

## 5. Fallback and outage behaviour

| Situation | Behaviour |
|---|---|
| Provider 429/5xx/timeouts | Retry with exponential backoff + jitter (base 5 s, max 10 min, max attempts per job type) |
| Circuit breaker | Open after 5 consecutive failures in 2 minutes per provider+model; jobs re-queued with delay; admin alert |
| Prolonged outage (> 1 h) | Stories show "Waiting for the writing-down service"; **no automatic failover to a different provider** unless that provider is (a) already selected through evaluation and (b) covered by the storyteller's consent disclosure. Rationale: silent failover changes processors and quality characteristics. |
| Model deprecation announced | Re-benchmark (`ASR_BENCHMARK.md` §8); migration planned before shutdown; deprecated models never newly adopted |

## 6. Versioning and reproducibility

- `model_runs` records `provider`, `model_id`, snapshot/version label if exposed, `prompt_id`, `prompt_version`, params.
- Config change of model ID requires: evaluation run, ADR-005 update, and a release note.
- Existing transcripts/translations are never silently regenerated when models change; regeneration is an explicit, consented action that creates a new version.

## 7. Cost management

- Unit prices in `packages/ai-providers/pricing.ts` with `source` URL and `verifiedAt`; stale prices warn at startup (`SYSTEM_DESIGN.md` §11).
- Budgets: daily and per-story (`AI_DAILY_BUDGET_USD`, `AI_PER_STORY_BUDGET_USD`).
- Weekly cost report: per audio minute, per role, per provider.
- Cost-reduction levers: secondary ASR only for flagged-heavy segments; batching translation; cheaper model for context flags if evaluation allows.

## 8. Explicit prohibitions

- No speech synthesis/voice cloning endpoints, ever.
- No fine-tuning or training jobs.
- No provider "memory", stored conversations, assistants/threads, vector stores, or file storage features for story content (OpenAI lists several such endpoints as not ZDR-eligible **[S4]**).
- No client-side (browser) calls to AI providers.
