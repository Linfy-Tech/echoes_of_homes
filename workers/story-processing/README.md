# workers/story-processing — Background jobs

Graphile Worker process (ADR-009). **Milestone:** M3 (`media.verify`) onward.

**Job types:** `media.verify`, `asr.transcribe`, `transcript.context_flags`, `translation.generate`, `translation.verify`, `consent.apply_withdrawal`, `deletion.execute`, `export.build`, `export.expire`, `maintenance.*` (`docs/MACHINE.md` §6).

**Every task** runs through the `runJob` wrapper (`docs/SYSTEM_DESIGN.md` §4.2): terminal-state no-op, consent gate at start and at checkpoints, budget check, typed error classification, outputs persisted with the state transition in one transaction, `model_runs` for every provider call, temp files cleaned in `finally`.

**Must not:** make authorisation or consent decisions with AI; log content or prompts; persist processing derivatives of audio (R1); call providers outside `packages/ai-providers` / `packages/media-storage`; run ffmpeg as root or without time/memory limits.

**Key specs:** `docs/AGENT_DESIGN.md`, `docs/SYSTEM_DESIGN.md` §4–5, `docs/RETENTION_AND_DELETION.md` §4.
