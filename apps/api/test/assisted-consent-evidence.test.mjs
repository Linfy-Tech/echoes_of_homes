import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeMediaStorageProvider, sha256Hex } from '@echoes-of-home/media-storage';
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
