# ADR-009: Graphile Worker on PostgreSQL + domain `processing_jobs` table

- **Status:** Proposed (pending M0 spike, OQ-005)
- **Date:** 2026-11-04

## Context
Processing must be durable (no in-memory background tasks), idempotent, cancellable when consent is withdrawn, and atomic with state changes. We want to avoid adding Redis.

## Options
1. BullMQ (Redis) — mature; adds a stateful service; enqueue not atomic with Postgres transactions (needs outbox).
2. pg-boss (Postgres) — Postgres-backed queue; transactional enqueue requires passing the transaction's executor (verify).
3. **Graphile Worker (Postgres)** — jobs added via the SQL function `graphile_worker.add_job(identifier, payload, queue_name, run_at, max_attempts, job_key, priority, flags, job_key_mode)`; `job_key` supports dedupe/replace; default `max_attempts` 25 **[S24]**.
4. Custom table + `SKIP LOCKED` — full control; reinventing retries/scheduling.

## Decision
Graphile Worker as the execution queue; enqueue by calling `add_job` inside the domain transaction (atomicity to be proven by the M0 spike). A domain table `processing_jobs` is the user/admin-visible record of work (status, attempts, error codes, correlation), with `job_key = processing_jobs.id`. Retry limits set per job type (not the default 25).

## Consequences
One less service; transactional enqueue; queue load shares the primary database (acceptable at pilot scale). If the spike fails, fall back to option 2 with the same `processing_jobs` design, or a transactional outbox.

## Revisit when
Throughput or DB load requires a dedicated queue.
