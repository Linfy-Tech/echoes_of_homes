import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { authAuditActions, createAuthAuditSink, verifyAuditChain } from '../src/audit-chain.ts';

const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

function assertDisposableUrl(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('Use a loopback disposable echoes_audit_test database only');
  }
  assert.ok(
    ['postgres:', 'postgresql:'].includes(target.protocol)
      && !target.search
      && !target.hash
      && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      && /^\/echoes_audit_test(?:_|$)/.test(target.pathname),
    'Use a loopback disposable echoes_audit_test database only',
  );
}

async function database() {
  if (process.env.POSTGRES_AUDIT_TEST_URL) {
    assertDisposableUrl(process.env.POSTGRES_AUDIT_TEST_URL);
    return {
      connectionString: process.env.POSTGRES_AUDIT_TEST_URL,
      external: true,
      pool: new Pool({ connectionString: process.env.POSTGRES_AUDIT_TEST_URL }),
      stop: async () => {},
    };
  }
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('echoes_audit_test')
    .withUsername('echoes_test')
    .withPassword('synthetic-audit-password')
    .start();
  const connectionString = container.getConnectionUri();
  return { connectionString, external: false, pool: new Pool({ connectionString }), stop: () => container.stop() };
}

async function assertDisposableDatabase(pool) {
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator')")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname !~ '^pg_'")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'")).rows[0].count, 0);
}

async function cleanExternalDatabase(pool) {
  await pool.query('RESET ROLE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP TABLE IF EXISTS audit_events, auth_challenges, idempotency_keys, sessions, users CASCADE');
  const roles = await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator') ORDER BY rolname");
  for (const { rolname } of roles.rows) {
    await pool.query(`DROP OWNED BY ${rolname}`);
    await pool.query(`DROP ROLE ${rolname}`);
  }
}

async function append(pool, sink, mutation) {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await sink(tx, mutation);
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}

