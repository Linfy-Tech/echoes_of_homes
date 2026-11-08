import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeMediaStorageProvider, sha256Hex } from '@echoes-of-home/media-storage';
import { buildServer } from '../src/server.ts';
import { LocalAuthService } from '../src/auth-service.ts';
import { M2FoundationService } from '../src/m2-foundation.ts';
import { createMediaFoundation } from '../src/media-foundation.ts';

const audio = Buffer.from('storyteller verbal consent evidence');
const input = { source: 'browser_recording', purpose: 'consent_evidence', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' };
const consentInput = (evidenceMediaAssetId) => ({ method: 'assisted_verbal', evidenceMediaAssetId, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true }, scriptVersion: '0.0.0-placeholder' });

async function storyFor(foundation, userId = 'user-1') {
  const family = await foundation.createFamily(userId, 'Evidence family');
  const person = await foundation.createPerson(userId, { displayName: 'Storyteller', preferredLanguage: 'en' });
  return foundation.createStory(userId, { familyCircleId: family.id, storytellerPersonId: person.id });
}

async function verifiedEvidence(media, provider, storyId) {
  const created = await media.createRecording('recorder', storyId, input, async () => {});
  await provider.uploadChunk(created.upload.uploadId, audio, { start: 0, end: audio.length - 1, total: audio.length });
  const completed = await media.completeRecording('recorder', created.recordingId, async () => {});
  await media.runVerifyJob(completed.jobId);
  return created.mediaAssetId;
}

function foundationWithMedia(media, repository) {
  return new M2FoundationService({ repository, allowPlaceholderConsent: true, evidenceMediaResolver: (assetId) => media.getEvidenceMedia(assetId) });
}

test('assisted-verbal consent accepts only verified, story-matched evidence and returns playable media linkage', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: async () => new Set() });
  const foundation = foundationWithMedia(media);
  const story = await storyFor(foundation);
  const assetId = await verifiedEvidence(media, provider, story.id);
  const consent = await foundation.recordConsent(story.id, consentInput(assetId), 'user-1');
  assert.equal(consent.evidenceMediaAssetId, assetId);
  const evidence = await media.getEvidenceMedia(assetId);
  assert.equal(evidence?.assetId, assetId);
  assert.equal(evidence?.storyId, story.id);
  assert.equal(evidence?.verified, true);
  assert.equal(evidence?.playable, true);
});

test('assisted-verbal consent rejects missing, cross-story, reused, and unverified evidence', async () => {
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: async () => new Set() });
  const foundation = foundationWithMedia(media);
  const story = await storyFor(foundation);
  const otherStory = await storyFor(foundation, 'user-2');
  const unverifiedStory = await storyFor(foundation, 'user-3');
  await assert.rejects(foundation.recordConsent(story.id, consentInput('00000000-0000-0000-0000-000000000099'), 'user-1'), /evidence_not_found/);
  const unverified = await media.createRecording('recorder', unverifiedStory.id, input, async () => {});
  await assert.rejects(foundation.recordConsent(unverifiedStory.id, consentInput(unverified.mediaAssetId), 'user-1'), /evidence_unverified/);
  const otherAssetId = await verifiedEvidence(media, provider, otherStory.id);
  await assert.rejects(foundation.recordConsent(story.id, consentInput(otherAssetId), 'user-1'), /evidence_story_mismatch/);
  const validAssetId = await verifiedEvidence(media, provider, story.id);
  await foundation.recordConsent(story.id, consentInput(validAssetId), 'user-1');
  await assert.rejects(foundation.recordConsent(story.id, consentInput(validAssetId), 'user-1'), /evidence_reused/);
});

test('end-to-end assisted consent records verified playable evidence through the API pipeline', async (t) => {
  const auth = new LocalAuthService();
  const foundation = new M2FoundationService({ allowPlaceholderConsent: true });
  const provider = new FakeMediaStorageProvider();
  const media = createMediaFoundation({ provider, consentScopes: async () => new Set() });
  const app = buildServer({ auth, foundation, media, allowedOrigins: ['http://localhost:3000'] });
  await app.ready();
  t.after(() => app.close());

  const email = 'assisted-e2e@example.invalid';
  await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email } });
  const verified = await app.inject({ method: 'POST', url: '/v1/auth/challenges/verify', payload: { email, otp: auth.delivered.get(email) } });
  const cookie = verified.headers['set-cookie'];
  const headers = { cookie, origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' };
  const family = await app.inject({ method: 'POST', url: '/v1/families', headers, payload: { name: 'Assisted consent family' } });
  const person = await app.inject({ method: 'POST', url: '/v1/persons', headers, payload: { displayName: 'Storyteller', preferredLanguage: 'en' } });
  const story = await app.inject({ method: 'POST', url: '/v1/stories', headers, payload: { familyCircleId: family.json().id, storytellerPersonId: person.json().id } });
  assert.equal(story.statusCode, 201);
  const storyId = story.json().id;

  const created = await app.inject({
    method: 'POST', url: `/v1/stories/${storyId}/recordings`, headers,
    payload: { source: 'browser_recording', purpose: 'consent_evidence', sha256: sha256Hex(audio), sizeBytes: audio.length, mimeType: 'audio/webm' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const recording = created.json();
  assert.ok(recording.mediaAssetId);

  const uploaded = await app.inject({
    method: 'POST', url: `/v1/recordings/${recording.recordingId}/chunks`, headers: { ...headers, 'content-type': 'application/octet-stream', 'content-range': `bytes 0-${audio.length - 1}/${audio.length}` },
    payload: audio,
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const completed = await app.inject({ method: 'POST', url: `/v1/recordings/${recording.recordingId}/complete`, headers });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().status, 'uploaded');

  const verification = await media.runVerifyJob(completed.json().jobId);
  assert.equal(verification.status, 'succeeded');
  assert.equal(verification.recordingStatus, 'verified');

  const consent = await app.inject({
    method: 'POST', url: `/v1/stories/${storyId}/consent`, headers,
    payload: { method: 'assisted_verbal', evidenceMediaAssetId: recording.mediaAssetId, comprehensionResult: { questions: 3, correct: 3, reexplained: false }, rightsHolderChoice: 'self', scopes: { record_and_store: true } },
  });
  assert.equal(consent.statusCode, 201, consent.body);
  assert.equal(consent.json().evidenceMediaAssetId, recording.mediaAssetId);

  const readback = await app.inject({ method: 'GET', url: `/v1/recordings/${recording.recordingId}`, headers: { cookie } });
  assert.equal(readback.statusCode, 200);
  assert.equal(readback.json().status, 'verified');
  assert.equal(readback.json().mediaAssetId, recording.mediaAssetId);
  const evidence = await media.getEvidenceMedia(recording.mediaAssetId);
  assert.deepEqual(evidence, { assetId: recording.mediaAssetId, storyId, recordingId: recording.recordingId, verified: true, playable: true });
  const providerRef = media.recordings.get(recording.recordingId).providerRef;
  const playable = await provider.openStream(providerRef);
  const chunks = [];
  for await (const chunk of playable.body) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), audio);
});
