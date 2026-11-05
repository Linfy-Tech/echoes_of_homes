# State Machines (canonical)

> **Interpretation note:** The requested repository structure listed `docs/MACHINE.md` without a description. We interpret it as the **canonical state-machine specification** — the single place where every lifecycle state, allowed transition, guard, actor, and side effect is defined. `DATA_MODEL.md` enums and `API_CONTRACTS.md` endpoints must match this file exactly. If that interpretation is wrong, see OQ-025.

## Rules for all machines

1. Transitions happen **only** through domain service functions (`transition<Entity>()`), inside a database transaction that also writes the audit event and enqueues any jobs.
2. Every transition checks: (a) current state allows it, (b) actor authorised via `packages/auth`, (c) guards (consent, data invariants).
3. Transitions use optimistic concurrency: `UPDATE … WHERE id = $1 AND status = $expected AND version = $v`. Zero rows updated → `409 conflict`.
4. Any transition not listed here is forbidden and must be rejected with `409 invalid_state_transition`.
5. Workers perform transitions as the `system` actor, which has only the transitions explicitly marked **system** below.

Notation: `from → to` · **actor** · *guard* · ⇒ side effects.

Actor names: "reviewer" = a User with story role `transcript_reviewer`; "translation reviewer" = story role `translation_reviewer`; "rights holder" = the User who is the story's current rights holder (storyteller with account, or active custodian) and who implicitly holds both reviewer capabilities; "storyteller" = the storyteller's own User account, or an assisted consent session (`CONSENT_AND_OWNERSHIP.md` §3). Role definitions: `CONSENT_AND_OWNERSHIP.md` §5.

---

## 1. Story (`stories.status`)

States: `draft`, `ready_to_record`, `uploading`, `processing`, `transcript_review`, `transcript_approved`, `translating`, `translation_review`, `final_review`, `approved`, `paused`, `deletion_pending`, `deleted`.

`stories.status` is a coarse, queryable summary. It is updated by the same domain functions that change the underlying aggregates (recording, transcript, translation, consent) — never set directly by an API request body.

| From → To | Actor | Guard | Side effects |
|---|---|---|---|
| `draft → ready_to_record` | system (on consent creation) | active consent includes `record_and_store` + `cross_border_processing` | — |
| `ready_to_record → uploading` | recorder | recording created | — |
| `uploading → processing` | system | recording `verified` | ⇒ enqueue `asr.transcribe` if `ai_transcription` granted, else story waits in `processing` with `attention_reason = transcription_not_consented` |
| `uploading → ready_to_record` | system | recording `failed` or `abandoned` | — |
| `processing → transcript_review` | system | transcript version reaches `in_review` | ⇒ notify rights holder + reviewers |
| `transcript_review → transcript_approved` | rights holder | transcript version `approved_for_translation` | ⇒ enqueue `translation.generate` if `translation` granted |
| `transcript_approved → translating` | system | translation version `generating` | — |
| `transcript_approved → final_review` | rights holder | `translation` **not** granted and rights holder chooses an isiXhosa-only story | — |
| `translating → translation_review` | system | translation version `in_review` | ⇒ notify translation reviewers |
| `translation_review → final_review` | system | translation version `approved` | ⇒ notify rights holder |
| `final_review → approved` | rights holder | story version created | ⇒ notify storyteller (if account) |
| `approved → transcript_review` | rights holder | rights holder reopens to correct; creates new transcript version | ⇒ current `story_version` stays readable until a new one is approved; downstream translation `superseded` |
| `{any active} → paused` | system | a scope required by the current or next step is withdrawn (not `record_and_store`) | ⇒ store `paused_from_status`; cancel affected jobs; audience → `private` if a sharing scope was withdrawn |
| `paused → {paused_from_status}` | system | required scope re-granted | ⇒ re-enqueue the step's job |
| `{any except deleted} → deletion_pending` | storyteller or rights holder | deletion request created | ⇒ audience → `private`; content inaccessible to all but requester's cancel view; cancel all non-deletion jobs |
| `deletion_pending → {previous}` | requester | deletion request `cancelled` within window | — |
| `deletion_pending → deleted` | system | deletion request `completed` or `completed_with_exceptions` | ⇒ tombstone row retained (IDs + timestamps only) |

