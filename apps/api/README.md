# apps/api — Fastify HTTP API

The only entry point for user-initiated reads and writes. **Milestone:** M1 onward.

**Responsibilities:** sessions and sign-in; CSRF, CORS, security headers, rate limits; request validation (Zod, strict); authorisation via `packages/auth`; calling domain services (state transitions + audit + transactional job enqueue); upload-session signing; media streaming proxy with Range support; media webhooks; OpenAPI generation (`openapi.json`); health endpoints.

**Must not:** contain business rules in route handlers; return provider media URLs; log content; call AI providers (worker only); skip `If-Match`/`Idempotency-Key` where `docs/API_CONTRACTS.md` requires them.

**Layout:** see `docs/SYSTEM_DESIGN.md` §1. Every protected route derives its policy actor from the server-side session.

**Key specs:** `docs/API_CONTRACTS.md`, `docs/MACHINE.md`, `docs/CONSENT_AND_OWNERSHIP.md` §5, `docs/SECURITY_AND_PRIVACY.md`.

## Authorization boundary

The API has one explicit authorization exemption: `POST /v1/auth/challenges`,
`POST /v1/auth/challenges/verify`, and `GET /healthz` are intentionally public
by `docs/API_CONTRACTS.md`. They validate input and apply rate/security controls,
but cannot call `assertCan()` because no authenticated actor exists yet. Every
other route derives an actor from the server-side session and calls `assertCan()`.
