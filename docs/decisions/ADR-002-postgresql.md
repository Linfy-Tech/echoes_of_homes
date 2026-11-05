# ADR-002: Railway PostgreSQL for structured data; no media blobs in the database

- **Status:** Accepted
- **Date:** 2026-11-04

## Context
We need strong relational integrity (consent, roles, state machines, versioning), transactional job enqueue, append-only audit, and simple operations. Supabase is excluded. Media is large and must be stored elsewhere.

## Decision
- Railway PostgreSQL (latest major version offered by Railway at M1; recorded here when provisioned).
- PostgreSQL holds metadata, ownership, permissions, state, provider identifiers, integrity hashes, transcripts/translations (text), audit events, and the job queue (Graphile Worker schema, ADR-009).
- **No audio or other media blobs in PostgreSQL**; media lives in the media store behind `MediaStorageProvider` (ADR-003).
- Constraints and triggers enforce key invariants (one active consent per story; translation only from approved transcript; immutable approved versions; append-only audit).
- Backups: native daily + weekly volume backups, PITR, plus encrypted offsite `pg_dump` (monthly native backups disabled to bound deletion residual windows) **[S11]**.

## Consequences
- Single primary database is a single point of failure → PITR, offsite dumps, monthly restore drills.
- Wiping the volume deletes native backups **[S11]** → offsite dumps are mandatory.
- Text content in Postgres is protected by access control and storage encryption; application-level encryption for selected sensitive columns.

## Revisit when
Load exceeds single-instance capacity; Railway Postgres features change.