test('M1-AC3 audit writer creates a serial HMAC chain and verifier detects tamper, missing links, and reorder', async () => {
  const { connectionString, external, pool, stop } = await database();
  let ownsExternalState = false;
  let appPool;
  try {
    assert.ok(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) >= 160000);
    await assertDisposableDatabase(pool);
    ownsExternalState = external;
    await migrate(drizzle(pool), { migrationsFolder: migrationsDirectory });

    appPool = new Pool({ connectionString, max: 4, options: '-c role=eoh_app' });
    const key = Buffer.alloc(32, 7);
    const userId = '018f3c1e-0000-7000-8000-000000000101';
    const mutations = [
      { model: 'user', operation: 'create', entityId: userId },
      { model: 'user', operation: 'update', entityId: userId },
      { model: 'session', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000102' },
      { model: 'session', operation: 'revoke', entityId: '018f3c1e-0000-7000-8000-000000000102' },
      { model: 'verification', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000103' },
      { model: 'verification', operation: 'consume', entityId: '018f3c1e-0000-7000-8000-000000000103' },
      { model: 'verification', operation: 'revoke', entityId: '018f3c1e-0000-7000-8000-000000000104' },
    ];
    const sink = createAuthAuditSink({
      key,
      context: (mutation) => mutation.model === 'user' && mutation.operation === 'update'
        ? { actorType: 'user', actorUserId: userId, correlationId: 'synthetic-user-update' }
        : { actorType: 'system', correlationId: `synthetic-${mutation.model}-${mutation.operation}` },
    });

    for (const mutation of mutations) await append(appPool, sink, mutation);
    const mapped = await appPool.query('SELECT action,entity_type,metadata,actor_type,actor_user_id FROM audit_events ORDER BY id');
    assert.deepEqual(mapped.rows.map((row) => row.action), Object.values(authAuditActions));
    assert.deepEqual(mapped.rows.map((row) => row.metadata.operation), mutations.map((mutation) => mutation.operation));
    assert.equal(mapped.rows[1].actor_type, 'user');
    assert.equal(mapped.rows[1].actor_user_id, userId);
    assert.ok(mapped.rows.filter((row) => row.actor_type === 'system').every((row) => row.actor_user_id === null));

    const beforeRollback = (await appPool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count;
    const rolledBack = await appPool.connect();
    try {
      await rolledBack.query('BEGIN');
      await sink(rolledBack, { model: 'session', operation: 'revoke', entityId: '018f3c1e-0000-7000-8000-000000000105' });
      await rolledBack.query('ROLLBACK');
    } finally {
      rolledBack.release();
    }
    assert.equal((await appPool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count, beforeRollback);

    const repeatableRead = await appPool.connect();
    try {
      await repeatableRead.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await repeatableRead.query('SELECT 1');
      await assert.rejects(
        sink(repeatableRead, { model: 'session', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000105' }),
        { message: 'Audit writes require READ COMMITTED transactions' },
      );
      await repeatableRead.query('ROLLBACK');
    } finally {
      repeatableRead.release();
    }

    await Promise.all([
      append(appPool, sink, { model: 'session', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000106' }),
      append(appPool, sink, { model: 'session', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000107' }),
    ]);
    const valid = await verifyAuditChain(appPool, key);
    assert.equal(valid.valid, true, JSON.stringify(valid));
    assert.equal(valid.checked, 9);
    assert.ok(valid.headHash?.length === 32);

    const links = (await appPool.query('SELECT prev_hash,hash FROM audit_events ORDER BY id')).rows;
    assert.deepEqual(links[0].prev_hash, Buffer.alloc(32));
    for (let index = 1; index < links.length; index += 1) assert.deepEqual(links[index].prev_hash, links[index - 1].hash);
    assert.equal((await verifyAuditChain(appPool, Buffer.alloc(32, 8))).valid, false);
    await assert.rejects(
      append(appPool, sink, { model: 'session', operation: 'update', entityId: '018f3c1e-0000-7000-8000-000000000108' }),
      { message: 'Unsupported audit mutation' },
    );
    const malformedContext = createAuthAuditSink({
      key,
      context: () => ({ actorType: 'system', correlationId: 123 }),
    });
    const beforeMalformedContext = (await appPool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count;
    await assert.rejects(
      append(appPool, malformedContext, { model: 'session', operation: 'create', entityId: '018f3c1e-0000-7000-8000-000000000108' }),
      { message: 'Invalid audit context' },
    );
    assert.equal((await appPool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count, beforeMalformedContext);

    const admin = await pool.connect();
    try {
      await admin.query('BEGIN');
      await admin.query("UPDATE audit_events SET metadata='{\"operation\":\"tampered\"}'::jsonb WHERE id=3");
      assert.deepEqual(await verifyAuditChain(admin, key), { valid: false, checked: 2, failureId: '3', reason: 'hash_mismatch' });
      await admin.query('ROLLBACK');

      await admin.query('BEGIN');
      await admin.query("UPDATE audit_events SET metadata='{\"n\":1e400}'::jsonb WHERE id=3");
      assert.deepEqual(await verifyAuditChain(admin, key), { valid: false, checked: 2, failureId: '3', reason: 'invalid_row' });
      await admin.query('ROLLBACK');

      await admin.query('BEGIN');
      await admin.query('DELETE FROM audit_events WHERE id=3');
      assert.deepEqual(await verifyAuditChain(admin, key), { valid: false, checked: 2, failureId: '4', reason: 'previous_hash_mismatch' });
      await admin.query('ROLLBACK');

      await admin.query('BEGIN');
      await admin.query('UPDATE audit_events SET id=1000 WHERE id=1');
      assert.deepEqual(await verifyAuditChain(admin, key), { valid: false, checked: 0, failureId: '2', reason: 'genesis_prev_hash' });
      await admin.query('ROLLBACK');
    } finally {
      admin.release();
    }
  } finally {
    await appPool?.end();
    if (ownsExternalState) await cleanExternalDatabase(pool);
    await pool.end();
    await stop();
  }
});
