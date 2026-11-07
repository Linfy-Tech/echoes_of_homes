import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { M2FoundationService } from '../../../apps/api/src/m2-foundation.ts';
import { createDrizzleM2Repository } from '../src/m2-repository.ts';
import { can } from '@echoes-of-home/auth/policy';

const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));
const userId = '018f3c1e-0000-7000-8000-000000000201';
const secondUserId = '018f3c1e-0000-7000-8000-000000000202';

function assertDisposableUrl(value) {
  const target = new URL(value);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(target.pathname, /^\/echoes_m2_test(?:_|$)/);
  assert.equal(target.search, '');
}

async function database() {
  if (process.env.POSTGRES_M2_TEST_URL) {
    assertDisposableUrl(process.env.POSTGRES_M2_TEST_URL);
    return { pool: new Pool({ connectionString: process.env.POSTGRES_M2_TEST_URL }), stop: async () => {} };
  }
  if (process.env.POSTGRES_TEST_BIN) {
    const location = mkdtempSync(join(tmpdir(), 'echoes-m2-repository-'));
    execFileSync(join(process.env.POSTGRES_TEST_BIN, 'initdb'), ['-D', join(location, 'data'), '-U', 'echoes_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
    execFileSync(join(process.env.POSTGRES_TEST_BIN, 'pg_ctl'), ['-D', join(location, 'data'), '-l', join(location, 'postgres.log'), '-o', `-h '' -k ${location} -p 55442`, '-w', 'start'], { stdio: 'ignore' });
    return { pool: new Pool({ host: location, port: 55442, database: 'postgres', user: 'echoes_test' }), stop: async () => { execFileSync(join(process.env.POSTGRES_TEST_BIN, 'pg_ctl'), ['-D', join(location, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' }); rmSync(location, { recursive: true, force: true }); } };
  }
  const container = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('echoes_m2_test').withUsername('echoes_test').withPassword('synthetic-m2-password').start();
  return { pool: new Pool({ connectionString: container.getConnectionUri() }), stop: () => container.stop() };
}

test('M2 Drizzle repository preserves policy context, DB constraints, and audit atomicity', async () => {
  const databaseState = await database();
  const { pool } = databaseState;
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsDirectory });
    await pool.query("INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)", [userId, Buffer.from('ciphertext'), randomBytes(32), 'Synthetic user', secondUserId, Buffer.from('ciphertext-2'), randomBytes(32), 'Synthetic member']);
    await pool.query("INSERT INTO consent_scripts (id,language,version,content_hash,content) VALUES ($1,'en','1.0.0',$2,'{}'::jsonb)", [randomUUID(), randomBytes(32)]);
    const scriptId = (await pool.query("SELECT id FROM consent_scripts WHERE version='1.0.0'")).rows[0].id;
    const repository = createDrizzleM2Repository(pool, randomBytes(32), randomBytes(32));
    const foundation = new M2FoundationService({ repository });
    const family = await foundation.createFamily(userId, 'Synthetic family');
    const person = await foundation.createPerson(userId, { displayName: 'Synthetic storyteller', preferredLanguage: 'en' });
    await foundation.linkPerson(person.id, userId);
    await foundation.addMembership({ id: randomUUID(), familyCircleId: family.id, userId: secondUserId, circleRole: 'family_member' });
    const story = await foundation.createStory(userId, { familyCircleId: family.id, storytellerPersonId: person.id });
    const context = await foundation.storyResource(secondUserId, story.id);
    assert.equal(context.storytellerUserId, userId);
    assert.equal(context.rightsHolderUserId, userId);
    assert.equal(context.actorCircleRole, 'family_member');
    assert.equal(context.actorStoryRoles.length, 0);
    assert.equal((await foundation.circleRole(secondUserId, family.id)), 'family_member');
    const policyBase = { ...context, deletionRequesterUserId: null, hasApprovedVersion: false, translationApproved: false, activeConsentScopes: new Set(), hasValidBreakGlassGrant: false, assistedConsentSessionOpen: false, custodianAssistedConfirmationCurrent: false, firstStoryVersionApproved: false, adminReadOnlyProjection: false, adminDeletionApproved: false };
    assert.equal(can({ userId: secondUserId, accountRole: 'member', status: 'active', secondFactorVerified: false }, 'family.invite', policyBase), false);
    assert.equal(can({ userId: secondUserId, accountRole: 'member', status: 'active', secondFactorVerified: false }, 'story.read', policyBase), false);
    const adminContext = await foundation.storyResource(userId, story.id);
    assert.equal(can({ userId, accountRole: 'member', status: 'active', secondFactorVerified: false }, 'story.read', { ...policyBase, ...adminContext }), true);
    const consent = await repository.recordConsent(story.id, { method: 'self_digital', evidenceMediaAssetId: null, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true }, scriptVersion: '1.0.0' }, userId);
    assert.equal(consent.storyId, story.id);
    await assert.rejects(
      repository.recordConsent(story.id, { method: 'self_digital', evidenceMediaAssetId: null, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: {}, scriptVersion: '1.0.0' }, userId),
      (error) => /duplicate|unique/.test(`${error.message} ${error.cause?.message ?? ''}`),
    );
    const storyBefore = (await pool.query('SELECT count(*)::int AS count FROM stories')).rows[0].count;
    const auditBefore = (await pool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count;
    await assert.rejects(
      repository.recordConsent(story.id, { method: 'assisted_verbal', evidenceMediaAssetId: null, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true }, scriptVersion: '1.0.0' }, userId),
      (error) => /consent_records_assisted_evidence_required|duplicate|unique/.test(`${error.message} ${error.cause?.message ?? ''}`),
    );
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count, auditBefore);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM stories')).rows[0].count, storyBefore);
    const rollbackPerson = await foundation.createPerson(userId, { displayName: 'Rollback storyteller', preferredLanguage: 'en' });
    const rollbackStory = await foundation.createStory(userId, { familyCircleId: family.id, storytellerPersonId: rollbackPerson.id });
    const consentBeforeRollback = (await pool.query('SELECT count(*)::int AS count FROM consent_records')).rows[0].count;
    const auditBeforeRollback = (await pool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count;
    await assert.rejects(
      repository.recordConsent(rollbackStory.id, { method: 'self_digital', evidenceMediaAssetId: null, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { invalid_scope: true }, scriptVersion: '1.0.0' }, userId),
      (error) => /consent_scope_allowed/.test(`${error.message} ${error.cause?.message ?? ''}`),
    );
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM consent_records')).rows[0].count, consentBeforeRollback, 'consent insert rolled back');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count, auditBeforeRollback, 'audit insert rolled back with consent');
    assert.ok(scriptId);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE').catch(() => {});
    await pool.query('DROP TABLE IF EXISTS audit_events, auth_challenges, idempotency_keys, sessions, users, consent_records, consent_scope_grants, consent_scripts, custodian_designations, family_circles, family_memberships, invitations, persons, stories, story_roles CASCADE').catch(() => {});
    await pool.end();
    await databaseState.stop();
  }
});
