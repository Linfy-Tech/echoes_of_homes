# Functional and Non-Functional Specification

**Status:** Draft v1. Requirement IDs are stable; reference them in code comments, tests, and PRs (e.g. `// FR-CON-04`).
**Release tags:** `R1` = Release 1 pilot, `R2`+ = later (see `ROADMAP.md`). Anything not tagged `R1` must not be built in Release 1 milestones.

Authoritative companions: state machines in `MACHINE.md`, entities in `DATA_MODEL.md`, endpoints in `API_CONTRACTS.md`, role/consent rules in `CONSENT_AND_OWNERSHIP.md`.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Person** | A real human the system holds information about (storyteller or not). May or may not have a `User` account. |
| **User** | An authenticated account holder. |
| **Storyteller** | The Person whose voice and story is recorded. The data subject of the recording. |
| **Rights holder** | The Person who decides how a story is used and shared. Defaults to the storyteller. Release 1 allows only the storyteller as rights holder, or a **designated custodian** the storyteller names during consent (see `CONSENT_AND_OWNERSHIP.md` §4). |
| **Recorder** | A User who creates the story and captures/uploads the audio. |
| **Reviewer** | A User granted permission on a specific story to correct the transcript and/or translation. |
| **Family circle** | A named group of Users who can be granted family-level access. Membership alone grants nothing on a story until the story's audience is `family` for that circle. |
| **Consent record** | An immutable record of what was explained, what was agreed (scopes), how, by whom, and when. |
| **Consent scope** | A specific permitted use: `record_and_store`, `cross_border_processing`, `ai_transcription`, `human_review`, `translation`, `share_family`, `share_public`, `model_training`. |
| **Segment** | A time-bounded part of a transcript (start/end ms) with text and review state. |
| **Uncertainty flag** | A marked span or segment that the system or a reviewer considers uncertain, with a reason code. |
| **Story version** | An immutable snapshot of an approved transcript + approved translation + metadata, created at final approval. |

## 2. Functional requirements

### 2.1 Accounts and sessions (FR-AUTH)

| ID | Requirement | Rel |
|---|---|---|
| FR-AUTH-01 | Users sign in with email using a one-time link **or** a 6-digit one-time code (for users who read the email on a different device). Codes expire after 10 minutes and are single-use. | R1 |
| FR-AUTH-02 | Sessions are server-side, referenced by an opaque random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only the token hash is stored. | R1 |
| FR-AUTH-03 | Users can view active sessions and sign out of all sessions. | R1 |
| FR-AUTH-04 | Sign-in attempts are rate-limited per email and per IP; responses do not reveal whether an email has an account. | R1 |
| FR-AUTH-05 | Passkeys (WebAuthn) as an optional second method. | R2 |
| FR-AUTH-06 | Phone-number sign-in (SMS/WhatsApp OTP) — evaluate cost and SIM-swap risk first (OQ-011). | R3 |

### 2.2 Family circles (FR-FAM)

| ID | Requirement | Rel |
|---|---|---|
| FR-FAM-01 | A User can create a family circle and becomes its `family_admin`. | R1 |
| FR-FAM-02 | A `family_admin` can invite Users by email; invitations expire after 7 days and are single-use. | R1 |
| FR-FAM-03 | Circle roles are `family_admin` and `family_member`. Circle roles grant **no** rights over consent or sharing decisions on any story. | R1 |
| FR-FAM-04 | Removing a member immediately removes their family-level access to all stories shared with that circle. | R1 |
| FR-FAM-05 | A circle must always have at least one `family_admin`. | R1 |

### 2.3 People and storytellers (FR-PER)

| ID | Requirement | Rel |
|---|---|---|
| FR-PER-01 | A User can create a Person profile for a storyteller with: display name, preferred language (`xh` or `en`), optional contact email, and whether the storyteller will use the app themselves. Minimal data only. | R1 |
| FR-PER-02 | A Person may later be linked to their own User account via an invitation the storyteller (or assisting family member) accepts. After linking, the storyteller can see and manage all their stories directly. | R1 |
| FR-PER-03 | The system records whether a Person was confirmed to be 18 or older at consent time (yes/no attestation only; no date of birth stored). Storytellers under 18 are not supported in R1. | R1 |

### 2.4 Stories (FR-STY)

