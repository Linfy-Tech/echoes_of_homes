import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { buildServer } from '../src/server.ts';
import { LocalAuthService } from '../src/auth-service.ts';
import { M2FoundationService, PLACEHOLDER_CONSENT_WARNING } from '../src/m2-foundation.ts';

async function signedIn(app, auth, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email } });
  const verified = await app.inject({ method: 'POST', url: '/v1/auth/challenges/verify', payload: { email, otp: auth.delivered.get(email) } });
  return { cookie: verified.headers['set-cookie'], userId: verified.json().user.id };
}

test('M2 foundation creates a private draft story and placeholder consent', async (t) => {
  const auth = new LocalAuthService(); const foundation = new M2FoundationService({ allowPlaceholderConsent: true }); const app = buildServer({ auth, foundation }); await app.ready(); t.after(() => app.close());
  const signedInUser = await signedIn(app, auth, 'm2@example.invalid'); const cookie = signedInUser.cookie; const headers = { cookie, origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' };
  const family = await app.inject({ method: 'POST', url: '/v1/families', headers, payload: { name: 'Synthetic family' } }); assert.equal(family.statusCode, 201);
  const person = await app.inject({ method: 'POST', url: '/v1/persons', headers, payload: { displayName: 'Synthetic storyteller', preferredLanguage: 'en' } }); assert.equal(person.statusCode, 201);
  await foundation.linkPerson(person.json().id, signedInUser.userId);
  const story = await app.inject({ method: 'POST', url: '/v1/stories', headers, payload: { familyCircleId: family.json().id, storytellerPersonId: person.json().id } }); assert.equal(story.statusCode, 201); assert.equal(story.json().audience, 'private'); assert.equal(story.json().status, 'draft');
  const consent = await app.inject({ method: 'POST', url: `/v1/stories/${story.json().id}/consent`, headers, payload: { method: 'self_digital', comprehensionResult: { questions: 3, correct: 2, reexplained: true }, rightsHolderChoice: 'self', scopes: { record_and_store: true } } });
  assert.equal(consent.statusCode, 201); assert.equal(consent.json().script.warning, PLACEHOLDER_CONSENT_WARNING);
  const outsider = await signedIn(app, auth, 'm2-outsider@example.invalid');
  const outsiderResponse = await app.inject({ method: 'GET', url: `/v1/stories/${story.json().id}`, headers: { cookie: outsider.cookie } });
  assert.equal(outsiderResponse.statusCode, 403, 'a non-member cannot read story metadata');
  const memberId = (await signedIn(app, auth, 'm2-member@example.invalid')).userId;
  await foundation.addMembership({ id: crypto.randomUUID(), familyCircleId: family.json().id, userId: memberId, circleRole: 'family_member' });
  const memberCookie = (await signedIn(app, auth, 'm2-member@example.invalid')).cookie;
  const memberInvite = await app.inject({ method: 'POST', url: '/v1/invitations', headers: { cookie: memberCookie, origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' }, payload: { type: 'family_member', invitedEmail: 'other@example.invalid', familyCircleId: family.json().id } });
  assert.equal(memberInvite.statusCode, 403, 'a family member cannot invite');
});

test('assisted consent requires evidence and protected routes deny anonymous users', async (t) => {
  const auth = new LocalAuthService(); const app = buildServer({ auth, foundation: new M2FoundationService({ allowPlaceholderConsent: true }) }); await app.ready(); t.after(() => app.close());
  const denied = await app.inject({ method: 'POST', url: '/v1/families', payload: { name: 'No session' } }); assert.equal(denied.statusCode, 401);
  const cookie = (await signedIn(app, auth, 'm2-assisted@example.invalid')).cookie; const headers = { cookie, origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' };
  const family = await app.inject({ method: 'POST', url: '/v1/families', headers, payload: { name: 'Synthetic family' } });
  const person = await app.inject({ method: 'POST', url: '/v1/persons', headers, payload: { displayName: 'Synthetic storyteller' } });
  const story = await app.inject({ method: 'POST', url: '/v1/stories', headers, payload: { familyCircleId: family.json().id, storytellerPersonId: person.json().id } });
  const response = await app.inject({ method: 'POST', url: `/v1/stories/${story.json().id}/consent`, headers, payload: { method: 'assisted_verbal', comprehensionResult: { questions: 3, correct: 0, reexplained: false }, rightsHolderChoice: 'custodian', scopes: {} } });
  assert.equal(response.statusCode, 400); assert.equal(response.json().code, 'validation_failed');
});

test('placeholder consent records are rejected without the explicit test opt-in', async () => {
  const foundation = new M2FoundationService();
  const family = await foundation.createFamily('user-1', 'Synthetic family');
  const person = await foundation.createPerson('user-1', { displayName: 'Synthetic storyteller', preferredLanguage: 'en' });
  const story = await foundation.createStory('user-1', { familyCircleId: family.id, storytellerPersonId: person.id });
  assert.throws(() => foundation.recordConsent(story.id, {
    method: 'self_digital', evidenceMediaAssetId: null,
    comprehensionResult: { questions: 3, correct: 3, reexplained: false },
    rightsHolderChoice: 'self', scopes: {},
  }), /placeholder_consent_script_forbidden/);
});

test('in-memory consent creation rejects assisted consent without evidence', async () => {
  const foundation = new M2FoundationService({ allowPlaceholderConsent: true });
  const family = await foundation.createFamily('user-1', 'Synthetic family');
  const person = await foundation.createPerson('user-1', { displayName: 'Synthetic storyteller', preferredLanguage: 'en' });
  const story = await foundation.createStory('user-1', { familyCircleId: family.id, storytellerPersonId: person.id });
  assert.throws(() => foundation.recordConsent(story.id, {
    method: 'assisted_verbal', evidenceMediaAssetId: null,
    comprehensionResult: { questions: 3, correct: 3, reexplained: false },
    rightsHolderChoice: 'custodian', scopes: {},
  }), /validation_failed/);
});