"Active" states = all except `paused`, `deletion_pending`, `deleted`.

## 2. Recording (`recordings.status`)

States: `pending_upload`, `uploaded`, `verifying`, `verified`, `failed`, `abandoned`, `deleted`.

| From → To | Actor | Guard | Side effects |
|---|---|---|---|
| `∅ → pending_upload` | recorder | consent gate; no other non-failed recording on story (R1) | ⇒ create `media_assets` row (`role = original`, `status = pending`) |
| `pending_upload → uploaded` | system (signed provider webhook) or recorder (completion call) | provider confirms asset exists with matching `public_id` | ⇒ enqueue `media.verify` (job key = recording id) |
| `uploaded → verifying` | system | job started | — |
| `verifying → verified` | system | SHA-256 equals declared hash; probe: audio stream present, duration ≤ max | ⇒ store duration, codec; request playback + processing derivatives |
| `verifying → failed` | system | hash mismatch, no audio stream, or too long | ⇒ provider asset scheduled for deletion; user sees reason |
| `pending_upload → abandoned` | system (scheduled) | no upload completion after 7 days | ⇒ provider cleanup by `public_id` |
| `{verified, failed} → deleted` | system | deletion pipeline | — |

## 3. Transcript version (`transcripts.status`)

States: `generating`, `machine_draft`, `in_review`, `review_complete`, `approved_for_translation`, `superseded`, `failed`.

| From → To | Actor | Guard | Side effects |
|---|---|---|---|
| `∅ → generating` | system | `asr.transcribe` started, consent `ai_transcription` | — |
| `generating → machine_draft` | system | all chunks transcribed, segments persisted | ⇒ enqueue `transcript.context_flags` |
| `generating → failed` | system | permanent ASR failure | ⇒ story `attention_reason = transcription_failed` |
| `machine_draft → in_review` | system | context flagging finished (or failed non-fatally — flags are optional) | — |
| `in_review → review_complete` | reviewer or rights holder | all segments terminal; zero `open` flags | — |
| `review_complete → in_review` | reviewer or rights holder | reopen | — |
| `review_complete → approved_for_translation` | rights holder | — | ⇒ version locked (immutable rows enforced by trigger) |
| `approved_for_translation → superseded` | system | a new transcript version created from it | ⇒ translations of this version → `superseded` |
| `∅ → in_review` (new version from approved) | rights holder | reopen after approval | ⇒ copies segments (states preserved, flags copied) into new version |

Invariant: at most one transcript version per story in a non-terminal state (`generating`, `machine_draft`, `in_review`, `review_complete`). Enforced by partial unique index.

## 4. Transcript segment (`transcript_segments.review_state`)

States: `unreviewed`, `confirmed`, `corrected`, `inaudible`, `excluded`. Terminal-for-approval: `confirmed`, `corrected`, `inaudible`, `excluded`.

| From → To | Actor | Guard |
|---|---|---|
| `unreviewed → confirmed` | reviewer | text unchanged from current revision |
| `{unreviewed, confirmed} → corrected` | reviewer | text changed (new revision) |
| `{unreviewed, confirmed, corrected} → inaudible` | reviewer | text set to empty + `inaudible` marker; audio preserved |
| `{any} → excluded` | reviewer | reason required (`off_topic`, `not_storyteller`, `private_aside`, `other`); excluded segments are not translated and not shown to viewers, but remain in the transcript record |
| `{confirmed, corrected, inaudible, excluded} → unreviewed` | reviewer | reopen |

