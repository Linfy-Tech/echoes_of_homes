import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthorizationError, assertCan, can, policyActions } from '../src/policy.ts';

const ids = Object.freeze({ storyteller: 'storyteller', custodian: 'custodian', recorder: 'recorder', reviewer: 'reviewer', translator: 'translator', viewer: 'viewer', family: 'family', admin: 'admin', outsider: 'outsider' });
const profiles = Object.freeze({
  storyteller_rights_holder: ids.storyteller,
  storyteller_with_custodian: ids.storyteller,
  rights_holder_custodian: ids.custodian,
  recorder: ids.recorder,
  transcript_reviewer: ids.reviewer,
  translation_reviewer: ids.translator,
  viewer: ids.viewer,
  family_member: ids.family,
  family_admin: ids.family,
  platform_admin: ids.admin,
  admin_break_glass: ids.admin,
  outsider: ids.outsider,
});

const all = ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer', 'family_member', 'family_admin', 'platform_admin', 'admin_break_glass', 'outsider'];
const allowed = Object.freeze({
  'story.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer', 'family_member', 'platform_admin', 'admin_break_glass'],
  'transcript.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer', 'translation_reviewer', 'admin_break_glass'],
  'story.audio.stream': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer', 'translation_reviewer', 'viewer', 'family_member', 'admin_break_glass'],
  'story.version.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer', 'translation_reviewer', 'viewer', 'family_member', 'admin_break_glass'],
  'recording.create': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder'],
  'recording.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder'],
  'recording.complete': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder'],
  'consent.create': ['storyteller_rights_holder', 'storyteller_with_custodian', 'recorder'],
  'consent.revoke': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian'],
  'consent.withdraw': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian'],
  'consent.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder', 'admin_break_glass'],
  'consent.evidence.upload': ['storyteller_rights_holder', 'storyteller_with_custodian', 'recorder'],
  'story.role.manage': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian'],
  'transcript.segment.edit': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer'],
  'transcript.flag.resolve': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer'],
  'transcript.review.complete': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer'],
  'transcript.flag.accept_uncertain': ['storyteller_rights_holder', 'rights_holder_custodian'],
  'transcript.approve': ['storyteller_rights_holder', 'rights_holder_custodian'],
  'translation.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'transcript_reviewer', 'translation_reviewer', 'admin_break_glass'],
  'translation.generate': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian'],
  'translation.segment.edit': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'translation_reviewer'],
  'translation.issue.manage': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'translation_reviewer'],
  'translation.approve': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'translation_reviewer'],
  'story.approve_final': ['storyteller_rights_holder', 'rights_holder_custodian'],
  'story.audience.change': ['storyteller_rights_holder', 'rights_holder_custodian'],
  'story.delete': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'platform_admin', 'admin_break_glass'],
  'story.export': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian'],
  'story.activity.read': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'platform_admin', 'admin_break_glass'],
  'glossary.propose': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder', 'transcript_reviewer', 'translation_reviewer', 'family_member', 'family_admin'],
  'glossary.approve': ['storyteller_rights_holder', 'rights_holder_custodian'],
  'story.metadata.edit': ['storyteller_rights_holder', 'rights_holder_custodian', 'recorder'],
  'admin.jobs': ['platform_admin', 'admin_break_glass'],
  'admin.break_glass': ['platform_admin', 'admin_break_glass'],
  'family.create': ['storyteller_rights_holder', 'storyteller_with_custodian', 'rights_holder_custodian', 'recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer', 'family_member', 'family_admin', 'outsider'],
  'family.read': ['family_member', 'family_admin'],
  'family.invite': ['family_admin'],
  'family.member.remove': ['family_admin'],
  'person.read': ['family_admin'],
  'person.create': [],
  'person.link_account': [],
  'story.create': ['storyteller_rights_holder', 'storyteller_with_custodian', 'recorder', 'family_member', 'family_admin'],
  'custodian.designate': ['storyteller_rights_holder'],
  'invitation.accept': [],
});

