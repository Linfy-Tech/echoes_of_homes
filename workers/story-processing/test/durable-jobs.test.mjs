import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { DrizzleWorkflowRepository } from '@echoes-of-home/database/workflow-repositories';
import { FakeAsrProvider } from '@echoes-of-home/ai-providers/asr';
import { FakeMediaStorageProvider, sha256Hex } from '@echoes-of-home/media-storage';
import { runDurableAsrJob } from '../src/durable-jobs.ts';

const url = process.env.POSTGRES_WORKFLOW_TEST_URL;
const migrationsFolder = fileURLToPath(new URL('../../../packages/database/drizzle/', import.meta.url));
const id = () => randomUUID();

test('durable ASR budget remains open across worker restart and blocks provider calls', { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    await runMigrations({ connectionString: url });
    const userId = id(); const circleId = id(); const personId = id(); const storyId = id();
    await pool.query('INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4)', [userId, Buffer.from('budget@example.invalid'), Buffer.alloc(32, 9), 'Budget test user']);
    await pool.query('INSERT INTO family_circles (id,name,created_by_user_id) VALUES ($1,$2,$3)', [circleId, 'Budget test family', userId]);
    await pool.query('INSERT INTO persons (id,display_name,created_by_user_id) VALUES ($1,$2,$3)', [personId, 'Budget storyteller', userId]);
    await pool.query('INSERT INTO stories (id,family_circle_id,storyteller_person_id,rights_holder_person_id,created_by_user_id) VALUES ($1,$2,$3,$3,$4)', [storyId, circleId, personId, userId]);

    const media = new FakeMediaStorageProvider();
    const bytes = Buffer.from('synthetic audio bytes');
    const assetId = id(); const upload = await media.createUploadSession({ assetId, role: 'original', mimeType: 'audio/wav', sizeBytes: bytes.length, derivatives: [] });
    await media.uploadChunk(upload.uploadId, bytes, { start: 0, end: bytes.length - 1, total: bytes.length });
    const recordingId = id();
    await pool.query("INSERT INTO recordings (id,story_id,status,source,declared_sha256,declared_size_bytes,declared_mime,duration_ms,upload_expires_at) VALUES ($1,$2,'verified','browser_recording',$3,$4,'audio/wav',1000,now()+interval '1 hour')", [recordingId, storyId, Buffer.from(sha256Hex(bytes), 'hex'), bytes.length]);
    await pool.query("INSERT INTO media_assets (id,story_id,recording_id,role,provider,provider_public_id,provider_resource_type,provider_delivery_type,sha256,size_bytes,status) VALUES ($1,$2,$3,'original','fake',$4,'video','authenticated',$5,$6,'available')", [assetId, storyId, recordingId, upload.publicId, Buffer.from(sha256Hex(bytes), 'hex'), bytes.length]);

    const processingJobId = id();
    const firstRepository = new DrizzleWorkflowRepository(pool);
    await firstRepository.enqueue({ id: processingJobId, storyId, type: 'asr.transcribe', inputRef: { recordingId, durationMs: 1000 }, idempotencyKey: `budget:${processingJobId}`, correlationId: 'budget-test' });
    const firstProvider = new FakeAsrProvider();
    assert.equal(await runDurableAsrJob({ repo: firstRepository, processingJobId, provider: firstProvider, mediaProvider: media, consentGate: async () => true, dailyBudgetMicros: 0, callCostMicros: 1 }), 'waiting_budget');
    assert.equal(firstProvider.calls, 0);

    await pool.query("UPDATE processing_jobs SET status='queued' WHERE id=$1", [processingJobId]);
    const restartedRepository = new DrizzleWorkflowRepository(pool);
    const restartedProvider = new FakeAsrProvider();
    assert.equal(await runDurableAsrJob({ repo: restartedRepository, processingJobId, provider: restartedProvider, mediaProvider: media, consentGate: async () => true, dailyBudgetMicros: 0, callCostMicros: 1 }), 'waiting_budget');
    assert.equal(restartedProvider.calls, 0, 'a fresh worker instance cannot call the provider after budget exhaustion');
    assert.equal(await restartedRepository.usage('fake'), 0);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS graphile_worker CASCADE').catch(() => {});
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE').catch(() => {});
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.end();
  }
});
