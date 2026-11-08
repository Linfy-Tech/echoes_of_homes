import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { credentials } from '@echoes-of-home/auth/credentials';
import { postgresAdapter } from '@echoes-of-home/auth/postgres-adapter';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const migrationsDirectory = new URL('../drizzle/', import.meta.url);

function migrationSql() {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFileSync(new URL(entry.name, migrationsDirectory), 'utf8'))
    .join('\n');
}

function assertDisposableUrl(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('Use a loopback disposable echoes_migrations_test database only');
  }
  assert.ok(
    ['postgres:', 'postgresql:'].includes(target.protocol)
      && !target.search
      && !target.hash
      && !target.hostname.includes(',')
      &&
    ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      && /^\/echoes_migrations_test(?:_|$)/.test(target.pathname),
    'Use a loopback disposable echoes_migrations_test database only',
  );
}

async function database() {
  if (process.env.POSTGRES_MIGRATION_TEST_URL) {
    assertDisposableUrl(process.env.POSTGRES_MIGRATION_TEST_URL);
    return {
      connectionString: process.env.POSTGRES_MIGRATION_TEST_URL,
      external: true,
      pool: new Pool({ connectionString: process.env.POSTGRES_MIGRATION_TEST_URL }),
      stop: async () => {},
    };
  }
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('echoes_migrations_test')
    .withUsername('echoes_test')
    .withPassword('synthetic-migration-password')
    .start();
  return {
    connectionString: container.getConnectionUri(),
    external: false,
    pool: new Pool({ connectionString: container.getConnectionUri() }),
    stop: () => container.stop(),
  };
}

async function cleanExternalDatabase(pool) {
  await pool.query('RESET ROLE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP TABLE IF EXISTS audit_events, auth_challenges, idempotency_keys, sessions, users, consent_records, consent_scope_grants, consent_scripts, custodian_designations, family_circles, family_memberships, invitations, persons, stories, story_roles, recordings, media_assets, processing_jobs, webhook_receipts, transcripts, transcript_segments, uncertainty_flags, model_runs, job_step_results, ai_usage_daily, transcript_revisions, family_glossary_terms, notifications, translations, translation_segments, verification_reports, verification_issues CASCADE');
  const roles = await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator') ORDER BY rolname");
  for (const { rolname } of roles.rows) {
    await pool.query(`DROP OWNED BY ${rolname}`);
    await pool.query(`DROP ROLE ${rolname}`);
  }
}

async function publicTables(pool) {
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  return result.rows.map((row) => row.table_name);
}

async function columnTypes(pool, table) {
  const result = await pool.query(
    "SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table],
  );
  return Object.fromEntries(result.rows.map((row) => [row.column_name, row.udt_name]));
}

