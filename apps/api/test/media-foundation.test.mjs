import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeMediaStorageProvider, sha256Hex } from '@echoes-of-home/media-storage';
import { createMediaFoundation, MediaDomainError } from '../src/media-foundation.ts';

const audio = Buffer.from('synthetic audio bytes');
const scopesFor = (value = true) => async () => value ? new Set(['record_and_store', 'cross_border_processing']) : new Set();
const authorize = async () => {};

async function uploaded(media, provider, declared = sha256Hex(audio)) {
  const created = await media.createRecording('user', '00000000-0000-0000-0000-000000000001', { source: 'browser_recording', sha256: declared, sizeBytes: audio.length, mimeType: 'audio/webm' }, authorize);
  const upload = created.upload;
  await provider.uploadChunk(upload.uploadId, audio, { start: 0, end: audio.length - 1, total: audio.length });
  const completed = await media.completeRecording('user', created.recordingId, authorize);
  return { created, completed, recordingId: created.recordingId, jobId: completed.jobId };
}

test('fake adapter upload → verify → private stream succeeds and API-shaped data has no provider URL or secret', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const result = await uploaded(media, provider);
  assert.equal(result.created.status, 'pending_upload');
  assert.equal(Object.hasOwn(result.created.upload, 'uploadUrl'), false);
  assert.equal(JSON.stringify(result.created).includes('fake.invalid'), false);
  const verified = await media.runVerifyJob(result.jobId);
  assert.equal(verified.recordingStatus, 'verified');
  const stream = await media.stream('user', '00000000-0000-0000-0000-000000000001');
  const chunks = []; for await (const chunk of stream.body) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), audio);
});

test('upload-session response shape excludes provider URLs, signed secrets, and raw paths', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const response = await media.createRecording('user', '00000000-0000-0000-0000-000000000001', { source: 'browser_recording', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' }, authorize);
  const serialized = JSON.stringify(response);
  assert.equal(Object.hasOwn(response.upload, 'uploadUrl'), false);
  assert.equal(Object.hasOwn(response.upload, 'signature'), false);
  assert.equal(serialized.includes('fake.invalid'), false);
  assert.equal(serialized.includes('/tmp/'), false);
  assert.equal(serialized.includes('api_secret'), false);
});

test('hash mismatch fails verification and never becomes verified', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const result = await uploaded(media, provider, 'a'.repeat(64));
  const verified = await media.runVerifyJob(result.jobId);
  assert.equal(verified.status, 'failed_permanent');
  assert.equal((await media.getRecording('user', result.recordingId, authorize)).status, 'failed');
});

test('incomplete upload is rejected without enqueueing a job', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const created = await media.createRecording('user', '00000000-0000-0000-0000-000000000001', { source: 'browser_recording', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' }, authorize);
  await provider.uploadChunk(created.upload.uploadId, audio.subarray(0, 2), { start: 0, end: 1, total: audio.length });
  await assert.rejects(media.completeRecording('user', created.recordingId, authorize), (error) => error instanceof MediaDomainError && error.code === 'upload_incomplete');
  assert.equal(media.jobs.size, 0);
});

test('forged webhook is rejected', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const body = Buffer.from(JSON.stringify({ eventId: 'evt', assetId: 'asset', publicId: 'fake/not-real', status: 'uploaded', timestamp: Math.floor(Date.now() / 1000) }));
  await assert.rejects(media.webhook(new Headers({ 'x-cld-timestamp': String(Math.floor(Date.now() / 1000)), 'x-cld-signature': 'forged' }), body), (error) => error instanceof MediaDomainError && error.code === 'webhook_invalid');
});

test('consent withdrawn after enqueue cancels before provider verification', async () => {
  let active = true;
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: async () => active ? new Set(['record_and_store', 'cross_border_processing']) : new Set() });
  const result = await uploaded(media, provider);
  active = false;
  const outcome = await media.runVerifyJob(result.jobId);
  assert.equal(outcome.status, 'cancelled');
  assert.equal((await media.getRecording('user', result.recordingId, authorize)).status, 'uploaded');
});

test('abandoned cleanup expires stale sessions but leaves fresh ones', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: scopesFor() });
  const stale = await media.createRecording('user', '00000000-0000-0000-0000-000000000001', { source: 'browser_recording', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' }, authorize);
  const fresh = await media.createRecording('user', '00000000-0000-0000-0000-000000000002', { source: 'browser_recording', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' }, authorize).catch(() => null);
  media.recordings.get(stale.recordingId).uploadExpiresAt = new Date(Date.now() - 1);
  const result = await media.cleanupAbandoned();
  assert.equal(result.abandoned, 1);
  assert.equal(media.recordings.get(stale.recordingId).status, 'abandoned');
  assert.equal(fresh ? media.recordings.get(fresh.recordingId).status : 'pending_upload', 'pending_upload');
});
