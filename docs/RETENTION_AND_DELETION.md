# Retention and Deletion

**Authority:** Rank 1. Deletion is deterministic code with per-target outcomes; it is never delegated to AI.

## 1. Principles

1. The storyteller decides how long a story is kept. No automatic expiry of stories.
2. Deletion means **every copy we control is removed**, and copies we cannot immediately remove (backups, processor logs) are bounded, disclosed, and tracked.
3. Content becomes **inaccessible immediately** on request; irreversible removal follows the cancellation window (72 h, OQ-015) or immediately on explicit confirmation.
4. Deletion leaves only content-free traces: a tombstone (IDs + timestamps) and audit events (IDs + state names).
5. Fewer copies, fewer problems: no embeddings, search indexes, content caches, or analytics copies exist in R1.

## 2. Retention schedule

| Data | Retention | Basis |
|---|---|---|
| Original audio, playback rendition | Until story deletion | Storyteller choice |
| Transcript/translation versions (incl. superseded) and revisions | Until story deletion | Provenance |
| Consent records and evidence audio | Until story deletion (post-deletion retention: LEGAL REVIEW, OQ-015) | Accountability |
| Audit events | 5 years (provisional, LEGAL REVIEW) — content-free | Accountability |
| `job_step_results` | Until job terminal + outputs persisted (then deleted); max 30 days | Retry efficiency |
| Worker temp files | Deleted in `finally` after each job; container restarts clear ephemeral disk | — |
| Export archives | Link 24 h; file deleted ≤ 7 days | FR-EXP-01 |
| Sessions | Until expiry/revocation + 30 days | Security |
| Auth challenges, IP hashes | 24 h | Rate limiting |
| Idempotency keys | 24 h | — |
| Webhook receipts | 30 days | Dedupe |
| Logs/traces (content-free) | 30 days (vendor setting) | Operations |
| Deletion certificates | 90 days available to requester; ledger entries indefinitely (IDs only) | Proof of deletion + restore replay |

## 3. Copy inventory (what deletion must cover)

| # | Copy | Location | How removed | Timing |
|---|---|---|---|---|
| 1 | Story DB rows: `stories` content columns, `story_roles`, `consent_records` + `consent_scope_grants`, `custodian_designations`, `recordings`, `media_assets`, `transcripts`, `transcript_segments`, `segment_revisions`, `uncertainty_flags`, `translations`, `translation_segments`, `verification_reports`, `verification_issues`, `story_versions`, `processing_jobs` (input refs), `model_runs` (see note), `job_step_results`, `export_requests`, `invitations` for the story, `break_glass_grants` | Railway Postgres | Hard delete in dependency order in one transaction; `stories` row replaced by `story_tombstones` | At execution |
| 2 | Glossary terms whose `source_story_id` = story | Postgres | Rights holder chooses at request time: delete or keep as family glossary (default: delete) | At execution |
| 3 | Original, playback, consent-evidence, export assets | Cloudinary | `destroy` (`resource_type`, `type: authenticated`, `invalidate: true`) + explicit derived deletion **[S9]** | At execution |
| 4 | Cloudinary backup versions | Cloudinary backup store | Admin API delete backed-up versions (irreversible) **[S10]** | At execution |
| 5 | CDN caches | Cloudinary CDN | `invalidate: true` — propagation seconds to minutes **[S9]** | At execution |
| 6 | AI provider copies | OpenAI / Nebius / other | Cannot be deleted by us. With OpenAI ZDR: none retained; otherwise abuse-monitoring logs up to 30 days **[S4]**. Nebius with ZDR: not stored; without ZDR retained for speculative decoding **[S16]** | Bounded by provider policy; disclosed |
| 7 | Native Postgres backups | Railway | Not individually editable; expire: daily 6 days, weekly 1 month **[S11]** (monthly disabled) | ≤ ~31 days |
| 8 | PITR WAL archive | Railway bucket | Expires with ~4-week window **[S11]** | ≤ ~28 days |
| 9 | Offsite encrypted `pg_dump` | Our S3-compatible bucket | Expire after 30 days (lifecycle rule) | ≤ 30 days |
| 10 | Browser local buffers | User's device | Cannot be deleted remotely; app deletes after verification; deletion screen tells user to open the app on that device or clear site data | Notice |
| 11 | Emails | Recipients' inboxes | Content-free by design (FR-NOT-01) | n/a |
| 12 | Logs / traces / error reports | Observability vendor | Content-free by design (`SECURITY_AND_PRIVACY.md` §9); expire per retention | n/a |

