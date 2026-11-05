# API Contracts

**Service:** `apps/api` (Fastify). **Base path:** `/v1`. **Format:** JSON (UTF-8). **Schema source of truth:** Zod schemas in `packages/validation`; OpenAPI 3.1 is generated from them in CI and checked into `apps/api/openapi.json` (diff reviewed in PRs).

All examples use **illustrative data only** (fictional IDs and names).

---

## 1. Conventions

### 1.1 Authentication
- Session cookie `eoh_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`). Opaque token; server-side lookup.
- State-changing requests (`POST/PUT/PATCH/DELETE`) require: valid session, `Origin` header in `ALLOWED_ORIGINS`, and header `X-Requested-With: eoh-web` (CSRF defence in depth).
- No bearer tokens for end users in R1. Webhooks authenticate by provider signature.

### 1.2 Authorisation
Every route declares a policy action (e.g. `story.read`, `transcript.segment.edit`) evaluated by `packages/auth`. Unauthorised access to an existing resource the actor cannot know about returns **404**, not 403, to avoid existence leaks. 403 is used only when the actor can see the resource but not perform the action.

### 1.3 Errors — RFC 9457 Problem Details
`Content-Type: application/problem+json`

```json
{
  "type": "https://errors.echoes-of-home.example/invalid-state-transition",
  "title": "This step can't happen yet",
  "status": 409,
  "code": "invalid_state_transition",
  "detail": "Transcript must be review_complete before approval.",
  "correlationId": "01JC9Z4Q8M2N6P0R",
  "errors": []
}
```

`errors[]` holds field-level validation issues: `{ "path": "scopes[2]", "code": "invalid_enum" }`. `detail` never contains story content.

Stable error codes (non-exhaustive): `validation_failed` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404), `conflict_version` (409), `invalid_state_transition` (409), `consent_required` (409), `consent_evidence_pending` (409), `assisted_confirmation_required` (409), `transcript_not_approved` (409), `idempotency_key_reused` (422), `rate_limited` (429), `budget_exceeded` (503, processing only), `provider_unavailable` (503), `internal_error` (500).

### 1.4 Idempotency
`POST` endpoints that create resources or trigger work **require** `Idempotency-Key` (UUID). The same key + same body returns the stored response for 24 h; same key + different body → `422 idempotency_key_reused`.

### 1.5 Concurrency
Mutable resources return `ETag: "v<version>"`. `PATCH`/state-change requests on them **require** `If-Match`. Mismatch → `409 conflict_version` with the current version in `detail`.

### 1.6 Pagination
Cursor-based: `?limit=25&cursor=<opaque>`; responses include `{ "data": [...], "nextCursor": "…" | null }`. Max `limit` 100. Ordering is stable (`created_at, id`).

### 1.7 Rate limits
Per user and per IP, token bucket. Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; `429` with `Retry-After`. Defaults in `ENVIRONMENT_VARIABLES.md`. Stricter buckets: sign-in, upload-session creation, export creation.

### 1.8 Versioning
URL major version (`/v1`). Additive changes (new optional fields, new endpoints) within v1. Breaking changes → `/v2`, with v1 supported for ≥ 90 days after the web app migrates. Response objects may gain fields; clients must ignore unknown fields.

### 1.9 Correlation
Clients may send `X-Correlation-Id`; otherwise the API generates one. Returned on every response and propagated to jobs.

## 2. Endpoint catalogue

