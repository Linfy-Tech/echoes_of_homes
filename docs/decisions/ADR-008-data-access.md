# ADR-008: Drizzle ORM with reviewed SQL migrations

- **Status:** Proposed
- **Date:** 2026-11-04

## Context
The data model relies on PostgreSQL features: CHECK constraints, partial unique indexes, triggers (immutability, translation guard), privileges (append-only audit), and transactional calls to `graphile_worker.add_job` (ADR-009).

## Options
| | Drizzle ORM | Prisma |
|---|---|---|
| Style | SQL-like TypeScript query builder; schema in TS | Schema DSL + generated client |
| Migrations | drizzle-kit generates SQL; easy to hand-edit | Prisma Migrate generates SQL; hand-edits supported but less central |
| Advanced Postgres (partial indexes, triggers, checks) | Expressible or via raw SQL in migrations | Partially in schema; triggers/raw via SQL migrations |
| Raw SQL inside transactions | Natural (`sql` template) | Supported (`$queryRaw`) |
| Runtime | Thin, no separate engine | Client generation step; engine architecture has changed across versions (verify current) |

## Decision
Drizzle ORM + drizzle-kit. Migrations are committed SQL, reviewed by a human, forward-only. Triggers/privileges/partial indexes are written explicitly in SQL migrations. Repositories wrap queries; domain services own transactions.

## Consequences
Closer to SQL (good for our constraint-heavy model, more care needed); less "magic" for AI assistants to misuse. Version specifics verified in M1.

## Revisit when
Migration tooling proves unreliable for our patterns.