Segments are editable only while their transcript version is `in_review`.

## 5. Uncertainty flag (`uncertainty_flags.status`)

States: `open`, `resolved_confirmed`, `resolved_corrected`, `resolved_inaudible`, `accepted_as_uncertain`.

| From → To | Actor | Guard |
|---|---|---|
| `∅ → open` | system or reviewer | — |
| `open → resolved_confirmed` | reviewer | text left as-is deliberately |
| `open → resolved_corrected` | reviewer | segment text changed in same request |
| `open → resolved_inaudible` | reviewer | segment marked `inaudible` in same request |
| `open → accepted_as_uncertain` | **rights holder only** | note optional; flag remains visible in final story |
| `{resolved_*, accepted_as_uncertain} → open` | reviewer or rights holder | transcript version `in_review` |

## 6. Processing job (`processing_jobs.status`)

`processing_jobs` is the **domain record** of work (what users and admins see). Graphile Worker holds the execution queue. One `processing_jobs` row per logical job; retries update the same row.

States: `queued`, `waiting_budget`, `running`, `succeeded`, `failed_retryable`, `failed_permanent`, `cancelled`.

| From → To | Actor | Guard / rule |
|---|---|---|
| `∅ → queued` | api or system | **consent gate at enqueue**; budget check; Graphile job added in same tx with `job_key = processing_jobs.id` |
| `queued → waiting_budget` | system | budget exhausted at start; rescheduled with delay |
| `waiting_budget → queued` | system | budget available |
| `queued → running` | system | **consent gate at start** (re-read consent in tx); story not `paused`/`deletion_pending`/`deleted` |
| `queued → cancelled` | system | consent gate fails at start, or story paused/deleting |
| `running → succeeded` | system | outputs persisted in same tx as status change |
| `running → failed_retryable` | system | transient error (timeout, 429, 5xx, network); `attempts < max_attempts` |
| `failed_retryable → running` | system | Graphile retry with exponential backoff + jitter |
| `running → failed_permanent` | system | non-retryable error (validation, 4xx other than 429, unsupported audio) or attempts exhausted ⇒ admin alert |
| `running → cancelled` | system | cooperative cancellation check between chunks/steps detects withdrawal or deletion |
| `failed_permanent → queued` | platform admin | manual retry after fix (audited) |

Job types (R1): `media.verify`, `asr.transcribe`, `transcript.context_flags`, `translation.generate`, `translation.verify`, `consent.apply_withdrawal`, `deletion.execute`, `export.build`, `export.expire`, `deletion.scan_due`, `maintenance.abandon_uploads`, `maintenance.ledger_replicate`, `maintenance.purge_ephemeral`, `maintenance.audit_chain_verify`.

Required consent scope per job:

| Job | Required scopes |
|---|---|
| `media.verify` | `record_and_store`, `cross_border_processing` |
| `asr.transcribe` | + `ai_transcription` |
| `transcript.context_flags` | + `ai_transcription` |
| `translation.generate`, `translation.verify` | + `translation` |
| `deletion.*`, `export.*`, `consent.*`, `maintenance.*` | none (these must run even after withdrawal) |

## 7. Translation version (`translations.status`)

States: `generating`, `machine_draft`, `verifying`, `in_review`, `approved`, `superseded`, `rejected`, `failed`.

| From → To | Actor | Guard | Side effects |
|---|---|---|---|
| `∅ → generating` | system | source transcript `approved_for_translation` (DB-enforced), consent `translation` | — |
| `generating → machine_draft` | system | all segments translated & schema-valid | ⇒ enqueue `translation.verify` |
| `generating → failed` | system | permanent failure | — |
| `machine_draft → verifying` | system | verify job started | — |
| `verifying → in_review` | system | report persisted (even if verifier failed: report marked `incomplete`, which is itself a blocking issue) | — |
| `in_review → approved` | translation reviewer | zero `open` blocking issues; all segments reviewed | — |
| `in_review → rejected` | translation reviewer | reason required | ⇒ optional regenerate creates a new version |
| `{machine_draft, verifying, in_review, approved} → superseded` | system | source transcript superseded, or new translation version approved | — |

