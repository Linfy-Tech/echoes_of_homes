const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql } = require('drizzle-orm');
const { makeWorkerUtils } = require('graphile-worker');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const db = drizzle(pool);

async function queryCount(table, column, value) {
  const result = await pool.query(`select count(*)::int as count from ${table} where ${column} = $1`, [value]);
  return result.rows[0].count;
}

async function queryJobCount(jobKey) {
  return queryCount('graphile_worker.jobs', 'key', jobKey);
}

async function enqueueRecord(recordId, jobKey, shouldRollback) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into queue_spike_records (id, marker)
        values (${recordId}, ${'synthetic-' + recordId})
      `);
      await tx.execute(sql`
        select graphile_worker.add_job(
          ${'queue-spike.atomicity'},
          ${JSON.stringify({ recordId })}::json,
          job_key := ${jobKey}
        )
      `);
      if (shouldRollback) {
        throw new Error('intentional-spike-rollback');
      }
    });
  } catch (error) {
    if (!shouldRollback || error.message !== 'intentional-spike-rollback') {
      throw error;
    }
  }
}

async function main() {
  const workerUtils = await makeWorkerUtils({ connectionString: databaseUrl });
  await workerUtils.migrate();
  await pool.query('drop table if exists queue_spike_records');
  await pool.query(`
    create table queue_spike_records (
      id uuid primary key,
      marker text not null
    )
  `);

  const committedRecordId = crypto.randomUUID();
  const committedJobKey = 'queue-spike-commit-' + committedRecordId;
  await enqueueRecord(committedRecordId, committedJobKey, false);
  assert.equal(await queryCount('queue_spike_records', 'id', committedRecordId), 1);
  assert.equal(await queryJobCount(committedJobKey), 1);
  console.log('commit: domain row=1, queue job=1');

  const rolledBackRecordId = crypto.randomUUID();
  const rolledBackJobKey = 'queue-spike-rollback-' + rolledBackRecordId;
  await enqueueRecord(rolledBackRecordId, rolledBackJobKey, true);
  assert.equal(await queryCount('queue_spike_records', 'id', rolledBackRecordId), 0);
  assert.equal(await queryJobCount(rolledBackJobKey), 0);
  console.log('rollback: domain row=0, queue job=0');

  const dedupeRecordId = crypto.randomUUID();
  const dedupeJobKey = 'queue-spike-dedupe-' + dedupeRecordId;
  await enqueueRecord(dedupeRecordId, dedupeJobKey, false);
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      select graphile_worker.add_job(
        ${'queue-spike.atomicity'},
        ${JSON.stringify({ recordId: dedupeRecordId })}::json,
        job_key := ${dedupeJobKey}
      )
    `);
  });
  assert.equal(await queryJobCount(dedupeJobKey), 1);
  console.log('job_key dedupe: queue jobs=1');

  await pool.query('drop table queue_spike_records');
  await workerUtils.release();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
});
