# ASR Benchmark Plan (isiXhosa oral storytelling)

**Status: NOT YET RUN. No results exist.** All numbers in this document are either vendor-reported figures (labelled as such) or provisional thresholds. Do not quote vendor figures as our results.

## 1. Purpose

Select the primary (and optional secondary) ASR system for Release 1 based on evidence from **representative, consented** isiXhosa oral-history audio, and calibrate uncertainty thresholds.

## 2. Candidates (as of 2026-11-04)

| ID | Candidate | Access | Licence / terms | Verified facts | Open questions |
|---|---|---|---|---|---|
| C1 | OpenAI `gpt-transcribe` | Hosted API | OpenAI API terms; no training on API data by default **[S4]** | Recommended current transcription model; `languages` + `keywords` hints; 25 MB file limit **[S1][S2]**; transcription endpoint ZDR-eligible **[S4]** | isiXhosa listed as supported? Not on model page **[S3]** → test empirically (OQ-001); confidence/logprobs not documented for this model **[S2]** |
| C2 | OpenAI `gpt-4o-transcribe` | Hosted API | Same | Supports `include: ["logprobs"]` **[S2]**; **deprecated, shutdown 2027-02-26** **[S1]** | Use **only as a baseline/calibration reference**, never as R1 production dependency |
| C3 | `Sunbird/asr-whisper-51-african-languages` | Self-host (GPU) | Apache-2.0 model licence; gated access **[S19]** | Includes Xhosa (`xho`); preview release, weights may change; vendor-reported Xhosa WER 0.262 / CER 0.054 on 126 dev clips ≤ 30 s (read/benchmark data, not oral storytelling) **[S19]** | Licences of training datasets (FLEURS, ASR Africa Data Efficiency Benchmark, African Next Voices) not stated on page → commercial-use check (OQ-028); hosting cost; long-form behaviour |
| C4 | Meta Omnilingual ASR (`omniASR-CTC-*`, `omniASR-LLM-*`) | Self-host (GPU) | Apache-2.0 model/code; corpus CC-BY-4.0 **[S20]** | Variants 300M–7B; LLM-7B ≈ 17 GiB VRAM; language-code conditioning (e.g. `eng_Latn`) **[S20]** | Is `xho_Latn` in `supported_langs`? (OQ-029); long-form handling; confidence outputs |
| C5 | Google Cloud Speech-to-Text `chirp_2` / `chirp_3` (`xh-ZA`) | Hosted API | Google Cloud terms | `xh-ZA` listed for `chirp_2` (word-level confidence) and `chirp_3` (no word-level confidence) in the `asia-northeast1` table **[S21]** | Availability in EU regions; data terms; cost. Added as a credible hosted alternative (not in the original brief) |
| C6 | Sunbird "Sunflower" family | — | — | Sunflower models on Hugging Face are LLM/translation/speech-LLM work focused on Ugandan languages **[S18]** | Not an isiXhosa ASR candidate unless coverage is confirmed; C3 is Sunbird's relevant ASR checkpoint |
| C7 | Lelapa AI Vulavula | Hosted API | Vendor terms | isiXhosa **not** listed among transcription languages on docs page **[S22]** | Re-check periodically; excluded for now |
| C8 | Meta MMS / other NC-licensed models | Self-host | Believed non-commercial (e.g. CC-BY-NC) — **UNVERIFIED** | — | Excluded unless a commercial-permissive licence is verified |
| C9 | Nebius Token Factory | Hosted | — | Token Factory serves open models via API with ZDR option **[S16]** | Whether it hosts any ASR model suitable for isiXhosa — **UNVERIFIED**; if not, Nebius is a candidate only for text roles |

Self-hosted candidates need a GPU host; Railway GPU availability is **UNVERIFIED** — candidate hosts evaluated in M0 (OQ-030).

## 3. Evaluation dataset ("Echoes Eval Set v1")

**Consent:** separate research/evaluation consent (not the product consent), explaining that recordings are used to test computer programs, who listens, retention, and withdrawal. Participants are paid fairly. Evaluation recordings are stored in a separate, access-controlled evaluation project, never mixed with product data.

| Dimension | Target (provisional) |
|---|---|
| Total audio | 6–10 hours |
| Recordings | 30–50 sessions, 5–30 min each |
| Speakers | ≥ 20, ≥ 50% aged 60+, balanced gender |
| Regional varieties | ≥ 3 varieties + Cape Town urban speech (stratification labels) |
| Conditions | quiet indoor, background TV/radio, multiple people present, outdoor; phone mic and app recording (MediaRecorder output) |
| Content | family history narrative, everyday memories, at least some praise poetry/recitation (with explicit permission), code-switched speech |
| Splits | **dev** (40%, threshold tuning) / **test** (60%, held out, used for selection only once per candidate version) |
| Non-speech fixtures | 30 min of silence/room noise/music for hallucination tests |

