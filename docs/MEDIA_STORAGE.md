# Media Storage

**Decision:** Cloudinary as the R1 media store, behind a `MediaStorageProvider` abstraction (ADR-003). PostgreSQL stores only metadata, ownership, status, provider identifiers, and integrity hashes — never media blobs (ADR-002).

All Cloudinary facts below were checked on 2026-11-04 (`SOURCES.md`). Items marked UNVERIFIED must be confirmed in the M0 spike before M3 depends on them.

---

## 1. `MediaStorageProvider` interface (`packages/media-storage`)

```ts
// illustrative — final shape fixed in M3
export interface MediaStorageProvider {
  readonly name: 'cloudinary' | 'fake';

  /** Server-side: create signed, constrained direct-upload parameters. */
  createUploadSession(input: {
    assetId: Uuid; role: MediaRole; mimeType: string; sizeBytes: number;
    derivatives: DerivativeSpec[];           // e.g. playback rendition
  }): Promise<UploadSession>;                // url, signed params, chunk size, expiresAt

  /** Server-side: refresh a signature for an in-progress upload (same publicId). */
  refreshUploadSession(assetId: Uuid): Promise<UploadSession>;

  /** Verify a provider notification's authenticity; returns normalised event or null. */
  verifyNotification(headers: Headers, rawBody: Buffer): Promise<MediaEvent | null>;

  /** Server-side streaming fetch (supports Range). Never returns a URL to callers outside the API. */
  openStream(ref: ProviderRef, range?: ByteRange): Promise<MediaStream>;

  /** Worker: download to a local path for verification/processing. */
  download(ref: ProviderRef, destPath: string): Promise<{ bytes: number }>;

  /** Existence/metadata check (reconciliation). */
  head(ref: ProviderRef): Promise<ProviderAssetInfo | null>;

  /** Delete original + all derivatives + CDN invalidation; idempotent. */
  deleteAsset(ref: ProviderRef): Promise<DeleteOutcome>;

  /** Delete provider-side backup versions, if backups are enabled; idempotent. */
  deleteBackups(ref: ProviderRef): Promise<DeleteOutcome>;

  /** Upload a server-generated file (export archives, consent-script audio). */
  putFile(input: { assetId: Uuid; role: MediaRole; path: string; mimeType: string }): Promise<ProviderRef>;
}
```

Rules:
- Only `packages/media-storage` imports the Cloudinary SDK.
- `ProviderRef = { provider, publicId, resourceType, deliveryType }` stored in `media_assets`.
- A `fake` adapter (local filesystem under a temp dir, with the same signature/expiry semantics and simulated failures) is the default for local dev and CI.
- Contract tests run the same suite against `fake` and (opt-in, nightly in staging) `cloudinary`.

## 2. Cloudinary configuration decisions

| Item | Decision | Basis |
|---|---|---|
| Resource type for audio | `video` | Audio uses the `video` asset type, not `raw` **[VERIFIED S7]** |
| Delivery type | `authenticated` for every story asset (original, playback, consent evidence) | Original **and** derived require signed URLs **[VERIFIED S8]**; `private` would leave derived assets public by default **[VERIFIED S8]** |
| Transformations | **Eager only**, defined server-side at upload | Authenticated assets cannot use on-the-fly transformations **[VERIFIED S8]** |
| Playback rendition | Eager audio derivative (low bitrate, e.g. AAC/MP3 ~32–48 kbps mono — exact transformation string verified in M3 against audio transformation docs) | NFR-NET-02 |
| Processing derivative | **Not stored** in R1; produced by the worker with ffmpeg in ephemeral temp storage | Fewer copies to delete |
| Public IDs | Random 128-bit base62, under `eoh/<env>/<2-char shard>/`; **no names, titles, family names, or story IDs** in public IDs, folders, tags, or context metadata | Provider metadata is outside our DB access control |
| Upload signing | Server-generated signature; never expose `api_secret`; signatures valid 1 hour **[VERIFIED S7]** | — |
| Upload presets | No unsigned presets | Unsigned presets allow anyone to upload |
| Chunked upload | Client chunks ≥ 5 MB (except last), `X-Unique-Upload-Id` + `Content-Range` **[VERIFIED S7]**; mandatory above 100 MB **[VERIFIED S7]** | Low-bandwidth resilience |
| Notifications | `notification_url` → `/v1/webhooks/media`; signature verified | **[VERIFIED S7]** that `notification_url` exists; signature scheme to verify in M3 |
| Strict transformations | Enable (defence in depth; prevents creating new derived URLs by tampering) | Recommended in **[S8]** context |
| Automatic backup | **Enable** (originals are irreplaceable) and include `deleteBackups` in deletion pipeline | Backups available on all plans, originals only; deleting backed-up versions via Admin API is irreversible **[VERIFIED S10]** |

## 3. Upload flow (direct to provider)

1. API validates consent + authorisation + declared size/MIME/SHA-256 → creates `recordings` + `media_assets` rows → returns signed params (`public_id`, `type=authenticated`, `resource_type=video`, eager spec, `notification_url`, timestamp, signature).
2. Browser uploads in chunks directly to Cloudinary.
3. Cloudinary notifies the webhook; the client also calls `/complete`.
4. Worker downloads, re-hashes, probes → `verified`/`failed` (FR-UPL-05).

Why direct-to-provider rather than via the API: avoids doubling bandwidth through Railway and API memory pressure on slow uploads; the provider handles chunk assembly. Integrity is guaranteed by the worker's independent hash check.

