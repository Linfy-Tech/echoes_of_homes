import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { postgresAdapter } from '../src/postgres-adapter.ts';
import { credentials } from '../src/crypto.ts';

const location = mkdtempSync(join(tmpdir(), 'echoes-auth-'));
const bin = process.env.POSTGRES_TEST_BIN;
const keys = { pepper: randomBytes(32), encryption: { k1: randomBytes(32) }, currentKeyId: 'k1', lookup: randomBytes(32) };
const crypto = credentials(keys);
let pool; let started = false; let delivered;
let auth;
const lookups = [];
const audit = async (tx, event) => { await tx.query('INSERT INTO audit_probe VALUES ($1,$2,$3)', [event.model,event.operation,event.entityId]); };
const adapter = () => postgresAdapter(pool, keys, audit);
before(async () => {
  if (process.env.POSTGRES_TEST_URL) {
    const target = new URL(process.env.POSTGRES_TEST_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && /^\/echoes_auth_test(?:_|$)/.test(target.pathname), 'Use a loopback disposable echoes_auth_test database only');
  }
  if (!process.env.POSTGRES_TEST_URL) {
    assert.ok(bin, 'Set POSTGRES_TEST_BIN to an isolated PostgreSQL 16+ bin directory');
    execFileSync(join(bin, 'initdb'), ['-D', join(location, 'data'), '-U', 'echoes_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
    execFileSync(join(bin, 'pg_ctl'), ['-D', join(location, 'data'), '-l', join(location, 'postgres.log'), '-o', `-h '' -k ${location} -p 55439`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
  }
  pool = new Pool(process.env.POSTGRES_TEST_URL ? { connectionString: process.env.POSTGRES_TEST_URL } : { host: location, port: 55439, database: 'postgres', user: 'echoes_test' });
  pool.on('connect', (client) => {
    const original = client.query;
    client.query = function (...args) { if (typeof args[0] === 'string' && args[0].startsWith('SELECT * FROM users WHERE')) lookups.push({ text: args[0], values: args[1] }); return Reflect.apply(original, this, args); };
  });
  assert.ok(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) >= 160000);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")).rows[0].count, 0, 'Auth compatibility test requires an empty disposable database');
  await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  auth = betterAuth({
    database: adapter(), baseURL: 'http://localhost:4000', secret: randomBytes(48).toString('base64url'),
    telemetry: { enabled: false }, logger: { disabled: true },
    session: { expiresIn: 30 * 86400, disableSessionRefresh: true, cookieCache: { enabled: false } },
    plugins: [emailOTP({ storeOTP: { hash: async (otp) => crypto.otpHash(otp) }, otpLength: 6, expiresIn: 600, allowedAttempts: 5, sendVerificationOTP: async (mail) => { delivered = mail; } })],
  });
});
after(async () => {
  await pool?.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', join(location, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(location, { recursive: true, force: true });
});
const email = 'synthetic@example.invalid';

test('OQ-039 real Better Auth OTP sign-in stores only encrypted email and peppered credentials', async () => {
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  assert.match(delivered.otp, /^\d{6}$/);
  const result = await auth.api.signInEmailOTP({ body: { email, otp: delivered.otp, name: 'Synthetic' } });
  assert.equal(result.user.email, email);
  assert.ok(result.token.length >= 43);
  const user = (await pool.query('SELECT * FROM users')).rows[0];
  assert.equal(crypto.decrypt(user.email), email);
  assert.deepEqual(user.email_lookup_hash, crypto.emailHash(email));
  const session = (await pool.query('SELECT * FROM sessions')).rows[0];
  assert.deepEqual(session.token_hash, createHmac('sha256', keys.pepper).update(result.token).digest());
  assert.equal(session.token, undefined);
  assert.match(session.id, /^[0-9a-f-]{14}7[0-9a-f-]+$/);
  assert.ok(session.expires_at - session.created_at <= 30 * 86400 * 1000);
  const dump = JSON.stringify((await pool.query('SELECT row_to_json(users) AS row FROM users')).rows);
  assert.ok(!dump.includes(email));
  const challenge = (await pool.query('SELECT * FROM auth_challenges')).rows[0];
  assert.ok(challenge.consumed_at);
  assert.ok(challenge.expires_at - challenge.created_at <= 600000);
  assert.ok(Buffer.isBuffer(challenge.code_hash));
  assert.deepEqual(challenge.code_hash, Buffer.from(crypto.otpHash(delivered.otp), 'base64url'));
  assert.ok(!challenge.code_hash.equals(Buffer.from(delivered.otp)));
  await assert.rejects(auth.api.signInEmailOTP({ body: { email, otp: delivered.otp } }));
});

test('OQ-039 five wrong guesses exhaust one challenge and its expiry never extends', async () => {
  const email = 'attempts@example.invalid';
  const weak = betterAuth({ ...auth.options, database: adapter(), plugins: [emailOTP({ allowedAttempts: 100, expiresIn: 3600, storeOTP: { hash: async (otp) => crypto.otpHash(otp) }, sendVerificationOTP: async (mail) => { delivered = mail; } })] });
  await weak.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const otp = delivered.otp;
  const original = (await pool.query('SELECT * FROM auth_challenges WHERE email_lookup_hash=$1', [crypto.emailHash(email)])).rows[0];
  for (let i = 1; i <= 5; i++) {
    await assert.rejects(weak.api.signInEmailOTP({ body: { email, otp: otp === '000000' ? '111111' : '000000' } }));
    const retry = (await pool.query('SELECT * FROM auth_challenges WHERE id=$1', [original.id])).rows[0];
    assert.equal(retry.attempts, i);
    assert.deepEqual(retry.expires_at, original.expires_at);
    if (i < 5) assert.equal(retry.consumed_at, null);
    else assert.ok(retry.consumed_at);
  }
  await assert.rejects(weak.api.signInEmailOTP({ body: { email, otp } }));
  const rows = (await pool.query('SELECT * FROM auth_challenges WHERE email_lookup_hash=$1', [crypto.emailHash(email)])).rows;
  assert.equal(rows.length, 1);
  assert.ok(rows[0].expires_at - rows[0].created_at <= 600000);
  assert.equal(rows[0].attempts, 5);
  assert.deepEqual(rows[0].expires_at, original.expires_at);
  assert.ok(rows[0].consumed_at);
});

test('OQ-039 two independent auth instances cannot consume one OTP twice', async () => {
  const email = 'race@example.invalid';
  const other = betterAuth({ ...auth.options, database: adapter() });
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const body = { email, otp: delivered.otp, name: 'Synthetic race' };
  const attempts = await Promise.allSettled([auth.api.signInEmailOTP({ body }), other.api.signInEmailOTP({ body })]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM sessions JOIN users ON users.id=sessions.user_id WHERE users.email_lookup_hash=$1', [crypto.emailHash(email)])).rows[0].count, 1);
});

test('OQ-039 expired OTP never creates a session', async () => {
  const email = 'expired@example.invalid';
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  await pool.query("UPDATE auth_challenges SET expires_at=now()-interval '1 second' WHERE email_lookup_hash=$1", [crypto.emailHash(email)]);
  await assert.rejects(auth.api.signInEmailOTP({ body: { email, otp: delivered.otp, name: 'Expired' } }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM users WHERE email_lookup_hash=$1', [crypto.emailHash(email)])).rows[0].count, 0);
});

test('OQ-039 candidate-token lookup, idle touch, expiry and revocation fail closed', async () => {
  const email = 'session@example.invalid';
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const signed = await auth.api.signInEmailOTP({ body: { email, otp: delivered.otp, name: 'Session' }, returnHeaders: true });
  const cookie = signed.headers.getSetCookie().find((value) => value.startsWith('better-auth.session_token=')).split(';')[0];
  const headers = new Headers({ cookie });
  const tokenHash = crypto.tokenHash(signed.response.token);
  await pool.query("UPDATE sessions SET last_seen_at=now()-interval '6 days' WHERE token_hash=$1", [tokenHash]);
  assert.equal((await auth.api.getSession({ headers })).user.id, signed.response.user.id);
  assert.ok((await pool.query("SELECT last_seen_at > now()-interval '1 minute' AS touched FROM sessions WHERE token_hash=$1", [tokenHash])).rows[0].touched);
  const touched = (await pool.query('SELECT last_seen_at FROM sessions WHERE token_hash=$1', [tokenHash])).rows[0].last_seen_at;
  await auth.api.getSession({ headers });
  assert.deepEqual((await pool.query('SELECT last_seen_at FROM sessions WHERE token_hash=$1', [tokenHash])).rows[0].last_seen_at, touched);
  await pool.query("UPDATE sessions SET last_seen_at=now()-interval '8 days' WHERE token_hash=$1", [tokenHash]);
  assert.equal(await auth.api.getSession({ headers }), null);
  await pool.query('UPDATE sessions SET last_seen_at=now(), revoked_at=now() WHERE token_hash=$1', [tokenHash]);
  assert.equal(await auth.api.getSession({ headers }), null);
  await pool.query("UPDATE sessions SET revoked_at=NULL, expires_at=now()-interval '1 second' WHERE token_hash=$1", [tokenHash]);
  assert.equal(await auth.api.getSession({ headers }), null);
});

test('OQ-039 delayed wrong-guess restoration cannot resurrect a superseded OTP', async () => {
  const email = 'superseded@example.invalid'; let code = '123456';
  let release; let reached;
  const paused = new Promise((resolve) => { reached = resolve; });
  const resume = new Promise((resolve) => { release = resolve; });
  const plugin = () => emailOTP({ expiresIn: 600, allowedAttempts: 5, generateOTP: () => code,
    sendVerificationOTP: async (mail) => { delivered = mail; },
    storeOTP: { hash: async (otp) => { if (otp === '000000') { reached(); await resume; } return crypto.otpHash(otp); } },
  });
  const issuer = betterAuth({ ...auth.options, database: adapter(), plugins: [plugin()] });
  const attacker = betterAuth({ ...auth.options, database: adapter(), plugins: [plugin()] });
  await issuer.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const old = delivered.otp;
  const failure = assert.rejects(attacker.api.signInEmailOTP({ body: { email, otp: '000000' } }));
  await paused;
  try {
    code = '654321';
    await issuer.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    await issuer.api.signInEmailOTP({ body: { email, otp: delivered.otp, name: 'New generation' } });
  } finally { release(); }
  await failure;
  await assert.rejects(issuer.api.signInEmailOTP({ body: { email, otp: old } }));
  await assert.rejects(issuer.api.sendVerificationOTP({ body: { email, type: 'sign-in' } }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_challenges WHERE email_lookup_hash=$1 AND consumed_at IS NULL', [crypto.emailHash(email)])).rows[0].count, 0);
});

test('OQ-039 user lookup uses indexed HMAC equality; updates remain encrypted; unsupported reads fail closed', async () => {
  const store = adapter()(auth.options);
  const user = await store.findOne({ model: 'user', where: [{ field: 'email', value: email.toUpperCase() }] });
  assert.equal(user.email, email);
  await store.update({ model: 'user', where: [{ field: 'id', value: user.id }], update: { email: 'updated@example.invalid' } });
  assert.equal(await store.findOne({ model: 'user', where: [{ field: 'email', value: email }] }), null);
  const updated = await store.findOne({ model: 'user', where: [{ field: 'email', value: 'updated@example.invalid' }] });
  assert.equal(updated.id, user.id);
  const client = await pool.connect();
  try {
    await client.query('SET enable_seqscan=off');
    const lookup = lookups.findLast((query) => Buffer.isBuffer(query.values?.[0]) && query.values[0].equals(crypto.emailHash(updated.email)));
    assert.ok(lookup); assert.match(lookup.text, /WHERE email_lookup_hash = \$1/);
    assert.ok(!lookup.values.includes(updated.email));
    const plan = (await client.query('EXPLAIN ' + lookup.text, lookup.values)).rows.map((row) => row['QUERY PLAN']).join('\n');
    assert.match(plan, /Index Scan/);
  } finally { await client.query('RESET enable_seqscan'); client.release(); }
  await auth.api.sendVerificationOTP({ body: { email: 'broad@example.invalid', type: 'sign-in' } });
  const active = (await pool.query('SELECT count(*)::int AS count FROM auth_challenges WHERE consumed_at IS NULL')).rows[0].count;
  await assert.rejects(store.consumeOne({ model: 'verification', where: [{ field: 'expiresAt', value: new Date(), operator: 'gt' }] }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_challenges WHERE consumed_at IS NULL')).rows[0].count, active);
  await assert.rejects(store.findMany({ model: 'user', where: [] }));
  await assert.rejects(store.findMany({ model: 'session', where: [{ field: 'userId', value: user.id }] }));
  await assert.rejects(store.findOne({ model: 'constructor', where: [{ field: 'id', value: user.id }] }));
});

test('OQ-039 audit failure rolls back its mutation and errors/logs omit sensitive input', async () => {
  const broken = postgresAdapter(pool, keys, async () => { throw new Error('synthetic-audit-failure'); })(auth.options);
  await assert.rejects(broken.create({ model: 'user', data: { email: 'rollback@example.invalid', emailVerified: true, name: 'Rollback' } }), { message: 'Auth persistence rejected' });
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM users WHERE email_lookup_hash=$1', [crypto.emailHash('rollback@example.invalid')])).rows[0].count, 0);
  const captured = [];
  const loud = betterAuth({ ...auth.options, database: adapter(), logger: { level: 'debug', log: (...args) => captured.push(args) } });
  const email = 'log-sentinel@example.invalid'; const name = 'private-name-sentinel'.repeat(10);
  await loud.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  await assert.rejects(loud.api.signInEmailOTP({ body: { email, otp: delivered.otp, name } }), (error) => !JSON.stringify(error).includes(name));
  assert.ok(!JSON.stringify(captured).includes(email) && !JSON.stringify(captured).includes(name));
  assert.ok((await pool.query('SELECT count(*)::int AS count FROM audit_probe')).rows[0].count > 0);
});

test('OQ-039 keyring rotation, authenticated encryption, and malformed-key rejection', () => {
  const encrypted = crypto.encrypt(email);
  const rotated = credentials({ ...keys, encryption: { ...keys.encryption, k2: randomBytes(32) }, currentKeyId: 'k2' });
  assert.equal(rotated.decrypt(encrypted), email);
  assert.equal(rotated.decrypt(rotated.encrypt(email)), email);
  const damaged = Buffer.from(encrypted); damaged[damaged.length - 1] ^= 1;
  assert.throws(() => crypto.decrypt(damaged));
  assert.throws(() => crypto.otpHash('1234567'));
  assert.throws(() => credentials({ ...keys, pepper: 'x'.repeat(32) }));
  assert.throws(() => credentials({ ...keys, encryption: {}, currentKeyId: 'constructor' }));
});

test('OQ-039 fresh sign-in rotates credentials; ID-based and all-session revocation are immediate', async () => {
  const email = 'rotate@example.invalid';
  const signIn = async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    return auth.api.signInEmailOTP({ body: { email, otp: delivered.otp, name: 'Rotate' }, returnHeaders: true });
  };
  const first = await signIn(); const second = await signIn();
  assert.notEqual(first.response.token, second.response.token);
  const headers = (signed) => new Headers({ cookie: signed.headers.getSetCookie().find((value) => value.startsWith('better-auth.session_token=')).split(';')[0] });
  const store = adapter()(auth.options);
  const row = (await pool.query('SELECT id FROM sessions WHERE token_hash=$1', [crypto.tokenHash(first.response.token)])).rows[0];
  await store.delete({ model: 'session', where: [{ field: 'id', value: row.id }] });
  assert.equal(await auth.api.getSession({ headers: headers(first) }), null);
  assert.ok(await auth.api.getSession({ headers: headers(second) }));
  await auth.api.revokeSessions({ headers: headers(second) });
  assert.equal(await auth.api.getSession({ headers: headers(second) }), null);
});


test('OQ-039 session token digest matches an independent HMAC-SHA256 vector', () => {
  const pepper = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
  const actual = credentials({ ...keys, pepper }).tokenHash('synthetic-session-token');
  assert.equal(actual.toString('hex'), 'ddf1e179a9c88f5d6ebf4cf165830d1bed71105ef4d76753861f4bb1859eec3b');
  assert.notDeepEqual(actual, credentials({ ...keys, pepper: Buffer.alloc(32, 7) }).tokenHash('synthetic-session-token'));
});

test('OQ-039 invalid retry restore never inserts a replacement challenge', async () => {
  const store = adapter()(auth.options);
  const email = 'invalid-retry@example.invalid';
  await assert.rejects(store.create({ model: 'verification', data: {
    identifier: `sign-in-otp-${email}`, value: `${crypto.otpHash('123456')}:1`, expiresAt: new Date(Date.now() + 600000),
  } }), { message: 'Auth persistence rejected' });
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_challenges WHERE email_lookup_hash=$1', [crypto.emailHash(email)])).rows[0].count, 0);
});
