# packages/auth

Sessions and the **deterministic authorisation policy** (`docs/SYSTEM_DESIGN.md` §2).

- `can(actor, action, resourceCtx)` / `assertCan(...)` — pure, table-driven from `docs/CONSENT_AND_OWNERSHIP.md` §5; fail closed.
- `loadResourceCtx(tx, actor, ref)` — loads roles, membership, story state, audience, active consent scopes, break-glass; no cross-request caching.
- `consentGate(tx, storyId, scopes)` — used by domain services and the worker wrapper.
- Session token generation/hash/verify; sign-in challenge codes.
- Exhaustive matrix tests: every action × role × relevant state.

Changes here require two reviewers and a matching spec update.
