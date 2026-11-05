# packages/shared-types

Dependency-free TypeScript types and constant enums shared across web, api, worker: story/recording/transcript/translation/job/consent states (`docs/MACHINE.md`), consent scopes, roles, flag reason codes, error codes (`docs/API_CONTRACTS.md` §1.3), audit action names (`docs/SECURITY_AND_PRIVACY.md` §8).

Rule: when a value changes here, `docs/MACHINE.md`/`docs/DATA_MODEL.md` and DB CHECK constraints change in the same PR. A unit test asserts the enum lists match the migration CHECK lists.