## 8. Verification issue (`verification_issues.status`)

`open → resolved` (reviewer edits translation) · `open → dismissed` (reviewer, reason ≥ 10 chars required) · `{resolved, dismissed} → open` (reviewer).

## 9. Story version (`story_versions.status`)

States: `approved`, `superseded`, `withdrawn`.

- `∅ → approved` · rights holder · story `final_review`; transcript version `approved_for_translation`; translation version `approved` **or** null (isiXhosa-only); ⇒ snapshot hashes stored.
- `approved → superseded` · system · a newer story version approved.
- `approved → withdrawn` · rights holder or system (deletion / withdrawal of `record_and_store`).

Readers always see the latest `approved` story version, subject to audience rules.

## 10. Consent record (`consent_records.status`)

States: `active`, `superseded`, `withdrawn`.

- `∅ → active` · storyteller (self or assisted) · previous active record for the story becomes `superseded` in the same tx.
- `active → superseded` · system · new consent record created.
- `active → withdrawn` · storyteller or rights holder · ⇒ enqueue `consent.apply_withdrawal`; if `record_and_store` withdrawn ⇒ create deletion request.

Invariant: exactly zero or one `active` consent record per story (partial unique index). Consent records are never updated except `status` and `superseded_at`/`withdrawn_at` (trigger-enforced).

## 11. Audience (`stories.audience`)

| From → To | Actor | Guard |
|---|---|---|
| `private → family` | rights holder | story has an `approved` story version; active consent includes `share_family`; if the rights holder is a custodian, an assisted confirmation within the last 24 h (`CONSENT_AND_OWNERSHIP.md` §4) |
| `family → private` | rights holder or system | — (always allowed; immediate) |
| `{private, family} → public` | rights holder | **R3 only**, `FEATURE_PUBLIC_SHARING=true`; `share_public` consent; re-confirmation within last 10 minutes |
| `public → {private, family}` | rights holder or system | — (always allowed; immediate) |

## 12. Deletion request (`deletion_requests.status`)

States: `requested`, `cancelled`, `executing`, `completed`, `completed_with_exceptions`.

| From → To | Actor | Guard | Side effects |
|---|---|---|---|
| `∅ → requested` | storyteller, rights holder, or system (withdrawal of `record_and_store`, account closure decision) | — | ⇒ story `deletion_pending`; `execute_after = now + 72h` unless `immediate = true` (requires re-confirmation) |
| `requested → cancelled` | requester | `now < execute_after` | ⇒ story restored to previous status (audience remains `private`) |
| `requested → executing` | system | `now ≥ execute_after` | ⇒ enqueue `deletion.execute`; deletion targets enumerated |
| `executing → completed` | system | all targets `done` | ⇒ ledger entry replicated offsite; certificate generated |
| `executing → completed_with_exceptions` | system | some targets `failed_permanent` after retries | ⇒ admin alert; targets retried daily for 30 days, then escalated |
| `completed_with_exceptions → completed` | system | remaining targets done | — |

## 13. Export request (`export_requests.status`)

`requested → building → ready → expired`; `building → failed`. `ready → expired` at `expires_at` (24 h) with file deletion at 7 days at the latest.

## 14. Invitation (`invitations.status`)

`pending → accepted | expired | revoked`. Types: `family_member`, `story_reviewer`, `custodian`, `storyteller_account_link`.

## 15. Custodian designation

`∅ → pending_acceptance` (storyteller designates during consent) → `active` (custodian accepts invitation; story `rights_holder_person_id` switches in same tx) → `revoked` (storyteller revokes; rights holder reverts to storyteller). Release 1: only the storyteller can designate or revoke a custodian.
