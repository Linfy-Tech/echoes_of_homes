import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DrizzleWorkflowRepository } from '../src/workflow-repositories.ts';

const url = process.env.POSTGRES_WORKFLOW_TEST_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
const id = () => randomUUID();

test('workflow repository persists jobs, recovers running work, and preserves budget state across repository restart', { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    await runMigrations({ connectionString: url });
    const userId = id();
    const circleId = id();
    const personId = id();
    const storyId = id();
    await pool.query('INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4)', [userId, Buffer.from('workflow@example.invalid'), Buffer.alloc(32, 7), 'Workflow test user']);
    await pool.query('INSERT INTO family_circles (id,name,created_by_user_id) VALUES ($1,$2,$3)', [circleId, 'Workflow test family', userId]);
    await pool.query('INSERT INTO persons (id,display_name,created_by_user_id) VALUES ($1,$2,$3)', [personId, 'Workflow storyteller', userId]);
    await pool.query('INSERT INTO stories (id,family_circle_id,storyteller_person_id,rights_holder_person_id,created_by_user_id) VALUES ($1,$2,$3,$3,$4)', [storyId, circleId, personId, userId]);

    const firstRepository = new DrizzleWorkflowRepository(pool);
    const jobId = id();
    await firstRepository.enqueue({ id: jobId, storyId, type: 'asr.transcribe', inputRef: { recordingId: id(), durationMs: 1000 }, idempotencyKey: `workflow:${jobId}`, correlationId: 'workflow-test' });
    assert.equal((await firstRepository.job(jobId)).status, 'queued');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM graphile_worker.jobs WHERE key=$1', [jobId])).rows[0].count, 1);

    await pool.query("UPDATE processing_jobs SET status='running' WHERE id=$1", [jobId]);
    const restartedRepository = new DrizzleWorkflowRepository(pool);
    assert.equal(await restartedRepository.recoverInFlightJobs(), 1);
    assert.equal((await restartedRepository.job(jobId)).status, 'queued');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM graphile_worker.jobs WHERE key=$1', [jobId])).rows[0].count, 1, 'recovery is job-key idempotent');

    assert.equal(await firstRepository.transaction((client) => firstRepository.reserveUsage(client, 'fake', 5, 5)), true);
    assert.equal(await restartedRepository.usage('fake'), 5);
    assert.equal(await restartedRepository.transaction((client) => restartedRepository.reserveUsage(client, 'fake', 1, 5)), false, 'a new repository instance observes the exhausted budget');
    assert.equal(await restartedRepository.usage('fake'), 5);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS graphile_worker CASCADE').catch(() => {});
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE').catch(() => {});
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.end();
  }
});
