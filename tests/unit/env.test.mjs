import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnv } from '../../packages/validation/src/env.ts';

test('M1 config: local defaults use fake providers and sharing is off', () => {
  const config = parseEnv({});
  assert.equal(config.AI_PROVIDER_MODE, 'fake');
  assert.equal(config.MEDIA_STORAGE_PROVIDER, 'fake');
  assert.equal(config.FEATURE_PUBLIC_SHARING, false);
  assert.equal(config.FEATURE_SECONDARY_ASR, false);
  assert.equal(parseEnv({ FEATURE_SECONDARY_ASR: 'true' }).FEATURE_SECONDARY_ASR, true);
});

test('M1 config: rejects invalid values and R1 public sharing without leaking input', () => {
  for (const input of [
    { AI_PROVIDER_MODE: 'synthetic-secret-sentinel' },
    { APP_ENV: 'unknown' },
    { FEATURE_SECONDARY_ASR: 'yes' },
    { APP_ENV: 'production', FEATURE_PUBLIC_SHARING: 'true' },
  ]) assert.throws(() => parseEnv(input), { message: 'Invalid environment configuration' });
  assert.equal('UNRELATED_SECRET' in parseEnv({ UNRELATED_SECRET: 'synthetic' }), false);
});
