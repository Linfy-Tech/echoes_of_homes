# ADR-004: isiXhosa → English as the first language pair; evaluation before model selection

- **Status:** Accepted
- **Date:** 2026-11-04

## Context
The founding use case is isiXhosa oral history in Cape Town/Eastern Cape families. isiXhosa ASR/translation quality on oral storytelling is unproven: OpenAI's recommended transcription model page does not list supported languages **[S3]**; an open checkpoint covering Xhosa reports vendor figures on short benchmark clips only, as a preview release **[S19]**; another open model family's isiXhosa coverage is unconfirmed **[S20]**; a South African vendor did not list isiXhosa for transcription **[S22]**.

## Decision
- R1 supports exactly one source language (`xh`) and one target (`en`), with code-switching tolerated.
- UI and consent are fully bilingual, authored/reviewed by fluent humans.
- No ASR or translation provider is committed until the M0 benchmark (`ASR_BENCHMARK.md`, `TRANSLATION_EVALUATION.md`) passes its gates; the data model is language-parameterised for later expansion.

## Consequences
- M0 is on the critical path and requires paid, consented participants and fluent annotators.
- If no candidate passes, R1 scope adapts (manual transcription assistance) rather than shipping silent low quality.

## Revisit when
Benchmark results are in; users request other languages.
