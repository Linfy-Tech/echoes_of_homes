# Product Requirements Document — Echoes of Home

| Field | Value |
|---|---|
| Product | Echoes of Home |
| Owner | Linfy Tech Solutions (product owner: founder) |
| Status | Draft v1 — specification phase |
| Initial market | Cape Town / South Africa |
| Language pair | isiXhosa (source) → English (translation) |
| Related | `VISION.md`, `SPEC.md`, `USER_JOURNEYS.md`, `FEATURE_CATALOG.md`, `MILESTONES.md` |

---

## 1. Goals

| ID | Goal | Measure (pilot) |
|---|---|---|
| G1 | Preserve stories in the storyteller's own voice and language | 100% of completed stories retain verified original audio (hash match) |
| G2 | Produce trustworthy isiXhosa transcripts | Every approved transcript has 100% of segments human-reviewed; zero unresolved uncertainty flags except those explicitly accepted as uncertain |
| G3 | Make stories understandable across generations | Every approved story has an English translation reviewed by a fluent bilingual reviewer |
| G4 | Give storytellers real control | 100% of shared stories have an active consent record with a matching sharing scope; permission changes take effect on the next request |
| G5 | Be usable by elders and non-technical family members | ≥ 80% of pilot storytellers can explain, in their own words, what they agreed to (post-consent comprehension check); task completion without help measured in usability sessions |
| G6 | Operate reliably and affordably | Processing success ≥ 95% without manual intervention; cost per audio minute tracked and within budget set in `OPEN_QUESTIONS.md` OQ-020 |

## 2. Non-goals (all releases unless stated)

- Voice cloning, speech synthesis in a storyteller's voice, or conversational "avatar" features.
- Training or fine-tuning models on stories (a separate, explicit-consent programme may be designed later; not in Release 1).
- A public social feed, likes, comments from strangers, or algorithmic discovery.
- Automated cultural interpretation presented as fact.
- Real-time live transcription during recording (Release 1 processes after upload).
- Native mobile apps in Release 1 (PWA only).
- Storytellers under 18 and proxy consent for living adults lacking capacity (deferred pending legal review — see `CONSENT_AND_OWNERSHIP.md`).

## 3. Users and personas

| Persona | Description | Key needs | Constraints |
|---|---|---|---|
| **Gogo Nomvula** (storyteller, 78) | Lives in Gugulethu; first language isiXhosa; limited smartphone use | Understand what will happen to her story in isiXhosa; decide who hears it; hear it back | Low vision, low tech confidence, may not read long text; may tire quickly |
| **Sipho** (recorder, 34) | Grandson; works in town; bilingual; prepaid data | Record easily; not lose the recording on bad connection; know when processing is done | Data cost, interrupted connectivity, older Android phone |
| **Ayanda** (reviewer, 45) | Aunt; fluent isiXhosa reader; knows family names | Listen and correct quickly; know which parts the machine was unsure about | Time-poor; mobile or laptop |
| **Lerato** (family member, 22) | English-dominant; wants to understand Gogo's stories | Read in English while hearing isiXhosa; trust the translation | Not fluent in isiXhosa |
| **Family administrator** | Often the recorder | Invite family, manage circle membership | Must not be able to override the storyteller's choices |
| **Platform administrator** | Linfy Tech operator | Keep the system running; handle deletion and support | Must not access story content by default |

> **Evidence status:** Personas are illustrative composites (fictional names), not research findings. Replace with discovery findings in Phase 0.

## 4. Release 1 scope ("Trust Workflow Pilot")

Release 1 is a closed pilot with invited families. It must demonstrate the **entire trust workflow**, not just upload-and-transcribe:

1. Sign in; create a family circle; add a storyteller (who may not have their own account).
2. Explain recording and processing in isiXhosa and English (text + audio explanation); capture informed, granular consent — self or assisted (verbal consent recorded).
3. Record in the browser (with local buffering) or upload a file; resume interrupted uploads.
4. Preserve and verify the original audio (hash, probe).
5. Generate an isiXhosa transcript with timestamps and explicit uncertainty flags.
6. Flag possible names, clan names, praise names, places, kinship terms for human attention (never auto-resolved).
7. Human review: listen per segment, correct, confirm, mark inaudible, resolve or accept uncertainty.
8. Rights holder approves the transcript for translation.
9. Generate English translation (close and natural variants) from the approved transcript only.
10. Automated verification report (names, numbers, dates, relationships, omissions, additions).
11. Bilingual reviewer reviews and approves translation.
12. Rights holder gives final approval → immutable story version.
13. Bilingual reader with synchronised audio; private or family-circle sharing.
14. Change sharing, withdraw consent, request deletion, export the story.
15. Per-story activity log visible to the rights holder.

**Release 1 excludes:** public sharing (specified, feature-flagged off), proxy consent, minors, native apps, offline-first editing, multiple translation languages, speaker diarisation as a user-facing feature, model training.

## 5. Requirements summary

Detailed, testable requirements are in `SPEC.md` (functional `FR-*`, non-functional `NFR-*`). Feature-to-release mapping and acceptance criteria are in `FEATURE_CATALOG.md`.

## 6. Success metrics (pilot)

| Metric | Definition | Target | Status |
|---|---|---|---|
| End-to-end completion | Stories reaching `approved` / stories with verified recording | ≥ 60% within 30 days | Target is provisional |
| Consent comprehension | Storyteller correctly answers 3 plain-language questions after consent | ≥ 80% | Provisional |
| Review effort | Reviewer active minutes per audio minute | Baseline measured in pilot; no target yet | To be set from data |
| Uncertainty recall | Share of reviewer-corrected errors that had been flagged | Baseline from benchmark; target set in `AI_EVALUATION.md` | Not yet measured |
| Processing reliability | Jobs succeeding without manual intervention | ≥ 95% | Provisional |
| Privacy incidents | Unauthorised access events | 0 | Hard requirement |
| Cost | AI + media cost per audio minute | ≤ budget (OQ-020) | Budget undecided |

## 7. Constraints

- Hosting on Railway; PostgreSQL on Railway; media on Cloudinary; **no Supabase**.
- Railway has no Africa region **[VERIFIED S12]** → cross-border processing is unavoidable and must be disclosed and covered by consent and contracts (`SECURITY_AND_PRIVACY.md`).
- isiXhosa ASR quality is unproven for this domain → model selection follows the benchmark (`ASR_BENCHMARK.md`).
- Low-bandwidth, mobile-first, prepaid-data users.

## 8. Dependencies

- Fluent isiXhosa reviewers for consent scripts, UI copy, evaluation annotation, and pilot review.
- Qualified legal review of POPIA, cross-border transfers, consent wording, and indigenous-knowledge implications (`OPEN_QUESTIONS.md`).
- Provider accounts: Cloudinary (plan tier affects features — OQ-003), OpenAI (ZDR approval optional — OQ-006), Railway.

## 9. Risks (top 5 — full list in `RISK_REGISTER.md`)

1. isiXhosa ASR too inaccurate for review to be practical (R-01).
2. Consent model legally insufficient or culturally misaligned (R-03, R-04).
3. Private audio leakage via shareable media URLs (R-07).
4. Elders unable to use the interface even with assistance (R-10).
5. Deletion not fully propagating to provider copies and backups (R-08).

## 10. Release plan

See `ROADMAP.md` (phases) and `MILESTONES.md` (M0–M10, with acceptance criteria).