| Method & path | Policy action | Notes |
|---|---|---|
| **Auth** |||
| `POST /v1/auth/challenges` | public (rate-limited) | Start sign-in; always `202` |
| `POST /v1/auth/challenges/verify` | public (rate-limited) | Code or link token → sets cookie |
| `POST /v1/auth/logout` | session | |
| `GET /v1/me` · `PATCH /v1/me` | session | profile, `uiLanguage` |
| `GET /v1/me/sessions` · `DELETE /v1/me/sessions/{id}` · `POST /v1/me/sessions/revoke-all` | session | |
| `POST /v1/me/close` | `account.close` | blocked if pending rights-holder decisions |
| **Families & people** |||
| `POST /v1/families` · `GET /v1/families` · `GET /v1/families/{id}` | `family.*` | |
| `POST /v1/families/{id}/invitations` | `family.invite` | family_admin |
| `POST /v1/invitations/{token}/accept` | session | all invitation types |
| `DELETE /v1/families/{id}/members/{userId}` | `family.member.remove` | |
| `POST /v1/people` · `GET /v1/people/{id}` · `PATCH /v1/people/{id}` | `person.*` | |
| `GET/POST /v1/families/{id}/glossary` · `POST /v1/glossary/{termId}/approve` | `glossary.*` | |
| **Stories** |||
| `POST /v1/stories` · `GET /v1/stories` · `GET /v1/stories/{id}` · `PATCH /v1/stories/{id}` | `story.*` | |
| `GET /v1/stories/{id}/activity` | `story.activity.read` | audit view |
| `POST /v1/stories/{id}/roles` · `DELETE /v1/stories/{id}/roles/{roleId}` | `story.role.manage` | rights holder |
| **Consent** |||
| `GET /v1/consent-scripts/current?language=xh` | session | |
| `POST /v1/stories/{id}/consent` | `consent.create` | initial/grant/revoke; see §3.3 |
| `GET /v1/stories/{id}/consent` | `consent.read` | current + history |
| `POST /v1/stories/{id}/consent/withdraw` | `consent.withdraw` | |
| `POST /v1/stories/{id}/consent/evidence-uploads` | `consent.evidence.upload` | upload session for spoken consent |
| **Recording & media** |||
| `POST /v1/stories/{id}/recordings` | `recording.create` | returns upload session |
| `POST /v1/recordings/{id}/complete` | `recording.complete` | client completion signal |
| `GET /v1/recordings/{id}` | `recording.read` | status |
| `GET /v1/stories/{id}/audio?rendition=playback` | `story.audio.stream` | Range-enabled proxy stream |
| `POST /v1/webhooks/media` | provider signature | Cloudinary notifications |
| **Processing** |||
| `GET /v1/stories/{id}/processing` | `story.read` | job summaries (no content) |
| **Transcripts** |||
| `GET /v1/stories/{id}/transcripts/current` | `transcript.read` | with segments + flags |
| `PATCH /v1/transcript-segments/{id}` | `transcript.segment.edit` | `If-Match` |
| `POST /v1/transcript-segments/{id}/split` · `POST /v1/transcript-segments/{id}/merge-next` | `transcript.segment.edit` | |
| `POST /v1/uncertainty-flags/{id}/resolve` | `transcript.flag.resolve` / `transcript.flag.accept_uncertain` | |
| `POST /v1/transcripts/{id}/review-complete` · `POST /v1/transcripts/{id}/reopen` | `transcript.review.complete` | |
| `POST /v1/transcripts/{id}/approve-for-translation` | `transcript.approve` | rights holder |
| **Translations** |||
| `GET /v1/stories/{id}/translations/current` | `translation.read` | with segments + report |
| `PATCH /v1/translation-segments/{id}` | `translation.segment.edit` | |
| `POST /v1/verification-issues/{id}/resolve` · `/dismiss` | `translation.issue.manage` | |
| `POST /v1/translations/{id}/approve` · `/reject` | `translation.approve` | translation reviewer |
| **Final story & sharing** |||
| `POST /v1/stories/{id}/versions` | `story.approve_final` | rights holder; creates story version |
| `GET /v1/stories/{id}/versions/current` | `story.version.read` | reader payload |
| `PUT /v1/stories/{id}/audience` | `story.audience.change` | `If-Match` |
| **Deletion & export** |||
| `POST /v1/stories/{id}/deletion-requests` · `POST /v1/deletion-requests/{id}/cancel` · `GET /v1/deletion-requests/{id}` | `story.delete` | |
| `POST /v1/stories/{id}/exports` · `GET /v1/exports/{id}` · `GET /v1/exports/{id}/download` | `story.export` | |
| **Admin** |||
| `GET /v1/admin/jobs?status=failed_permanent` · `POST /v1/admin/jobs/{id}/retry` | `admin.jobs` | no content |
| `POST /v1/admin/break-glass` · `DELETE /v1/admin/break-glass/{id}` | `admin.break_glass` | |
| **Health** |||
| `GET /healthz` (liveness) · `GET /readyz` (DB reachable, migrations current) | public, no data | |