test('migration config rejects malformed connection strings without exposing their value', async () => {
  const original = process.env.DATABASE_URL;
  const sentinel = 'malformed-secret-sentinel';
  process.env.DATABASE_URL = sentinel;
  try {
    await assert.rejects(
      import('../drizzle.config.ts'),
      (error) => error instanceof Error
        && error.message === 'DATABASE_URL must use the PostgreSQL connection-string format'
        && !JSON.stringify(error).includes(sentinel),
    );
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});

test('external migration target rejects protocol and query-string host overrides', () => {
  assert.throws(() => assertDisposableUrl('mysql://synthetic@localhost/echoes_migrations_test'));
  assert.throws(() => assertDisposableUrl('postgresql://synthetic@localhost/echoes_migrations_test?host=remote.example.invalid'));
  const sentinel = 'malformed-url-secret-sentinel';
  assert.throws(
    () => assertDisposableUrl(sentinel),
    (error) => error instanceof Error && !JSON.stringify(error).includes(sentinel),
  );
});

test('M1 drizzle migration applies, rolls back transactionally, and enforces roles and constraints', async () => {
  const { connectionString, external, pool, stop } = await database();
  let ownsExternalState = false;
  try {
    assert.ok(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) >= 140000);
    assert.deepEqual(await publicTables(pool), []);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator')")).rows[0].count, 0, 'Migration test requires a disposable cluster without Echoes roles');
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname !~ '^pg_' ")).rows[0].count, 0, 'Migration test requires a disposable database without user schemas');
    ownsExternalState = external;

    const rollbackClient = await pool.connect();
    try {
      await rollbackClient.query('BEGIN');
      await rollbackClient.query(migrationSql());
    assert.deepEqual(await publicTables(rollbackClient), ['ai_usage_daily', 'audit_events', 'auth_challenges', 'consent_records', 'consent_scope_grants', 'consent_scripts', 'custodian_designations', 'family_circles', 'family_glossary_terms', 'family_memberships', 'idempotency_keys', 'invitations', 'job_step_results', 'media_assets', 'model_runs', 'notifications', 'persons', 'processing_jobs', 'recordings', 'sessions', 'stories', 'story_roles', 'transcript_revisions', 'transcript_segments', 'transcripts', 'translation_segments', 'translations', 'uncertainty_flags', 'users', 'verification_issues', 'verification_reports', 'webhook_receipts']);
    } finally {
      await rollbackClient.query('ROLLBACK');
      rollbackClient.release();
    }
    assert.deepEqual(await publicTables(pool), []);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator')")).rows[0].count, 0);

    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(migrationsDirectory) });
    assert.deepEqual(await publicTables(pool), ['ai_usage_daily', 'audit_events', 'auth_challenges', 'consent_records', 'consent_scope_grants', 'consent_scripts', 'custodian_designations', 'family_circles', 'family_glossary_terms', 'family_memberships', 'idempotency_keys', 'invitations', 'job_step_results', 'media_assets', 'model_runs', 'notifications', 'persons', 'processing_jobs', 'recordings', 'sessions', 'stories', 'story_roles', 'transcript_revisions', 'transcript_segments', 'transcripts', 'translation_segments', 'translations', 'uncertainty_flags', 'users', 'verification_issues', 'verification_reports', 'webhook_receipts']);
    const constraintClient = await pool.connect();
    try {
      await constraintClient.query('SET ROLE eoh_app');
      await assert.rejects(
        constraintClient.query("INSERT INTO consent_scripts (id,language,version,content_hash,content,approved_by,published_at) VALUES ($1,'en','0.0.0-placeholder',$2,'{}'::jsonb,'reviewer',now())", ['018f3c1e-0000-7000-8000-000000000011', Buffer.alloc(32)]),
        /consent_scripts_placeholder_unpublished/,
        'placeholder scripts must not be approved or published at the DB layer',
      );
      await constraintClient.query('RESET ROLE');
      const dbGateUser = '018f3c1e-0000-7000-8000-000000000101';
      const dbGateCircle = '018f3c1e-0000-7000-8000-000000000102';
      const dbGatePerson = '018f3c1e-0000-7000-8000-000000000103';
      const dbGateStory = '018f3c1e-0000-7000-8000-000000000104';
      const dbGateJob = '018f3c1e-0000-7000-8000-000000000105';
      const dbGateTranscript = '018f3c1e-0000-7000-8000-000000000106';
      const dbGateTranslation = '018f3c1e-0000-7000-8000-000000000107';
      await constraintClient.query(
        "INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,'DB gate user')",
        [dbGateUser, Buffer.from('db-gate@example.invalid'), Buffer.alloc(32, 101)],
      );
      await constraintClient.query(
        "INSERT INTO family_circles (id,name,created_by_user_id) VALUES ($1,'DB gate circle',$2)",
        [dbGateCircle, dbGateUser],
      );
      await constraintClient.query(
        "INSERT INTO persons (id,display_name,created_by_user_id) VALUES ($1,$2,$3)",
        [dbGatePerson, Buffer.from('DB gate storyteller'), dbGateUser],
      );
      await constraintClient.query(
        "INSERT INTO stories (id,family_circle_id,storyteller_person_id,rights_holder_person_id,created_by_user_id) VALUES ($1,$2,$3,$3,$4)",
        [dbGateStory, dbGateCircle, dbGatePerson, dbGateUser],
      );
      await constraintClient.query(
        "INSERT INTO processing_jobs (id,story_id,type,input_ref,correlation_id,idempotency_key) VALUES ($1,$2,'asr',$3,'db-gate-correlation','db-gate-idempotency')",
        [dbGateJob, dbGateStory, {}],
      );
      await constraintClient.query(
        "INSERT INTO transcripts (id,story_id,version_number,status,asr_processing_job_id) VALUES ($1,$2,1,'machine_draft',$3)",
        [dbGateTranscript, dbGateStory, dbGateJob],
      );
      await constraintClient.query('SET ROLE eoh_app');
      await assert.rejects(
        constraintClient.query(
          "INSERT INTO translations (id,story_id,source_transcript_id) VALUES ($1,$2,$3)",
          [dbGateTranslation, dbGateStory, dbGateTranscript],
        ),
        /translation_source_not_approved/,
        'the DB must reject translation rows sourced from an unapproved transcript',
      );
      await constraintClient.query("UPDATE transcripts SET status='approved_for_translation' WHERE id=$1", [dbGateTranscript]);
      await constraintClient.query(
        "INSERT INTO translations (id,story_id,source_transcript_id) VALUES ($1,$2,$3)",
        [dbGateTranslation, dbGateStory, dbGateTranscript],
      );
      await constraintClient.query('RESET ROLE');
    } finally {
      constraintClient.release();
    }
    const migrator = await pool.connect();
    try {
      await migrator.query('SET ROLE eoh_migrator');
      await migrate(drizzle(migrator), { migrationsFolder: fileURLToPath(migrationsDirectory) });
    assert.equal((await migrator.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).rows[0].count, 7);
      await migrator.query('RESET ROLE');
    } finally {
      migrator.release();
    }

    assert.deepEqual(await columnTypes(pool, 'users'), {
      id: 'uuid', email: 'bytea', email_lookup_hash: 'bytea', display_name: 'text', ui_language: 'text',
      account_role: 'text', status: 'text', created_at: 'timestamptz', updated_at: 'timestamptz', version: 'int4',
    });
    assert.deepEqual(await columnTypes(pool, 'sessions'), {
      id: 'uuid', user_id: 'uuid', token_hash: 'bytea', created_at: 'timestamptz', last_seen_at: 'timestamptz',
      expires_at: 'timestamptz', revoked_at: 'timestamptz', user_agent_summary: 'text',
    });
    assert.deepEqual(await columnTypes(pool, 'auth_challenges'), {
      id: 'uuid', email_lookup_hash: 'bytea', code_hash: 'bytea', link_token_hash: 'bytea', expires_at: 'timestamptz',
      consumed_at: 'timestamptz', attempts: 'int4', created_ip_hash: 'bytea', created_at: 'timestamptz',
    });

    const roles = await pool.query("SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname IN ('eoh_app','eoh_migrator') ORDER BY rolname");
    assert.deepEqual(roles.rows, [
      { rolname: 'eoh_app', rolcanlogin: true, rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
      { rolname: 'eoh_migrator', rolcanlogin: true, rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
    ]);
    assert.equal((await pool.query("SELECT has_table_privilege('eoh_app','users','UPDATE') AS allowed")).rows[0].allowed, true);
    assert.equal((await pool.query("SELECT has_table_privilege('eoh_app','audit_events','INSERT') AS allowed")).rows[0].allowed, true);
    assert.equal((await pool.query("SELECT has_table_privilege('eoh_app','audit_events','UPDATE') AS allowed")).rows[0].allowed, false);
    assert.equal((await pool.query("SELECT has_table_privilege('eoh_app','audit_events','DELETE') AS allowed")).rows[0].allowed, false);
    assert.equal((await pool.query("SELECT has_database_privilege('eoh_migrator',current_database(),'CREATE') AS allowed")).rows[0].allowed, true);
    assert.equal((await pool.query("SELECT has_database_privilege('eoh_app',current_database(),'CREATE') AS allowed")).rows[0].allowed, false);

    const keys = { pepper: randomBytes(32), lookup: randomBytes(32), encryption: { k1: randomBytes(32) }, currentKeyId: 'k1' };
    const crypto = credentials(keys);
    const appPool = new Pool({ connectionString, max: 1, options: '-c role=eoh_app' });
    let auditSequence = 0;
    const audit = async (tx, event) => {
      auditSequence += 1;
      await tx.query(
        "INSERT INTO audit_events (actor_type,action,entity_type,entity_id,metadata,correlation_id,prev_hash,hash) VALUES ('system','auth.sign_in',$1,$2,$3,'synthetic-auth-contract',$4,$5)",
        [event.model, event.entityId, { operation: event.operation }, Buffer.alloc(32), Buffer.alloc(32, auditSequence)],
      );
    };
    const store = postgresAdapter(appPool, keys, audit)({ session: { disableSessionRefresh: true, cookieCache: { enabled: false } } });
    try {
      const authUser = await store.create({ model: 'user', data: { email: 'migration-contract@example.invalid', emailVerified: true, name: 'Migration contract' } });
      const authSession = await store.create({ model: 'session', data: { userId: authUser.id, expiresAt: new Date(Date.now() + 86_400_000) } });
      const authChallenge = await store.create({ model: 'verification', data: {
        identifier: 'sign-in-otp-migration-contract@example.invalid',
        value: `${crypto.otpHash('123456')}:0`,
        expiresAt: new Date(Date.now() + 600_000),
      } });
      assert.equal((await store.findOne({ model: 'user', where: [{ field: 'email', value: 'migration-contract@example.invalid' }] })).id, authUser.id);
      assert.equal((await store.findOne({ model: 'session', where: [{ field: 'token', value: authSession.token }] })).id, authSession.id);
      assert.equal((await store.findOne({ model: 'verification', where: [{ field: 'identifier', value: authChallenge.identifier }] })).id, authChallenge.id);
    } finally {
      await appPool.end();
    }

    const userId = '018f3c1e-0000-7000-8000-000000000001';
    const sessionId = '018f3c1e-0000-7000-8000-000000000002';
    const challengeId = '018f3c1e-0000-7000-8000-000000000003';
    const idempotencyKey = '018f3c1e-0000-7000-8000-000000000004';
    const otherUserId = '018f3c1e-0000-7000-8000-000000000006';
    const app = await pool.connect();
    try {
      await app.query('SET ROLE eoh_app');
      await app.query('INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4)', [userId, Buffer.from('ciphertext'), Buffer.alloc(32, 1), 'Synthetic']);
      await app.query("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 day')", [sessionId, userId, Buffer.alloc(32, 2)]);
      await app.query("INSERT INTO auth_challenges (id,email_lookup_hash,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')", [challengeId, Buffer.alloc(32, 1), Buffer.alloc(32, 3)]);
      await app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', [idempotencyKey, userId, Buffer.alloc(32, 4), 201, { id: sessionId }]);
      await assert.rejects(app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', [idempotencyKey, userId, Buffer.alloc(32, 4), 201, { id: sessionId }]), /duplicate key/);
      await app.query('INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4)', [otherUserId, Buffer.from('other-ciphertext'), Buffer.alloc(32, 6), 'Other synthetic']);
      await app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', [idempotencyKey, otherUserId, Buffer.alloc(32, 4), 201, { id: sessionId }]);
      await assert.rejects(app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', ['018f3c1e-0000-7000-8000-000000000007', '018f3c1e-0000-7000-8000-000000000099', Buffer.alloc(32), 201, {}]), /foreign key/);
      await assert.rejects(app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', ['018f3c1e-0000-7000-8000-000000000008', userId, Buffer.alloc(31), 201, {}]), /idempotency_keys_request_hash_sha256/);
      await assert.rejects(app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', ['018f3c1e-0000-7000-8000-000000000009', userId, Buffer.alloc(32), 600, {}]), /idempotency_keys_response_status_range/);
      await assert.rejects(app.query('INSERT INTO idempotency_keys (key,user_id,request_hash,response_status,response_body) VALUES ($1,$2,$3,$4,$5)', ['018f3c1e-0000-7000-8000-000000000010', userId, Buffer.alloc(32), 201, JSON.stringify([])]), /idempotency_keys_response_body_object/);
      const event = await app.query("INSERT INTO audit_events (actor_type,actor_user_id,action,entity_type,entity_id,metadata,correlation_id,prev_hash,hash) VALUES ('user',$1,'auth.sign_in','session',$2,$3,'synthetic-correlation',$4,$5) RETURNING id", [userId, sessionId, { operation: 'create' }, Buffer.alloc(32), Buffer.alloc(32, 5)]);
      assert.ok(BigInt(event.rows[0].id) > 0n);
      await assert.rejects(app.query("UPDATE audit_events SET action='auth.sign_out' WHERE id=1"), /permission denied/);
      await assert.rejects(app.query('DELETE FROM audit_events WHERE id=1'), /permission denied/);
      await assert.rejects(app.query('CREATE TABLE forbidden_by_app (id int)'), /permission denied/);
      await assert.rejects(app.query('INSERT INTO auth_challenges (id,email_lookup_hash,expires_at,attempts) VALUES ($1,$2,now(),6)', ['018f3c1e-0000-7000-8000-000000000005', Buffer.alloc(32)]), /auth_challenges_attempts_range/);
      await assert.rejects(app.query("INSERT INTO audit_events (actor_type,action,entity_type,entity_id,correlation_id,prev_hash,hash) VALUES ('system','auth.sign_in','session',$1,'synthetic-correlation',$2,$3)", [sessionId, Buffer.alloc(31), Buffer.alloc(32)]), /audit_events_prev_hash_sha256/);
      await app.query('RESET ROLE');
    } finally {
      app.release();
    }

    await pool.query('ALTER ROLE eoh_app SUPERUSER');
    const bootstrapSql = migrationSql().split('CREATE TABLE "audit_events"')[0];
    await assert.rejects(pool.query(bootstrapSql), /Existing Echoes database role is not least-privilege/);
    await pool.query('ALTER ROLE eoh_app NOSUPERUSER');
    await pool.query('GRANT CREATE ON SCHEMA public TO eoh_app');
    await pool.query("DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO eoh_app', current_database()); END $$");
    await pool.query(bootstrapSql);
    assert.equal((await pool.query("SELECT has_schema_privilege('eoh_app','public','CREATE') AS allowed")).rows[0].allowed, false);
    assert.equal((await pool.query("SELECT has_database_privilege('eoh_app',current_database(),'CREATE') AS allowed")).rows[0].allowed, false);

    const owner = (await pool.query("SELECT owner.rolname FROM pg_database database_record JOIN pg_roles owner ON owner.oid=database_record.datdba WHERE database_record.datname=current_database()" )).rows[0].rolname;
    const alterOwner = async (role) => {
      const statement = (await pool.query("SELECT format('ALTER DATABASE %I OWNER TO %I', current_database(), $1::text) AS sql", [role])).rows[0].sql;
      await pool.query(statement);
    };
    await alterOwner('eoh_app');
    try {
      await assert.rejects(pool.query(bootstrapSql), /Existing Echoes database role is not least-privilege/);
    } finally {
      await alterOwner(owner);
    }
  } finally {
    if (ownsExternalState) await cleanExternalDatabase(pool);
    await pool.end();
    await stop();
  }
});
