# apps/web — Next.js PWA

Mobile-first, bilingual (isiXhosa/English) client. **Milestones:** shell M1; screens per `docs/MILESTONES.md`.

**Responsibilities:** all screens in `docs/USER_JOURNEYS.md` §3; i18n catalogues (`messages/xh.json`, `messages/en.json`); in-browser recording with IndexedDB buffering and recovery; SHA-256 hashing in a Web Worker; signed chunked upload to the media provider; calling the API with session cookies; accessibility (WCAG 2.2 AA).

**Must not:** hold secrets; import `packages/database`, `packages/auth` internals, `packages/ai-providers`, `packages/media-storage`, or provider SDKs; call AI providers; cache story content in the service worker or Cache Storage; render model output as HTML; use product analytics or session replay.

**May import:** `packages/shared-types`, `packages/validation`.

**Key specs:** `docs/USER_JOURNEYS.md`, `docs/SYSTEM_DESIGN.md` §6, §13, `docs/API_CONTRACTS.md`.