## 3. Selected contracts

### 3.1 Start sign-in
`POST /v1/auth/challenges`
```json
{ "email": "sipho@example.invalid", "uiLanguage": "xh" }
```
`202 Accepted` → `{ "challengeId": "018f3c1e-…", "expiresInSeconds": 600 }` (same response whether or not the account exists).

### 3.2 Create story
`POST /v1/stories` · `Idempotency-Key: 6c1d…`
```json
{ "familyCircleId": "018f…a1", "storytellerPersonId": "018f…p7", "title": null }
```
`201 Created`
```json
{
  "id": "018f…s3",
  "status": "draft",
  "audience": "private",
  "sourceLanguage": "xh",
  "targetLanguage": "en",
  "storytellerPersonId": "018f…p7",
  "rightsHolderPersonId": "018f…p7",
  "myRoles": ["recorder"],
  "version": 1
}
```
Sending `"audience"` in the body → `400 validation_failed` (unknown field; audience is changed only via §3.9).

### 3.3 Record consent
`POST /v1/stories/{id}/consent` · `Idempotency-Key` required
```json
{
  "changeKind": "initial",
  "method": "assisted_verbal",
  "consentScriptId": "018f…c2",
  "presentedLanguage": "xh",
  "scopes": {
    "record_and_store": true,
    "cross_border_processing": true,
    "ai_transcription": true,
    "human_review": true,
    "translation": true,
    "share_family": false
  },
  "rightsHolderChoice": "custodian",
  "custodianInviteEmail": "sipho@example.invalid",
  "evidenceMediaAssetId": "018f…e9",
  "comprehension": { "questions": 3, "correct": 3, "reexplained": false },
  "adultAttested": true
}
```
`201 Created` → consent record with `status: "active"`, `supersedesId`, and the resulting story `status: "ready_to_record"`.

Rules: `share_public`/`model_training` keys are rejected in R1. `changeKind: "grant"` (adding scopes) requires `method` self or assisted with new evidence; `changeKind: "revoke"` can be performed by the rights holder without evidence. Missing evidence for `assisted_verbal` → `400`. Evidence asset not yet `available` → `409 consent_evidence_pending`.

### 3.4 Create recording / upload session
`POST /v1/stories/{id}/recordings`
```json
{ "source": "browser_recording", "sha256": "9f2c…(64 hex)", "sizeBytes": 18874368, "mimeType": "audio/webm;codecs=opus" }
```
`201 Created`
```json
{
  "recordingId": "018f…r4",
  "status": "pending_upload",
  "upload": {
    "provider": "cloudinary",
    "url": "https://api.cloudinary.com/v1_1/<cloud>/video/upload",
    "params": {
      "public_id": "eoh/prod/a/7Qx…random",
      "type": "authenticated",
      "timestamp": 1730700000,
      "eager": "<server-defined playback rendition>",
      "eager_async": true,
      "notification_url": "https://api.example.invalid/v1/webhooks/media",
      "api_key": "<public api key>",
      "signature": "<server-generated>"
    },
    "chunkSizeBytes": 6000000,
    "expiresAt": "2026-11-04T19:00:00Z"
  }
}
```
Errors: `409 consent_required` (missing `record_and_store`/`cross_border_processing`), `409 invalid_state_transition` (live recording exists), `400` (size > max, unsupported MIME).
The signature covers every param above; the client cannot change `public_id`, `type`, or folder. Signatures are valid ≤ 1 h **[VERIFIED S7]**; if expired mid-upload, the client requests `POST /v1/recordings/{id}/upload-session` for a fresh signature with the same `public_id` (resume behaviour: spike in M0, OQ-004).

