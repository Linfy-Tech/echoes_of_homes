import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStructuredLogger, redactLogFields } from '../src/index.ts';

const sensitive = {
  storyText: 'uMakhulu uthetha ngexesha lakhe lobuntwana',
  transcript: 'raw transcript text must never be emitted',
  translation: 'raw translation text must never be emitted',
  name: 'Noluthando Example',
  email: 'noluthando@example.invalid',
  consentEvidence: 'recorded consent evidence',
  audioBytes: 'base64 audio payload',
  mediaUrl: 'https://res.cloudinary.com/private/audio',
  cookie: 'eoh_session=secret',
  token: 'opaque-session-token',
  signature: 'provider-signature',
  body: { transcript: 'nested content' },
  prompt: 'model prompt',
  completion: 'model completion',
};

test('redaction drops content, PII, credentials, and unknown fields before serialization', () => {
  const result = redactLogFields({
    ...sensitive,
    correlationId: 'req-123',
    userId: '123e4567-e89b-42d3-a456-426614174000',
    route: '/v1/me',
    status: 500,
  });
  assert.deepEqual(result.fields, {
    correlationId: 'req-123',
    userId: '123e4567-e89b-42d3-a456-426614174000',
    route: '/v1/me',
    status: 500,
  });
  assert.equal(result.redactedFieldCount, Object.keys(sensitive).length);
});

test('structured logger emits JSON without a forbidden value', () => {
  const lines = [];
  const logger = createStructuredLogger('api', (line) => lines.push(line));
  logger.error('request.failed', {
    email: 'secret@example.invalid',
    transcript: 'secret transcript',
    correlationId: 'req-456',
    errorCode: 'internal_error',
  });
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.equal(line.correlationId, 'req-456');
  assert.equal(line.errorCode, 'internal_error');
  assert.equal(line.redactedFieldCount, 2);
  assert.doesNotMatch(lines[0], /secret@example|secret transcript|email|transcript/);
});

test('safe fields fail closed when values look like free-form content', () => {
  const result = redactLogFields({ operation: 'story transcript text', status: '500', route: '/v1/me?email=secret@example.invalid' });
  assert.deepEqual(result.fields, {});
  assert.equal(result.redactedFieldCount, 3);
});
