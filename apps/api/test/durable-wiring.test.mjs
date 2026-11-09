import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { buildServer } from '../src/server.ts';
import { M2FoundationService } from '../src/m2-foundation.ts';
import { createDrizzleM2Repository } from '@echoes-of-home/database/m2-repository';
import { DrizzleWorkflowRepository } from '@echoes-of-home/database/workflow-repositories';
import { runMigrations } from 'graphile-worker';

const databaseUrl = process.env.POSTGRES_DURABLE_TEST_URL;

test('API family/story/consent writes are readable from Postgres through the durable path', { skip: !databaseUrl }, async (t) => {
  const pool = new Pool({ connectionString: databaseUrl });
  await runMigrations({ connectionString: databaseUrl });
  const userId = randomUUID();
  const token = `durable-${randomUUID()}`;
  const scriptId = randomUUID();
  const email = `durable-${userId}@example.invalid`;
  const auth = {
    async requestOtp() { return { challengeId: randomUUID(), expiresInSeconds: 600 }; },
    async verifyOtp() { throw new Error('not_used'); },
    async getSession(value) { return value === token ? { id: randomUUID(), userId, email, expiresAt: new Date(Date.now() + 86_400_000) } : null; },
    async listSessions() { return []; }, async revokeSession() {}, async revokeAll() {},
  };
  const auditKey = Buffer.alloc(32, 7); const fieldKey = Buffer.alloc(32, 8);
  const emailHash = createHash('sha256').update(email).digest();
  await pool.query(`INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,'Durable test user')`, [userId, Buffer.from(email), emailHash]);
  await pool.query(`INSERT INTO consent_scripts (id,language,version,content_hash,content) VALUES ($1,'en','0.0.0-placeholder',$2,'{}'::jsonb) ON CONFLICT (language,version) DO NOTHING`, [scriptId, createHash('sha256').update('placeholder').digest()]);
  const foundation = new M2FoundationService({ repository: createDrizzleM2Repository(pool, auditKey, fieldKey), allowPlaceholderConsent: true });
  const workflowRepository = new DrizzleWorkflowRepository(pool);
  const app = buildServer({ auth, foundation, workflowRepository, allowedOrigins: ['http://localhost:3000'] });
  await app.ready();
  t.after(async () => {
    await app.close();
    await pool.query(`DELETE FROM consent_scope_grants WHERE consent_record_id IN (SELECT id FROM consent_records WHERE operated_by_user_id=$1)`, [userId]);
    await pool.query(`DELETE FROM consent_records WHERE operated_by_user_id=$1`, [userId]);
    await pool.query(`DELETE FROM story_roles WHERE user_id=$1 OR granted_by_user_id=$1`, [userId]);
    await pool.query(`DELETE FROM stories WHERE created_by_user_id=$1`, [userId]);
    await pool.query(`DELETE FROM persons WHERE created_by_user_id=$1`, [userId]);
    await pool.query(`DELETE FROM family_memberships WHERE user_id=$1`, [userId]);
    await pool.query(`DELETE FROM family_circles WHERE created_by_user_id=$1`, [userId]);
    await pool.query(`DELETE FROM audit_events WHERE actor_user_id=$1`, [userId]);
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    await pool.end();
  });
  const headers = { cookie: `eoh_session=${token}`, origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' };
  const family = await app.inject({ method: 'POST', url: '/v1/families', headers, payload: { name: 'Durable family' } });
  assert.equal(family.statusCode, 201, family.body);
  const person = await app.inject({ method: 'POST', url: '/v1/persons', headers, payload: { displayName: 'Durable storyteller', preferredLanguage: 'en' } });
  assert.equal(person.statusCode, 201);
  await foundation.linkPerson(person.json().id, userId);
  const story = await app.inject({ method: 'POST', url: '/v1/stories', headers, payload: { familyCircleId: family.json().id, storytellerPersonId: person.json().id } });
  assert.equal(story.statusCode, 201);
  const consent = await app.inject({ method: 'POST', url: `/v1/stories/${story.json().id}/consent`, headers, payload: { method: 'self_digital', evidenceMediaAssetId: null, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true, cross_border_processing: true } } });
  assert.equal(consent.statusCode, 201, consent.body);
  const row = await pool.query(`SELECT f.id AS family_id,s.id AS story_id,c.id AS consent_id FROM family_circles f JOIN stories s ON s.family_circle_id=f.id JOIN consent_records c ON c.story_id=s.id WHERE f.id=$1`, [family.json().id]);
  assert.deepEqual(row.rows[0], { family_id: family.json().id, story_id: story.json().id, consent_id: consent.json().id });
  const audio = Buffer.from('x');
  const recording = await app.inject({ method: 'POST', url: `/v1/stories/${story.json().id}/recordings`, headers, payload: { source: 'browser_recording', purpose: 'story', sha256: createHash('sha256').update(audio).digest('hex'), sizeBytes: audio.length, mimeType: 'audio/webm' } });
  assert.equal(recording.statusCode, 201, recording.body);
  const recordingId = recording.json().recordingId;
  const uploaded = await app.inject({ method: 'POST', url: `/v1/recordings/${recordingId}/chunks`, headers: { ...headers, 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-0/1' }, payload: audio });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const completed = await app.inject({ method: 'POST', url: `/v1/recordings/${recordingId}/complete`, headers });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.ok(completed.json().jobId);
  const durableMedia = await pool.query(`SELECT r.status AS recording_status,m.status AS asset_status,p.type AS job_type FROM recordings r JOIN media_assets m ON m.recording_id=r.id JOIN processing_jobs p ON p.id=$2 WHERE r.id=$1`, [recordingId, completed.json().jobId]);
  assert.deepEqual(durableMedia.rows[0], { recording_status: 'uploaded', asset_status: 'available', job_type: 'asr.transcribe' });
});
