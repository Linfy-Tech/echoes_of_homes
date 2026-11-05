# ADR-003: Cloudinary for media, authenticated delivery, behind `MediaStorageProvider`

- **Status:** Accepted (provider, abstraction) · Provisional (plan tier, region — OQ-002, OQ-003)
- **Date:** 2026-11-04

## Context
Cloudinary is the specified media store. Audio files use the `video` asset type **[S7]**. Delivery types: `upload` is public; `private` protects originals but leaves derived assets public by default; `authenticated` requires signed URLs for originals and derivatives and allows only eager (not on-the-fly) transformations **[S8]**. Signed delivery URLs don't expire and can be reused once exposed; expiring token-based access needs the Advanced plan or higher **[S8]**. Signed uploads must be signed server-side (signature valid 1 hour); chunked uploads use `X-Unique-Upload-Id` + `Content-Range`, minimum 5 MB chunks, required above 100 MB **[S7]**. Deletion uses `destroy` with `invalidate: true` for CDN caches **[S9]**; automatic backup (all plans, originals only) keeps versions until deleted via the Admin API **[S10]**.

## Options for private playback
1. Give clients signed URLs — rejected: non-expiring, shareable.
2. Token-based expiring URLs — requires Advanced plan; reconsider later.
3. **API streaming proxy** with per-request authorisation and server-side signed URLs — chosen.

## Decision
- All story media uploaded as `resource_type: video` (audio) / `raw` (archives), `type: authenticated`, random non-identifying public IDs, no personal data in folders/tags/metadata.
- Direct browser → Cloudinary signed chunked uploads; worker re-verifies hash.
- Eager low-bitrate playback derivative; processing derivative made by the worker, not stored.
- Playback only via `GET /v1/stories/{id}/audio` proxy (Range support).
- Automatic backup enabled; deletion pipeline deletes assets, derivatives, CDN caches, and backup versions.
- All provider access through `packages/media-storage` (`MediaStorageProvider`), with a `fake` adapter for dev/CI.

## Consequences
- Playback bandwidth passes through Railway (cost, latency) — mitigated with low bitrate.
- Several behaviours are UNVERIFIED and must be confirmed in the M0 spike: chunk resume (OQ-004), derived deletion on `destroy` and backup-ID reservation (OQ-010), region (OQ-002).

## Revisit when
Playback volume makes proxying expensive (consider token auth); residency requirements need a different store; spike results contradict assumptions.