| ID | Requirement | Rel |
|---|---|---|
| FR-STY-01 | A User creates a story by selecting a storyteller Person and a family circle. Title is optional and may be added later. | R1 |
| FR-STY-02 | New stories have `status = draft` and `audience = private`. | R1 |
| FR-STY-03 | Source language is `xh` in R1. Code-switching with English is expected and supported in transcripts. | R1 |
| FR-STY-04 | A story has exactly one storyteller and exactly one rights holder at any time. | R1 |
| FR-STY-05 | Story metadata (title, short description, optional place/year text) is free text entered by humans; the system never auto-generates historical metadata. | R1 |

### 2.5 Consent (FR-CON) — authoritative detail in `CONSENT_AND_OWNERSHIP.md`

| ID | Requirement | Rel |
|---|---|---|
| FR-CON-01 | Before recording, the storyteller is shown (and can listen to) an explanation in their preferred language covering: what is recorded, where it is stored (including outside South Africa), which processors (by name) perform AI transcription/translation, who can access it, that it is private by default, that they can change their mind, and the limits of deletion from backups. | R1 |
| FR-CON-02 | Consent is captured per scope. `record_and_store` and `cross_border_processing` are required to proceed; all other scopes are optional and default to **not granted**. `share_public` and `model_training` are not offered in R1. | R1 |
| FR-CON-03 | Consent methods: `self_digital` (storyteller taps through themselves) and `assisted_verbal` (a family member operates the device; the storyteller's spoken consent to a scripted summary is recorded as a separate consent-evidence audio asset). | R1 |
| FR-CON-04 | A short comprehension check (3 plain-language questions, audio-supported) follows consent. A failed check does not block, but prompts re-explanation and is recorded. | R1 |
| FR-CON-05 | During consent, the storyteller chooses the rights holder: themselves (default, only if they have their own User account) or a named designated custodian who must be a User. A storyteller without an account **must** designate a custodian before any rights-holder action can occur. A custodian acts only within the scopes the storyteller granted; only the storyteller (self or assisted) can grant new scopes. Narrowing (revoking a scope, making a story private, requesting deletion) is always available to both. | R1 |
| FR-CON-06 | Consent records are immutable. Any change (grant, revoke, withdraw) creates a new consent record that supersedes the previous one. | R1 |
| FR-CON-07 | The consent script version (content hash, language) is stored with each record. A new script version does not invalidate existing consent but is presented on the next consent change. | R1 |
| FR-CON-08 | Each processing step checks the required scope at enqueue time and at job start; a missing or withdrawn scope cancels the job (`MACHINE.md` §6). | R1 |

### 2.6 Recording and upload (FR-REC, FR-UPL)

| ID | Requirement | Rel |
|---|---|---|
| FR-REC-01 | Recording is available only when the story has active `record_and_store` + `cross_border_processing` consent. | R1 |
| FR-REC-02 | In-browser recording uses `MediaRecorder` with the best supported Opus/AAC container; audio chunks are persisted locally (IndexedDB) at least every 10 seconds so that a crash, tab close, or call interruption loses at most ~10 s. | R1 |
| FR-REC-03 | Recording supports pause/resume, a visible elapsed timer, a level meter, and a large stop button. Maximum length is configurable (default 90 minutes). | R1 |
| FR-REC-04 | After stopping, the user can listen back before upload, and can discard (which deletes local data). | R1 |
| FR-UPL-01 | Users can alternatively upload an existing audio file (accepted: m4a, mp3, wav, ogg/opus, webm, flac, aac). Max size configurable (default 500 MB). | R1 |
| FR-UPL-02 | The client computes a SHA-256 of the complete file before upload and declares it when requesting an upload session. | R1 |
| FR-UPL-03 | Uploads go directly from the browser to the media provider using a short-lived server-generated signature and chunked transfer; the API never exposes the media provider's secret. | R1 |
| FR-UPL-04 | Interrupted uploads resume from the last confirmed chunk without re-sending completed chunks where the provider supports it; otherwise restart transparently from locally stored data. Local data is retained until the server confirms verification. | R1 |
| FR-UPL-05 | After upload completes, the worker verifies the asset: downloads it, recomputes SHA-256, probes duration/codec, and marks the recording `verified` or `failed`. | R1 |
| FR-UPL-06 | One original recording per story in R1. (Multiple recordings / sessions per story: R2.) | R1 |

### 2.7 Media playback (FR-MED)

| ID | Requirement | Rel |
|---|---|---|
| FR-MED-01 | Audio is played only through an authenticated API stream endpoint that checks authorisation on every request and supports HTTP Range requests. | R1 |
| FR-MED-02 | A low-bitrate playback rendition is generated as an eager derivative at upload; the original is never modified. | R1 |
| FR-MED-03 | Original-quality download is available only to the rights holder (and storyteller) via export. | R1 |

### 2.8 Processing (FR-PRC)

| ID | Requirement | Rel |
|---|---|---|
| FR-PRC-01 | All processing runs as durable background jobs (`MACHINE.md` §6) — never in-request or in-memory. | R1 |
| FR-PRC-02 | Users see a plain-language status per step: waiting, working, done, needs attention, failed (with retry where meaningful). | R1 |
| FR-PRC-03 | Every model call is recorded as a `model_run` with provider, model ID, prompt version, parameters, input/output hashes, cost, latency, and outcome. | R1 |
| FR-PRC-04 | Jobs are idempotent: retrying a job never duplicates transcripts, translations, or charges beyond the retried call. | R1 |

### 2.9 Transcription and uncertainty (FR-ASR, FR-UNC, FR-CTX)

| ID | Requirement | Rel |
|---|---|---|
| FR-ASR-01 | Audio is normalised (mono, provider-appropriate sample rate) into a **processing derivative**, split at silence into chunks within provider limits, with overlap handling. | R1 |
| FR-ASR-02 | The transcript is a list of segments with `start_ms`, `end_ms`, text, detected language(s), and provider confidence data where available. | R1 |
| FR-ASR-03 | The system does not insert words that the ASR did not produce. Normalisation is limited to whitespace and documented punctuation rules. | R1 |
| FR-UNC-01 | Uncertainty flags have reason codes: `low_confidence`, `inaudible`, `overlap`, `code_switch`, `possible_name`, `possible_clan_name`, `possible_praise_name`, `possible_place`, `kinship_term`, `number_or_date`, `asr_disagreement`, `suspected_hallucination`, `reviewer_unsure`. | R1 |
| FR-UNC-02 | Flags are shown visually (not by colour alone) and are navigable ("next unclear part"). | R1 |
| FR-UNC-03 | An open flag blocks transcript approval. A reviewer may resolve it (`resolved_confirmed`, `resolved_corrected`, `resolved_inaudible`) or the rights holder may mark it `accepted_as_uncertain`, which keeps it visible in the final story. | R1 |
| FR-UNC-04 | Any alternative text suggested by a model is stored as a suggestion, never merged into the segment text without a human action. | R1 |
| FR-CTX-01 | A cultural-context step flags possible names, clan names, praise names, places, kinship terms, and idioms, each with a short question for the reviewer. It never changes text and never asserts meaning. | R1 |
| FR-CTX-02 | Families can maintain a **family glossary** (term, category, optional human-written explanation, who added it). Glossary entries are used as recognition hints and translation constraints only after the rights holder approves them. | R1 |

### 2.10 Transcript review and approval (FR-REV, FR-APR)

| ID | Requirement | Rel |
|---|---|---|
| FR-REV-01 | The rights holder grants `transcript_reviewer` and/or `translation_reviewer` story roles to specific Users (requires `human_review` consent). The rights holder implicitly holds both capabilities. | R1 |
| FR-REV-02 | Reviewers can play each segment (with replay, slow playback 0.75×), edit text, confirm, mark inaudible, exclude (e.g. off-topic chatter, with reason), split/merge adjacent segments, and add a reviewer flag. | R1 |
| FR-REV-03 | Every edit is stored as a revision with author and timestamp; earlier text is retrievable. | R1 |
| FR-REV-04 | Concurrent edits are detected with optimistic concurrency (`If-Match` version); conflicting saves are rejected with a clear message, never silently overwritten. | R1 |
| FR-REV-05 | Review progress shows segments reviewed / total and open flags. | R1 |
| FR-APR-01 | When all segments are in a terminal review state and no flags are open, a reviewer can mark the transcript `review_complete`. | R1 |
| FR-APR-02 | The rights holder approves the transcript for translation, producing a locked transcript version (`approved_for_translation`). Any later edit creates a new transcript version and supersedes downstream translations. | R1 |

### 2.11 Translation, verification and review (FR-TRN, FR-VER, FR-TRV)

| ID | Requirement | Rel |
|---|---|---|
| FR-TRN-01 | Translation requires `translation` consent and a transcript version in `approved_for_translation`. Enforced in DB and service layer. | R1 |
| FR-TRN-02 | Translation is segment-aligned: each source segment maps to exactly one translation segment. | R1 |
| FR-TRN-03 | Two variants per segment: **close** (faithful, near-literal, may keep isiXhosa terms) and **natural** (readable English). The natural variant is shown by default; the close variant is one tap away. | R1 |
| FR-TRN-04 | Names, clan names, praise names, and approved glossary terms are preserved in isiXhosa form; explanations come only from human-written glossary entries. | R1 |
| FR-TRN-05 | Segments marked `accepted_as_uncertain` or `inaudible` are rendered as such in translation (e.g. "[unclear in the original]"), never guessed. | R1 |
| FR-VER-01 | Each translation version gets a verification report with deterministic checks (numbers, dates, glossary/name preservation, segment alignment, length-ratio anomalies) and model-assisted checks (omissions, additions, changed relationships, unsupported claims). | R1 |
| FR-VER-02 | Issues have severity `blocking` / `warning`. Blocking issues must be resolved or explicitly dismissed with a reason by the translation reviewer before approval. | R1 |
| FR-VER-03 | Back-translation, when used, is labelled as a diagnostic aid, not proof of correctness. | R2 |
| FR-TRV-01 | A bilingual reviewer reviews translation segments side by side with the source and audio; can edit either variant; approves the translation version. | R1 |

### 2.12 Final approval, reading, sharing (FR-FIN, FR-READ, FR-SHR)

| ID | Requirement | Rel |
|---|---|---|
| FR-FIN-01 | The rights holder reviews the bilingual story and approves it, creating an immutable `story_version`. The storyteller (if different and has an account) is notified. | R1 |
| FR-FIN-02 | Final approval does not change the audience; sharing is a separate, explicit decision. | R1 |
| FR-FIN-03 | If `translation` consent is not granted, the rights holder may approve an **isiXhosa-only** story version (no translation). The reader then shows isiXhosa text with audio only. | R1 |
| FR-READ-01 | The reader shows isiXhosa and English side by side (stacked on mobile), synchronised with audio; tapping a segment plays from its start. | R1 |
| FR-READ-02 | Uncertain/inaudible parts are visibly marked; a provenance panel shows who reviewed and approved, and which AI systems produced drafts. | R1 |
| FR-SHR-01 | Audiences: `private` (storyteller, rights holder, explicitly granted collaborators), `family` (members of the story's family circle), `public` (anyone with the link or listing — R3, behind `FEATURE_PUBLIC_SHARING`). | R1 (private, family); R3 (public) |
| FR-SHR-02 | Only the rights holder can change audience; `family` requires active `share_family` consent; `public` requires `share_public` consent and a re-confirmation step. | R1 |
| FR-SHR-03 | Audience changes take effect on the next request (no caches of authorisation decisions beyond the request). | R1 |
| FR-SHR-04 | Only approved story versions can be shared beyond private. | R1 |

### 2.13 Withdrawal, deletion, export, closure (FR-WDR, FR-DEL, FR-EXP, FR-ACC)

| ID | Requirement | Rel |
|---|---|---|
| FR-WDR-01 | The storyteller or rights holder can withdraw consent for any scope at any time. Withdrawal immediately: sets audience to `private` if a sharing scope is withdrawn, cancels queued/running jobs that need the scope, and is audited. | R1 |
| FR-WDR-02 | Withdrawing `record_and_store` triggers a deletion request for the story. | R1 |
| FR-DEL-01 | The storyteller or rights holder can request deletion of a story. Content becomes inaccessible immediately; irreversible deletion executes after a 72-hour cancellation window (OQ-015a) unless the requester confirms immediate deletion. | R1 |
| FR-DEL-02 | Deletion covers all copies listed in `RETENTION_AND_DELETION.md` §3, records per-target outcomes, and produces a deletion certificate (IDs and outcomes only, no content). | R1 |
| FR-EXP-01 | The rights holder and storyteller can export a story: original audio, playback audio, approved transcript and translation (JSON + printable HTML), consent records, and an activity summary. Export links are single-user, expire after 24 h, and the export file is deleted after 7 days. | R1 |
| FR-ACC-01 | A User can close their account. Stories where they are storyteller or rights holder require a decision first (delete, or transfer rights holder role to another User the storyteller approves). | R1 |

### 2.14 Audit, administration, notifications, language (FR-AUD, FR-ADM, FR-NOT, FR-I18N, FR-COST)

| ID | Requirement | Rel |
|---|---|---|
| FR-AUD-01 | Security- and consent-relevant actions write an append-only, hash-chained audit event in the same transaction. | R1 |
| FR-AUD-02 | The rights holder and storyteller can view a story's activity log (who did what, when; no content diffs). | R1 |
| FR-ADM-01 | Platform admins have no default access to story content. Operational views show IDs, states, sizes, and errors only. | R1 |
| FR-ADM-02 | Break-glass content access requires a written reason, is time-limited (≤ 60 min), is audited, and notifies the rights holder. | R1 |
| FR-NOT-01 | Email notifications (review requested, ready for approval, processing failed, deletion completed) contain no story content — only a generic message and a link. | R1 |
| FR-I18N-01 | The full UI is available in isiXhosa and English. isiXhosa copy is written or reviewed by fluent human translators, never shipped as raw machine translation. | R1 |
| FR-COST-01 | Per-day and per-story AI budgets are enforced before enqueuing model jobs; exceeding a budget pauses processing with an admin alert rather than failing silently. | R1 |

## 3. Non-functional requirements

| ID | Category | Requirement | Rel |
|---|---|---|---|
| NFR-PERF-01 | Performance | API p95 < 400 ms for non-media reads at pilot load; stream endpoint time-to-first-byte p95 < 1.5 s. | R1 |
| NFR-PERF-02 | Processing | A 30-minute recording reaches `transcript_review` within 30 minutes p90 under normal provider conditions (provisional; revisit after benchmark). | R1 |
| NFR-NET-01 | Low bandwidth | Initial page load (critical route) ≤ 200 KB compressed JS; app usable on a 3G-class connection (≈ 400 kbps) and on Android devices from ~2019 onward. | R1 |
| NFR-NET-02 | Data cost | Playback uses the low-bitrate rendition by default (target ≤ 32 kbps Opus/AAC — verify perceptual quality with users). | R1 |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA for all screens; minimum touch target 44×44 CSS px (larger for primary actions: 56 px); text scalable to 200% without loss; audio alternatives for key consent text. | R1 |
| NFR-REL-01 | Reliability | No data loss of verified originals; at-least-once job execution with idempotent handlers. | R1 |
| NFR-REL-02 | Availability | Pilot target 99.5% monthly for API (no formal SLA). | R1 |
| NFR-SEC-01 | Security | OWASP ASVS Level 2 as the verification baseline for the API and web app (`SECURITY_AND_PRIVACY.md`). | R1 |
| NFR-PRIV-01 | Privacy | Data minimisation: no DOB, ID numbers, precise location, or device fingerprints collected. | R1 |
| NFR-PRIV-02 | Privacy | Logs, traces, metrics, and error reports contain no audio, transcript/translation text, names, emails, or consent evidence. | R1 |
| NFR-OBS-01 | Observability | Every request and job has a correlation ID propagated across API → queue → worker → provider call records. | R1 |
| NFR-MNT-01 | Maintainability | Strict TypeScript; shared schemas; providers behind interfaces; no provider SDK imported outside its adapter package. | R1 |
| NFR-COST-01 | Cost | Cost per audio minute is measured per story and reported weekly. | R1 |
| NFR-BRW-01 | Browser support | Latest two versions of Chrome for Android, Samsung Internet, Safari iOS, Chrome/Edge/Firefox desktop. `MediaRecorder` fallbacks documented. | R1 |
| NFR-PORT-01 | Portability | Media provider and AI providers replaceable through interfaces without schema changes. | R1 |

## 4. Out of scope for this specification

UI visual design (colour, typography) beyond accessibility rules; marketing site; billing/payments (pilot is free — OQ-021).