function resource(profile, changes = {}) {
  const storyteller = profile === 'storyteller_rights_holder' || profile === 'storyteller_with_custodian' ? ids.storyteller : 'other-storyteller';
  const rightsHolder = profile === 'storyteller_rights_holder' ? ids.storyteller : profile === 'rights_holder_custodian' ? ids.custodian : 'other-custodian';
  const actor = profiles[profile];
  return {
    actor: { userId: actor, accountRole: actor === ids.admin ? 'platform_admin' : 'member', status: 'active', secondFactorVerified: actor === ids.admin },
    resource: {
      storytellerUserId: storyteller, rightsHolderUserId: rightsHolder, recorderUserId: ids.recorder,
      actorStoryRoles: profile === 'transcript_reviewer' ? ['transcript_reviewer'] : profile === 'translation_reviewer' ? ['translation_reviewer'] : profile === 'viewer' ? ['viewer'] : [],
      actorCircleRole: profile === 'family_member' ? 'family_member' : profile === 'family_admin' ? 'family_admin' : 'none', storyStatus: 'approved', deletionRequesterUserId: null, audience: 'family', hasApprovedVersion: true, translationApproved: true,
      activeConsentScopes: new Set(['record_and_store', 'cross_border_processing', 'human_review', 'translation', 'share_family']),
      hasValidBreakGlassGrant: profile === 'admin_break_glass', assistedConsentSessionOpen: true, custodianAssistedConfirmationCurrent: true,
      firstStoryVersionApproved: false, audienceChange: 'widen', adminReadOnlyProjection: true, adminDeletionApproved: true, ...changes,
    },
  };
}

test('M1 policy matrix explicitly covers every action × role relationship', () => {
  assert.deepEqual(Object.keys(allowed).sort(), [...policyActions].sort(), 'each policy action needs an explicit expected role matrix');
  for (const action of policyActions) for (const profile of all) {
    const fixture = resource(profile);
    assert.equal(can(fixture.actor, action, fixture.resource), allowed[action].includes(profile), `${action} / ${profile}`);
  }
});

test('M1 policy conditions fail closed for ownership, scopes, audience, state, and account status', () => {
  let fixture = resource('viewer', { activeConsentScopes: new Set(['human_review']) });
  assert.equal(can(fixture.actor, 'story.audio.stream', fixture.resource), false, 'viewer needs the provisional share_family scope');
  fixture = resource('family_member', { audience: 'private' });
  assert.equal(can(fixture.actor, 'story.version.read', fixture.resource), false, 'family membership alone never grants private access');
  fixture = resource('family_member', { activeConsentScopes: new Set() });
  assert.equal(can(fixture.actor, 'story.audio.stream', fixture.resource), false, 'family access is revoked with share_family');
  fixture = resource('transcript_reviewer', { translationApproved: false, hasApprovedVersion: true });
  assert.equal(can(fixture.actor, 'translation.read', fixture.resource), false, 'an old story version never exposes a new draft translation');
  fixture = resource('storyteller_rights_holder', { translationApproved: false });
  assert.equal(can(fixture.actor, 'translation.generate', fixture.resource), false, 'translation generation requires an approved transcript');
  fixture = resource('transcript_reviewer', { translationApproved: true, hasApprovedVersion: false });
  assert.equal(can(fixture.actor, 'translation.read', fixture.resource), true, 'approved translation is visible before final story approval');
  fixture = resource('rights_holder_custodian', { custodianAssistedConfirmationCurrent: false });
  assert.equal(can(fixture.actor, 'story.audience.change', fixture.resource), false, 'custodian widening needs fresh confirmation');
  fixture = resource('storyteller_rights_holder', { activeConsentScopes: new Set() });
  assert.equal(can(fixture.actor, 'story.audience.change', fixture.resource), false, 'rights holder cannot widen without share_family consent');
  fixture = resource('rights_holder_custodian', { audienceChange: undefined });
  assert.equal(can(fixture.actor, 'story.audience.change', fixture.resource), false, 'ambiguous audience mutation fails closed');
  fixture = resource('storyteller_with_custodian', { audienceChange: 'narrow' });
  assert.equal(can(fixture.actor, 'story.audience.change', fixture.resource), true, 'storyteller can always narrow audience');
  fixture = resource('platform_admin');
  fixture.actor.status = 'closed';
  assert.equal(can(fixture.actor, 'admin.jobs', fixture.resource), false, 'closed account is denied even when admin');
  fixture = resource('outsider', { storytellerUserId: null, rightsHolderUserId: null });
  assert.equal(can({ ...fixture.actor, userId: null }, 'story.read', fixture.resource), false, 'malformed actor cannot claim null ownership');
  assert.equal(can(fixture.actor, 'hasOwnProperty', fixture.resource), false, 'unknown runtime action fails closed');
  fixture = resource('platform_admin', { actorStoryRoles: ['transcript_reviewer'] });
  assert.equal(can(fixture.actor, 'transcript.read', fixture.resource), false, 'admin role never inherits content access without break-glass');
  fixture = resource('admin_break_glass', { actorStoryRoles: ['transcript_reviewer'] });
  assert.equal(can(fixture.actor, 'transcript.segment.edit', fixture.resource), false, 'break-glass permits only the documented content reads');
  fixture = resource('admin_break_glass', { rightsHolderUserId: ids.admin });
  assert.equal(can(fixture.actor, 'story.audience.change', fixture.resource), false, 'admin status never inherits rights-holder write powers');
  fixture = resource('outsider', { actorCircleRole: undefined });
  assert.equal(can(fixture.actor, 'glossary.propose', fixture.resource), false, 'unknown circle role never grants access');
  fixture = resource('family_member', { storyStatus: 'deletion_pending', deletionRequesterUserId: ids.storyteller });
  assert.equal(can(fixture.actor, 'story.audio.stream', fixture.resource), false, 'deletion-pending content is inaccessible to non-requesters');
  fixture = resource('storyteller_rights_holder', { storyStatus: 'deletion_pending', deletionRequesterUserId: ids.storyteller });
  assert.equal(can(fixture.actor, 'story.delete', fixture.resource), true, 'requester may access the deletion cancel view');
  fixture = resource('outsider', { storyStatus: 'deletion_pending', deletionRequesterUserId: ids.outsider });
  assert.equal(can(fixture.actor, 'story.delete', fixture.resource), true, 'former authority retains only their own cancellation view');
  fixture = resource('platform_admin', { storyStatus: 'deletion_pending', deletionRequesterUserId: ids.admin });
  fixture.actor.secondFactorVerified = false;
  assert.equal(can(fixture.actor, 'story.delete', fixture.resource), false, 'admin requester still needs second factor');
});

