# apps/api — Fastify HTTP API

The only entry point for user-initiated reads and writes. **Milestone:** M1 onward.

**Responsibilities:** sessions and sign-in; CSRF, CORS, security headers, rate limits; request validation (Zod, strict); authorisation via `packages/auth` on **every** route; calling domain services (state transitions + audit + transactional job enqueue); upload-session signing; media streaming proxy with Range support; media webhooks; OpenAPI generation (`openapi.json`); health endpoints.

**Must not:** contain business rules in route handlers; return provider media URLs; log content; call AI providers (worker only); skip `If-Match`/`Idempotency-Key` where `docs/API_CONTRACTS.md` requires them.

**Layout:** see `docs/SYSTEM_DESIGN.md` §1. Every route declares a policy action; a route-inventory test fails CI otherwise.

**Key specs:** `docs/API_CONTRACTS.md`, `docs/MACHINE.md`, `docs/CONSENT_AND_OWNERSHIP.md` §5, `docs/SECURITY_AND_PRIVACY.md`.
