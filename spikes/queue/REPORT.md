# M0 queue spike report

## OQ-005

**Question:** Is `graphile_worker.add_job` called inside a Drizzle transaction
atomic with the domain transaction, including rollback, and does `job_key`
deduplicate?

**Result for the tested versions:** Yes. The transaction used by Drizzle and
the Graphile Worker SQL function shared the same PostgreSQL transaction
connection. A committed transaction exposed both records; an intentionally
rolled-back transaction exposed neither. Repeating the enqueue with the same
`job_key` left one queue row.

## Evidence

Command, run against a disposable local PostgreSQL 14.20 cluster:

```sh
DATABASE_URL=postgres://user@127.0.0.1:54329/echoes_queue_spike npm test
```

Output:

```text
commit: domain row=1, queue job=1
rollback: domain row=0, queue job=0
job_key dedupe: queue jobs=1
```

The test is `queue-atomicity.test.js`. It uses Drizzle ORM `0.45.4`, Graphile
Worker `0.18.0`, `pg` `8.23.1`, and the Graphile Worker migration supplied by
that package. The domain table and payload use synthetic identifiers only.

## Decision / limitation

**OQ-005 status: Resolved for the tested scope only.** Enqueue through the
transaction-scoped Drizzle executor and use `processing_jobs.id` as the
Graphile `job_key`, subject to the project’s later integration tests and
version-pinning policy. This spike does not implement application enqueue
services, worker tasks, retries, consent gates, or production deployment.

The README setup instructions were corrected after review to match the
successful local run: `initdb -A trust` and the local `user` PostgreSQL role.