**Public sanity sets (not representative):** NCHLT isiXhosa (CC BY 3.0, orthographically transcribed broadband speech) **[S23]**; FLEURS xh (licence to verify). Used only to detect pipeline bugs and gross failures.

## 4. Annotation protocol

1. Annotation guidelines (orthography, dialect preservation, code-switch tagging, `[inaudible]`, `[overlap]`, non-speech tags, entity tagging for person/clan/praise/place names and kinship terms, numbers/dates).
2. Two independent annotators per recording; an adjudicator resolves differences.
3. Inter-annotator agreement measured (CER between annotators) and reported; recordings with very low agreement are reviewed rather than discarded.
4. Segment-level timestamps aligned for per-segment analysis.
5. Annotators are fluent isiXhosa speakers; at least one per recording familiar with the regional variety.

## 5. Metrics

| Metric | Definition | Notes / limitations |
|---|---|---|
| **CER** (primary) | Character edit distance / reference characters, after normalisation | Less inflated by conjunctive orthography than WER |
| **WER** | Word edit distance / reference words | Reported for comparability; over-penalises agglutinative errors |
| **Entity error rate (EER)** | Share of annotated entities (names, clan/praise names, places) not exactly correct | Errors here matter most to families |
| **Number/date accuracy** | Exact-match rate of annotated numbers/dates | |
| **Hallucination rate** | Inserted words per minute on non-speech fixtures; insertion rate in speech | |
| **Omission rate** | Deletions as share of reference words; long-deletion events (≥ 5 consecutive words) | |
| **Uncertainty recall** | Share of erroneous reference spans covered by a flag | Key for "never silently guess" |
| **Uncertainty precision** | Share of flagged spans that contain an error | Too many flags → reviewer fatigue |
| **Calibration** | Expected calibration error of confidence (where available) | Provider-specific |
| **Review-effort proxy** | Estimated edits per audio minute; validated against timed review sessions | |
| **Latency** | Wall-clock processing time per audio minute | |
| **Cost** | USD per audio minute at listed prices (with source/date) | |
| **Robustness** | All metrics stratified by variety, age band, condition, code-switch density | |

Normalisation for scoring: Unicode NFC, lowercase, strip punctuation, collapse whitespace, map annotation tags out; identical for all candidates; normalisation script versioned in `tests/evaluation/`.

## 6. Protocol

1. Freeze dataset version and normalisation script (hashes recorded).
2. Run each candidate with documented settings (language hints, keyword hints off and on — glossary from annotation for "on"), temperature 0.
3. Same chunking pipeline for all hosted candidates; self-hosted candidates also tested with their native long-form mode.
4. Compute metrics with bootstrap 95% confidence intervals (resampling recordings, not segments).
5. Optional: dual-ASR disagreement as an uncertainty signal (pairs of top candidates).
6. Calibrate flag thresholds on **dev**, report final metrics on **test**.
7. Timed review study: 3 reviewers × 3 recordings per top-2 candidate (blind to candidate) → minutes of review per audio minute.
8. Report in `tests/evaluation/reports/asr-<date>.md` with all settings, versions, costs, and limitations.

## 7. Selection gates (provisional — revise after first baseline)

A candidate is eligible for R1 only if **all** gates pass:

| Gate | Threshold (provisional) |
|---|---|
| G-LIC | Licence and data terms permit our commercial use; data controls acceptable (no training; retention acceptable or ZDR) |
| G-HAL | Non-speech hallucination ≤ 1 inserted word per minute |
| G-UNC | Uncertainty recall ≥ 0.80 on entity and number errors (with our flagging pipeline) |
| G-REV | Timed review ≤ 6 minutes per audio minute for median recording (reviewers judge it "worth correcting rather than retyping") |
| G-OPS | Supports our longest recordings via chunking; stable API/model availability through at least R1 + 6 months (no announced shutdown in window) |

Ranking among eligible candidates: review effort, then CER, then EER, then cost. **No absolute CER/WER target is set before a baseline exists**; after the first run, set and record targets in this file with rationale.

If **no candidate passes**, R1 continues with manual transcription assistance only (R2 feature pulled forward) or narrows the pilot (e.g. clearer recording conditions) — decision recorded as an ADR.

## 8. Re-benchmarking

Trigger re-runs when: a provider releases/deprecates a model (e.g. the announced 2027-02-26 shutdown of `gpt-4o-transcribe` family **[S1]**), a prompt/hint strategy changes, production edit rates drift > 20% from baseline, or a new variety/condition becomes common in production.

## 9. Results

| Date | Dataset version | Candidate | CER | WER | EER | Halluc./min | Unc. recall | Review min/min | Cost/min | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | **not run** | | | | | | | |
