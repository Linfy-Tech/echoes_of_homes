# packages/ai-providers

`AsrProvider` and `TextModelProvider` interfaces, adapters (`openai`, `nebius`, `self_hosted`, `google` — only those selected), and `fake` adapters with deterministic fixtures, failure injection, and adversarial content (ADR-005, `docs/AI_PROVIDER_STRATEGY.md`).

- The **only** place provider SDKs/HTTP clients for AI are imported.
- Adapters map provider errors to `RetryableError` / `PermanentError`, expose `capabilities()`, never log content.
- `pricing.ts`: unit prices with source URL and `verifiedAt`.
- No speech synthesis, fine-tuning, assistants/threads, file storage, or vector-store endpoints.
