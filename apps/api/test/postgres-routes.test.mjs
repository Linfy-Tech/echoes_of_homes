import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { buildServer } from '../src/server.ts';
import { createBetterAuthService } from '../src/auth-service.ts';
import { credentials } from '@echoes-of-home/auth/credentials';

const location = mkdtempSync(join(tmpdir(), 'echoes-api-auth-'));
const bin = process.env.POSTGRES_TEST_BIN;
const connectionString = process.env.POSTGRES_API_TEST_URL ?? process.env.POSTGRES_TEST_URL;
const keys = { pepper: randomBytes(32), lookup: randomBytes(32), encryption: { k1: randomBytes(32) }, currentKeyId: 'k1' };
let pool;
let started = false;
let app;
let delivered;

before(async () => {
  if (!connectionString) {
    assert.ok(bin, 'Set POSTGRES_TEST_BIN or POSTGRES_API_TEST_URL for the PostgreSQL route integration test');
    execFileSync(join(bin, 'initdb'), ['-D', join(location, 'data'), '-U', 'echoes_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
    execFileSync(join(bin, 'pg_ctl'), ['-D', join(location, 'data'), '-l', join(location, 'postgres.log'), '-o', `-h '' -k ${location} -p 55440`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
  }
  pool = new Pool(connectionString ? { connectionString } : { host: location, port: 55440, database: 'postgres', user: 'echoes_test' });
  assert.ok(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) >= 160000, 'API integration requires PostgreSQL 16+');
  await pool.query('DROP TABLE IF EXISTS audit_events, audit_probe, auth_challenges, sessions, users CASCADE');
  await pool.query('DROP SEQUENCE IF EXISTS audit_events_id_seq CASCADE');
  await pool.query(readFileSync(new URL('../../../packages/auth/test/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`CREATE SEQUENCE audit_events_id_seq;
    CREATE TABLE audit_events (
      id bigint PRIMARY KEY DEFAULT nextval('audit_events_id_seq'), occurred_at timestamptz NOT NULL DEFAULT now(),
      actor_type text NOT NULL, actor_user_id uuid, action text NOT NULL, entity_type text NOT NULL,
      entity_id uuid NOT NULL, story_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      correlation_id text NOT NULL, prev_hash bytea NOT NULL, hash bytea NOT NULL
    )`);
  const audit = { key: randomBytes(32), context: () => ({ actorType: 'system', correlationId: 'api-integration-test' }) };
  const auth = await createBetterAuthService({ pool, authKeys: keys, audit, onOtp: (mail) => { delivered = mail; } });
  app = buildServer({ auth });
  await app.ready();
});

after(async () => {
  await app?.close();
  await pool?.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', join(location, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(location, { recursive: true, force: true });
});

test('real Better Auth/Postgres OTP sign-in issues a session and serves /v1/me', async () => {
  const email = 'api-postgres@example.invalid';
  const challenge = await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email, uiLanguage: 'xh' } });
  assert.equal(challenge.statusCode, 202);
  assert.equal(delivered.email, email);
  assert.match(delivered.otp, /^\d{6}$/);
  const verify = await app.inject({ method: 'POST', url: '/v1/auth/challenges/verify', payload: { email, otp: delivered.otp } });
  assert.equal(verify.statusCode, 200);
  const cookie = verify.headers['set-cookie'];
  assert.ok(cookie?.startsWith('eoh_session='));
  const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().email, email);
  const crypto = credentials(keys);
  const user = (await pool.query('SELECT * FROM users')).rows[0];
  assert.equal(crypto.decrypt(user.email), email);
  assert.deepEqual(user.email_lookup_hash, crypto.emailHash(email));
  const session = (await pool.query('SELECT * FROM sessions')).rows[0];
  const token = cookie.split('=', 2)[1]?.split(';', 1)[0] ?? '';
  assert.deepEqual(session.token_hash, createHmac('sha256', keys.pepper).update(token).digest());
  assert.equal(session.token, undefined);
});
