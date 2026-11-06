# ADR-010: Better Auth with email OTP and Postgres sessions

- **Status:** Accepted (founder accepted Better Auth as the library; storage evidence tracked in OQ-039)
- **Date:** 2026-11-05

## Context

The founder resolved OQ-012 in favour of Better Auth, its email-OTP plugin, and server-side sessions in Postgres. This architectural choice requires a new ADR under AGENTS.md §7; no existing Accepted ADR is modified. SECURITY_AND_PRIVACY.md §7 and DATA_MODEL.md §3 remain binding.

## Pre-implementation verification

Better Auth **1.7.17** is permissively [MIT licensed](https://github.com/better-auth/better-auth/blob/v1.7.17/LICENSE.md). Its [Postgres adapter](https://better-auth.com/docs/adapters/postgresql) supports database-backed persistence. A configured auth instance can precede the [Fastify integration](https://better-auth.com/docs/integrations/fastify); no HTTP routes are necessary for configuration or adapter tests.

However, the standard persistence contract does not directly match this project's schema:

| Concern | Better Auth 1.7.17 contract | Binding project contract |
|---|---|---|
| Session credential | String `token`; default creation and lookups pass it through the adapter | Only SHA-256(token ∥ pepper) in `token_hash bytea`; raw credential only in cookie |
| User email | String email and email verification state | Encrypted `email bytea` plus HMAC lookup hash; no `email_verified` column specified |
| OTP persistence | Generic verification identifier/value/expiry; plugin encodes attempt state in its stored value | Structured `auth_challenges` with separate code/link hashes, consumption, attempts, and IP hash |
| Session lifecycle | Refresh options and optional request IP/full user-agent fields | Absolute + idle expiry, `last_seen_at`, `revoked_at`, coarse user-agent summary |

Versioned evidence: [session schema](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/core/src/db/schema/session.ts), [user schema](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/core/src/db/schema/user.ts), [verification schema](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/core/src/db/schema/verification.ts), [session persistence implementation](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/better-auth/src/db/internal-adapter.ts), and [email-OTP implementation](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/better-auth/src/plugins/email-otp/routes.ts).

Model/field renaming alone cannot provide these transformations. Mapping `token` directly to `token_hash` would not implement peppered hashing safely. The [OTP plugin](https://better-auth.com/docs/plugins/email-otp) supports hashed OTP storage, but that setting alone does not implement our structured challenge lifecycle. Better Auth supports [custom database adapters](https://better-auth.com/docs/guides/create-a-db-adapter), so incompatibility of the standard mapping is not proof that integration is impossible.

## Decision recorded / proposal

Record the founder's library selection; defer installation and auth skeleton wiring until OQ-039 is resolved. Recommend the next M1 slice **auth-storage-compatibility**: design and prove a custom Postgres adapter boundary against the existing contracts before the auth-library skeleton. Do not loosen the security requirements or generate replacement tables merely to adopt library defaults. The live email vendor remains OQ-040; local/tests keep fake delivery.

The compatibility slice should prove, using synthetic data and disposable Postgres:

1. Session creation and lookup persist only peppered hashes, with ≥256-bit credentials, no raw credentials in DB/logs/JSON responses, and no credential reconstruction from stored hashes.
2. Email encryption and HMAC lookup work for create, lookup, and update without retaining plaintext copies.
3. OTPs are hashed, six digits, expire after ten minutes, allow at most five attempts, and cannot be consumed twice under concurrency; preserve the separately required sign-in-link flow.
4. Absolute/idle expiry, rotation, immediate revocation/revoke-all, UUIDv7 IDs, transactionally coupled audit writes, and content-free logging remain enforceable. Avoid storing full IP/user-agent values.
5. A route-free factory accepts the verified adapter; later Fastify wiring preserves cookie flags, CSRF, enumeration resistance, and admin MFA. No database schema change is implied by this proposal; any required change must follow AGENTS.md §7 first.

## Consequences

No dependency, migration, route, session primitive, or `can()`/`assertCan()` stub is added in the auth-library slice yet. A dependency-injected placeholder would not prove Postgres compatibility. Once the storage contract is approved and tested, wire the auth factory and fail-closed policy skeleton in packages/auth, with the required two reviewers. The founder accepted the library selection on 2026-11-05; subsequent storage evidence is tracked in OQ-039.