Note on `model_runs`: rows contain only hashes, provider/model IDs, cost and latency. They are **deleted** with the story in R1 (simplest). Aggregate cost metrics already rolled into `ai_usage_daily` are content-free and kept.

**Maximum residual window for storyteller-facing disclosure:** **35 days** after deletion executes (max of #7 ≈ 31 days, #8 ≈ 28 days, #9 30 days, #6 30 days — plus margin). This number goes into consent card 6 (`CONSENT_AND_OWNERSHIP.md` §10). If backup policy changes, this number must be recalculated and the consent script versioned.

## 4. Deletion pipeline

1. **Request** (`deletion_requests.status = requested`): story → `deletion_pending`; audience → `private`; all non-deletion jobs cancelled; sessions of non-requesters denied by policy (story in `deletion_pending` is readable only by requester's cancel view). Audit `deletion.requested`.
2. **Window**: 72 h (or immediate with re-confirmation). Cancel → story restored to previous status (audience stays `private`).
3. **Execute** (`deletion.execute` job, idempotent):
   1. Enumerate targets into `deletion_targets` (from `media_assets`, export requests, glossary choice, provider notices).
   2. Provider deletions (Cloudinary assets, derivatives, backups) — each target retried with backoff; outcomes recorded.
   3. DB deletion transaction: delete content rows in dependency order; insert `story_tombstones`; write `deletion.executed` audit event.
   4. Append ledger entry (`{storyId, deletionRequestId, executedAt}`) to the offsite **deletion ledger** (§6).
   5. Verify: `head()` each media ref → absent; DB query for any row referencing story ID → none.
   6. `completed` (or `completed_with_exceptions` → daily retries for 30 days → escalation to admin).
4. **Certificate**: content-free JSON (+ printable page) listing target types, counts, outcomes, timestamps, and residual windows for backups/provider logs.

## 5. Backups and the limits of immediate deletion

- Backups are necessary for safety of irreplaceable originals but cannot be edited per record.
- Policy: keep backup retention short (§3 #7–#9) and never restore a backup into production without replaying the deletion ledger.
- The consent explanation and deletion screen state plainly: "Copies in our safety backups are removed automatically within 35 days."
- **LEGAL REVIEW** (OQ-015): adequacy of backup residual windows under POPIA s14/s24 and whether consent evidence must be retained.

## 6. Deletion ledger and restore replay

- The ledger is an append-only, content-free list of deleted story IDs and media public IDs, stored **outside** the primary database (S3-compatible bucket, `DELETION_LEDGER_S3_*`, object-lock/versioning if available), replicated every 15 minutes by `maintenance.ledger_replicate` and also written synchronously on execution.
- **Restore runbook** (mandatory steps): (1) restore DB into an isolated service, (2) fetch ledger, (3) re-run deletion for every ledger entry newer than the backup timestamp (DB rows + verify media absent), (4) only then point services at the restored DB. Restore drills test this path (`RAILWAY_INFRASTRUCTURE.md` §6).

## 7. Account closure

1. User requests closure (FR-ACC-01). For each story where the user is storyteller or rights holder, they choose: delete story, or (if they are custodian) hand back to the storyteller / step down.
2. Remove the user from family circles (circle admin transfer required if last admin).
3. Delete user row's personal fields (email → removed, display name → "Former member"), sessions, auth challenges; keep the user ID for audit integrity.
4. Stories where the user was only a recorder/reviewer remain (they belong to the storyteller); their revisions keep author attribution as "Former member".

## 8. Withdrawal vs deletion

Withdrawal of a processing scope stops future processing and hides affected outputs but keeps the story (`CONSENT_AND_OWNERSHIP.md` §7). Withdrawal of `record_and_store`/`cross_border_processing` triggers deletion.

## 9. Legal holds

If a lawful order requires preservation, deletion for the affected story pauses (`admin_legal` hold flag — R2), the requester is informed where lawful, and the hold is audited. Process to be defined with counsel (OQ-015).
