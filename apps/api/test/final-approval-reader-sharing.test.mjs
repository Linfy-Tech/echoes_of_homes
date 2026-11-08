import assert from 'node:assert/strict';
import { test } from 'node:test';
import { can } from '@echoes-of-home/auth/policy';
import { FinalApprovalReaderSharing, FinalStoryDomainError } from '../src/final-approval-reader-sharing.ts';
import { validateStartupEnvironment } from '../src/server.ts';

const actor = (userId) => ({ userId, accountRole: 'member', status: 'active', secondFactorVerified: false });

function fixture(options = {}) {
  const service = new FinalApprovalReaderSharing();
  service.registerStory({ storyId: 'story-m7', familyCircleId: 'family-m7', rightsHolderUserId: 'rights-holder', storytellerUserId: 'storyteller', consentScopes: ['share_family'], transcriptApproved: true, translationApproved: options.translationApproved ?? true, englishText: options.translationApproved === false ? null : 'English story', isiXhosaText: 'Ibali lesiXhosa', audioAssetId: 'asset-m7', transcriptHash: 'transcript-hash', translationHash: options.translationApproved === false ? null : 'translation-hash' });
  return service;
}

test('audience state machine supports private → family → private and rejects invalid transitions', () => {
  const service = fixture();
  service.approveFinal('rights-holder', 'story-m7');
  assert.equal(service.stories.get('story-m7').audience, 'private');
  assert.throws(() => service.setAudience('rights-holder', 'story-m7', 'public'), (error) => error instanceof FinalStoryDomainError && error.code === 'public_sharing_disabled');
  service.setAudience('rights-holder', 'story-m7', 'family');
  assert.equal(service.stories.get('story-m7').audience, 'family');
  service.setAudience('rights-holder', 'story-m7', 'private');
  assert.equal(service.stories.get('story-m7').audience, 'private');
});

test('viewer and family-member policy matrix follows role and current audience', () => {
  const service = fixture(); service.approveFinal('rights-holder', 'story-m7'); service.grantViewer('story-m7', 'viewer'); service.addFamilyMember('story-m7', 'family-member'); service.setAudience('rights-holder', 'story-m7', 'family');
  assert.equal(can(actor('viewer'), 'story.version.read', service.resourceFor('viewer', 'story-m7')), true);
  assert.equal(can(actor('family-member'), 'story.version.read', service.resourceFor('family-member', 'story-m7')), true);
  assert.equal(can(actor('outsider'), 'story.version.read', service.resourceFor('outsider', 'story-m7')), false);
  service.setAudience('rights-holder', 'story-m7', 'private');
  assert.equal(can(actor('family-member'), 'story.version.read', service.resourceFor('family-member', 'story-m7')), false);
  assert.equal(can(actor('viewer'), 'story.version.read', service.resourceFor('viewer', 'story-m7')), false);
});

test('revocation takes effect on the viewer’s very next request', () => {
  const service = fixture(); service.approveFinal('rights-holder', 'story-m7'); service.grantViewer('story-m7', 'viewer'); service.setAudience('rights-holder', 'story-m7', 'family');
  assert.equal(service.read('viewer', 'story-m7').version.status, 'approved');
  service.setAudience('rights-holder', 'story-m7', 'private');
  assert.throws(() => service.read('viewer', 'story-m7'), (error) => error instanceof FinalStoryDomainError && error.code === 'audience_denied');
});

test('public sharing true in production configuration refuses startup', () => {
  assert.throws(() => validateStartupEnvironment({ NODE_ENV: 'production', APP_ENV: 'production', FEATURE_PUBLIC_SHARING: 'true' }), { message: 'Invalid environment configuration' });
  assert.equal(validateStartupEnvironment({ NODE_ENV: 'production', APP_ENV: 'production' }).FEATURE_PUBLIC_SHARING, false);
});

test('complete trust workflow: approved transcript/translation → final approval → family read → revoke', () => {
  const service = fixture();
  const version = service.approveFinal('rights-holder', 'story-m7');
  service.addFamilyMember('story-m7', 'family-member');
  service.setAudience('rights-holder', 'story-m7', 'family');
  const reader = service.read('family-member', 'story-m7');
  assert.equal(reader.version.id, version.id);
  assert.equal(reader.version.englishText, 'English story');
  assert.equal(reader.audioUrl, '/v1/stories/story-m7/audio');
  assert.deepEqual(reader.version.provenance.map((item) => item.action), ['transcript_approved', 'translation_approved', 'story_version_approved']);
  service.setAudience('rights-holder', 'story-m7', 'private');
  assert.throws(() => service.read('family-member', 'story-m7'), /audience_denied/);
});

test('isiXhosa-only story can be finally approved without a translation', () => {
  const service = fixture({ translationApproved: false });
  const version = service.approveFinal('rights-holder', 'story-m7');
  assert.equal(version.englishText, null);
  assert.equal(version.translationHash, null);
});

test('custodian audience widening requires a fresh assisted confirmation', () => {
  const service = new FinalApprovalReaderSharing();
  service.registerStory({ storyId: 'custodian-story', familyCircleId: 'family-m7', storytellerUserId: null, rightsHolderUserId: 'custodian', custodianRightsHolder: true, consentScopes: ['share_family'], englishText: null });
  service.approveFinal('custodian', 'custodian-story');
  assert.throws(() => service.setAudience('custodian', 'custodian-story', 'family'), /custodian_confirmation_required/);
  service.confirmCustodianAssistedShare('custodian-story', 'custodian');
  assert.equal(service.setAudience('custodian', 'custodian-story', 'family').audience, 'family');
});
