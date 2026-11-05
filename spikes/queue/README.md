# M0 queue spike

This throwaway experiment tests OQ-005: whether a Graphile Worker `add_job`
call made through the same PostgreSQL connection as a Drizzle transaction is
atomic with the transaction's commit and rollback.

The test uses a temporary local PostgreSQL database, a synthetic `queue_spike_records`
table, and Graphile Worker's own schema migration. It does not import application
packages or create a worker task.

## Prerequisites

- Node.js 22 or newer
- PostgreSQL server binaries (`initdb`, `pg_ctl`, `createdb`, `dropdb`)
- A PostgreSQL server available through `DATABASE_URL`, or a local server that
  accepts the URL used by the test

Install dependencies and run the assertions:

```sh
npm install
DATABASE_URL=postgres://postgres@127.0.0.1:54329/echoes_queue_spike npm test
```

The test creates the synthetic table, runs the Graphile Worker migration, and
uses a separate observer connection after each transaction. It asserts:

1. commit leaves both the domain row and queue job;
2. rollback leaves neither the domain row nor queue job;
3. the same `job_key` does not create a second queue job (observed in
   Graphile Worker's `graphile_worker.jobs.key` column).

The test prints only identifiers, counts, and outcomes. It does not print story
content, names, consent evidence, or provider credentials.

## Local PostgreSQL example

From the repository root, a temporary cluster can be started outside the repo:

```sh
SPIKE_PG=/tmp/echoes-of-home-queue-pg
LANG=C LC_ALL=C initdb -D "$SPIKE_PG" -A trust
pg_ctl -D "$SPIKE_PG" -o "-p 54329 -h 127.0.0.1" -w start
createdb -h 127.0.0.1 -p 54329 -O user echoes_queue_spike
DATABASE_URL=postgres://user@127.0.0.1:54329/echoes_queue_spike npm test
pg_ctl -D "$SPIKE_PG" -m fast -w stop
```

The cluster is disposable and is not part of the repository.
