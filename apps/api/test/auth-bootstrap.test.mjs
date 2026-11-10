import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthServiceFromEnv, LocalAuthService } from '../src/auth-service.ts';

const encodedKey = Buffer.alloc(32, 7).toString('base64');
const env = {
  DATABASE_URL: 'postgres://durable-auth-test.invalid/echoes',
  SESSION_TOKEN_PEPPER: encodedKey,
  SESSION_LOOKUP_KEY: Buffer.alloc(32, 8).toString('base64'),
  FIELD_ENCRYPTION_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 9).toString('base64') }),
  FIELD_ENCRYPTION_KEY_CURRENT_ID: 'k1',
  AUDIT_HMAC_KEY: Buffer.alloc(32, 10).toString('base64'),
};

test('configured API auth selects durable Better Auth when DATABASE_URL is set', async () => {
  const auth = await createAuthServiceFromEnv({ env, pool: {} });
  assert.ok(!(auth instanceof LocalAuthService));
  assert.equal(typeof auth.getSession, 'function');
});

test('configured API auth keeps local auth when DATABASE_URL is absent', async () => {
  const auth = await createAuthServiceFromEnv({ env: { ...env, DATABASE_URL: '' } });
  assert.ok(auth instanceof LocalAuthService);
});