### 3.5 Transcript (review payload)
`GET /v1/stories/{id}/transcripts/current`
```json
{
  "id": "018f…t1",
  "versionNumber": 1,
  "status": "in_review",
  "progress": { "segments": 142, "reviewed": 37, "openFlags": 11 },
  "segments": [
    {
      "id": "018f…g1",
      "ordinal": 12,
      "startMs": 61200,
      "endMs": 68950,
      "text": "Sasihlala eQonce ngelo xesha …",
      "reviewState": "unreviewed",
      "detectedLanguages": ["xh"],
      "version": 1,
      "flags": [
        { "id": "018f…f3", "reason": "possible_place", "source": "context_assist",
          "charStart": 13, "charEnd": 19, "status": "open",
          "questionForReviewer": "Is this a place name? Please check the spelling." }
      ]
    }
  ],
  "nextCursor": null
}
```
(isiXhosa text above is an illustrative placeholder, not a real story.) Large transcripts are paginated by segment cursor.

### 3.6 Edit a segment
`PATCH /v1/transcript-segments/{id}` · `If-Match: "v1"`
```json
{ "text": "Sasihlala eQonce ngelo xesha …", "action": "correct", "resolveFlagIds": ["018f…f3"] }
```
`action` ∈ `confirm | correct | mark_inaudible | exclude | reopen`; `exclude` requires `exclusionReason`. `200` → updated segment with `version: 2`, `ETag: "v2"`. Flags listed in `resolveFlagIds` move to `resolved_corrected`/`resolved_confirmed`/`resolved_inaudible` according to `action`.

### 3.7 Approve transcript for translation
`POST /v1/transcripts/{id}/approve-for-translation` · `If-Match`
`200` → `{ "status": "approved_for_translation", "contentHash": "…", "translationEnqueued": true }` (`false` when `translation` scope not granted).
Errors: `409 invalid_state_transition` (not `review_complete`), `403` (not rights holder).

### 3.8 Final approval
`POST /v1/stories/{id}/versions`
```json
{ "transcriptId": "018f…t1", "translationId": "018f…x2", "confirm": true }
```
`201` → `{ "storyVersionId": "018f…v1", "versionNumber": 1, "audience": "private" }`.

### 3.9 Change audience
`PUT /v1/stories/{id}/audience` · `If-Match`
```json
{ "audience": "family" }
```
`200` → `{ "audience": "family", "effectiveImmediately": true }`. Errors: `409 consent_required` (`share_family` not granted), `409 assisted_confirmation_required` (custodian without a confirmation in the last 24 h), `409 invalid_state_transition` (no approved version), `400` (`public` while feature flag off).

### 3.10 Audio stream
`GET /v1/stories/{id}/audio?rendition=playback` with `Range: bytes=0-`
`206 Partial Content`, `Content-Type: audio/mp4` (or rendition type), `Cache-Control: private, no-store`, `Accept-Ranges: bytes`. Authorisation evaluated per request. `rendition=original` permitted only for storyteller/rights holder and rate-limited.

### 3.11 Media webhook
`POST /v1/webhooks/media` — verifies Cloudinary signature headers (exact scheme verified in M3 against provider docs), dedupes by provider event ID in `webhook_receipts`, matches `public_id` to a `pending_upload` recording, and transitions it. Unknown `public_id` → `200` (ignored, logged by ID). Never trusts webhook payload for hash or duration — the worker re-verifies.

### 3.12 Deletion request
`POST /v1/stories/{id}/deletion-requests`
```json
{ "immediate": false, "confirmPhrase": "delete" }
```
`201` → `{ "id": "018f…d1", "status": "requested", "executeAfter": "2026-11-07T18:00:00Z" }`.

## 4. Contract testing

- Every route has request/response schema tests generated from Zod (valid + invalid fixtures).
- Every route has an authorisation matrix test: for each role in `CONSENT_AND_OWNERSHIP.md` §5, assert allow/deny and 404-vs-403 behaviour.
- OpenAPI diff check in CI flags breaking changes in `/v1`.