**UNVERIFIED — M0 spike (OQ-004):**
- Whether an interrupted chunked upload can resume with the same `X-Unique-Upload-Id` after a gap of minutes/hours, and whether a refreshed signature can continue the same upload.
- Exact maximum file size for our plan ("depends on your plan and account configuration" **[VERIFIED S7]**).
- Eager audio transformation syntax and output codec choices for authenticated audio.

Fallback if resume is not supported: client restarts the upload from IndexedDB-stored data (bytes re-sent, but nothing lost). If that proves too costly on prepaid data, add a resumable upload endpoint (tus protocol) on the API that relays to the provider (R2 decision).

## 4. Server-side authorisation of media

- Clients never receive Cloudinary URLs for story media.
- All reads go through `GET /v1/stories/{id}/audio` (and consent-evidence playback via a similar endpoint restricted to storyteller/rights holder). Authorisation is evaluated per request.
- Signed delivery URLs are generated inside the API process per request and discarded. Rationale: Cloudinary signed URLs carry no expiry; "Once a URL is exposed … anyone with it can access the asset" **[VERIFIED S8]**.
- Token-based (expiring) access would allow handing short-lived URLs to clients but "require[s] the Advanced plan or higher" **[VERIFIED S8]** → OQ-003 (cost vs bandwidth trade-off; re-evaluate when playback volume grows).

## 5. Bandwidth, cost, limits

| Item | Status |
|---|---|
| Storage, bandwidth, transformation credits per plan | UNVERIFIED — check Cloudinary pricing at account setup; record in `RAILWAY_INFRASTRUCTURE.md` cost table |
| Max upload size per plan | UNVERIFIED (plan-dependent **[S7]**) |
| API rate limits (Admin API) | UNVERIFIED — affects bulk deletion speed; deletion pipeline is rate-limit tolerant (retry with backoff) |
| Proxy streaming egress through Railway | Accepted cost; low-bitrate rendition (e.g. 60 min × 32 kbps ≈ 14 MB) keeps volume small |

## 6. Deletion and derived-asset cleanup

Per asset, the deletion pipeline (`RETENTION_AND_DELETION.md`) calls:

1. `destroy` with `resource_type: 'video'`, `type: 'authenticated'`, `invalidate: true` — removes the asset and invalidates CDN caches (propagation "a few seconds to a few minutes") **[VERIFIED S9]**.
2. Explicit derived-resource deletion for any derivatives still listed (verify whether `destroy` removes eager derivatives automatically — **UNVERIFIED**, spike in M0; implement explicit deletion regardless) **[S9]**.
3. Delete backed-up versions via the Admin API "delete backed up versions" method (requires listing version IDs) — irreversible **[VERIFIED S10]**. Note: after deleting a backed-up asset, Cloudinary reserves the public ID in the backup system **[VERIFIED S10]**; whether this reservation retains any content after backup-version deletion is UNVERIFIED → confirm with Cloudinary support (OQ-010).
4. `head()` to confirm absence; record outcome in `deletion_targets`.

Deleted assets are "immediately and permanently removed from your cloud storage" **[VERIFIED S9]**, except for backups (handled in step 3).

## 7. Retention and export

- Originals retained until deletion is requested (no automatic expiry) — the storyteller decides.
- Export archives are uploaded as `raw`, `authenticated` assets (role `export_archive`), streamed to the requester through the API, and deleted after 7 days (FR-EXP-01).
- Consent-script audio (human-recorded explanations) is not personal data of storytellers; stored as `authenticated` too for simplicity.

## 8. Backup, recovery, residency

| Concern | Position |
|---|---|
| Provider-side backup | Enabled (§2). Default backup location is a "secondary, write-protected location" counted against storage quota **[VERIFIED S10]**. Bring-your-own S3/GCS/Azure backup requires a paid plan **[VERIFIED S10]** — R3 option for an independent copy. |
| Independent second copy | Not in R1. Risk accepted and recorded (R-12). R3: replicate originals to a separate S3-compatible bucket under our control, included in deletion pipeline. |
| Recovery drill | Quarterly: delete a test asset in staging and restore from Cloudinary backup; record time. |
| Data residency | **UNVERIFIED**: Cloudinary storage/processing region for our account and whether a non-US region is available on our plan → OQ-002 (blocker for consent-script processor disclosure text, not for code). |
| Cross-border | Media is stored outside South Africa → POPIA s72 analysis (`SECURITY_AND_PRIVACY.md` §6). |

## 9. Replacing Cloudinary later

The abstraction keeps the migration to e.g. S3-compatible object storage + our own transcoding (ffmpeg in worker) + our own streaming to: (1) new adapter, (2) background copy job per asset with hash verification, (3) flip `media_assets.provider` per row after verification, (4) delete from Cloudinary through the deletion pipeline. No schema change.

## 10. Operational risks

| Risk | Mitigation |
|---|---|
| Accidental public delivery type | Upload params generated only server-side; startup self-test asserts `type=authenticated`; contract test inspects signed params |
| Secret leakage | `CLOUDINARY_API_SECRET` only in api/worker env; never in web; secret scanning in CI |
| Metadata leakage via public IDs/tags | Random IDs, no tags/context with personal data (lint rule in adapter) |
| Webhook spoofing | Signature verification + dedupe + worker re-verification |
| Provider outage | Uploads retry client-side; playback shows "Audio temporarily unavailable" with transcript still readable; processing jobs retry |
| Plan downgrade disables features | Feature matrix (token auth, backup BYO storage) documented per plan before signing up (OQ-003) |