test('M1 assertCan returns a typed server-side denial', () => {
  const fixture = resource('outsider');
  assert.throws(() => assertCan(fixture.actor, 'transcript.read', fixture.resource), (error) => error instanceof AuthorizationError && error.code === 'authorization_denied' && error.reason === 'missing_role');
});

test('M2 policy additions deny non-members and non-admin family members', () => {
  assert.equal(can(resource('family_admin').actor, 'family.invite', resource('family_admin').resource), true);
  assert.equal(can(resource('family_member').actor, 'family.invite', resource('family_member').resource), false);
  assert.equal(can(resource('outsider').actor, 'family.read', resource('outsider').resource), false);
  assert.equal(can(resource('outsider').actor, 'story.read', resource('outsider').resource), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'consent.create', resource('storyteller_rights_holder').resource), true);
  assert.equal(can(resource('family_member').actor, 'consent.create', resource('family_member').resource), false);
  assert.equal(can(resource('rights_holder_custodian').actor, 'consent.withdraw', resource('rights_holder_custodian').resource), true);
  assert.equal(can(resource('recorder').actor, 'consent.withdraw', resource('recorder').resource), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'person.create', { ...resource('storyteller_rights_holder').resource, personCreatorUserId: ids.storyteller }), true);
  assert.equal(can(resource('outsider').actor, 'person.create', { ...resource('outsider').resource, personCreatorUserId: ids.storyteller }), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'person.read', { ...resource('storyteller_rights_holder').resource, personCreatorUserId: ids.storyteller }), true);
  assert.equal(can(resource('outsider').actor, 'person.read', { ...resource('outsider').resource, personCreatorUserId: ids.storyteller }), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'person.link_account', { ...resource('storyteller_rights_holder').resource, invitationRecipientUserId: ids.storyteller }), true);
  assert.equal(can(resource('outsider').actor, 'person.link_account', { ...resource('outsider').resource, invitationRecipientUserId: ids.storyteller }), false);
  assert.equal(can(resource('family_admin').actor, 'story.create', resource('family_admin').resource), true);
  assert.equal(can(resource('outsider').actor, 'story.create', { ...resource('outsider').resource, actorCircleRole: 'none', storytellerUserId: 'different', recorderUserId: 'different' }), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'custodian.designate', resource('storyteller_rights_holder').resource), true);
  assert.equal(can(resource('storyteller_with_custodian').actor, 'custodian.designate', resource('storyteller_with_custodian').resource), false);
  assert.equal(can(resource('storyteller_rights_holder').actor, 'invitation.accept', { ...resource('storyteller_rights_holder').resource, invitationRecipientUserId: ids.storyteller }), true);
  assert.equal(can(resource('outsider').actor, 'invitation.accept', { ...resource('outsider').resource, invitationRecipientUserId: ids.storyteller }), false);
});
