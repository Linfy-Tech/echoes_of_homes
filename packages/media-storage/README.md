# packages/media-storage

`MediaStorageProvider` interface, `cloudinary` adapter, and `fake` adapter (`docs/MEDIA_STORAGE.md` §1, ADR-003).

- Only place the Cloudinary SDK is imported.
- Upload sessions always `type: authenticated`, `resource_type: video` (audio) / `raw` (archives), random public IDs, server-defined eager derivatives; startup self-test asserts this.
- `openStream` supports byte ranges; signed URLs never leave the API process.
- `deleteAsset` (with CDN invalidation and derivative cleanup) and `deleteBackups` are idempotent.
- Shared contract test suite runs against `fake` (CI) and `cloudinary` (staging, opt-in).
