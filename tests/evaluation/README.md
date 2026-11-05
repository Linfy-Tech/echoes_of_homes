# tests/evaluation

AI evaluation harness (`docs/AI_EVALUATION.md`).

- `fixtures/` — recorded provider responses and synthetic inputs for CI (L1/L2); no live calls in CI.
- `normalise/` — versioned text normalisation used for CER/WER (`docs/ASR_BENCHMARK.md` §5).
- `reports/` — benchmark and human-evaluation reports (`<kind>-<YYYY-MM-DD>.md`).
- **Access rule:** consented evaluation audio and gold transcripts are stored in a separate access-controlled evaluation store, never committed to this repository. Only synthetic data or snippets explicitly covered by research consent may appear in `fixtures/`.

No results exist yet.
