import { createHash, randomUUID } from 'node:crypto';
import type { StoryResourceContext } from '@echoes-of-home/auth/policy';
import { createDrizzleM2Repository, type M2Consent, type M2Family, type M2Invitation, type M2Membership, type M2Repository, type M2Story, type M2StoryContext, type M2StoryRole } from '@echoes-of-home/database/m2-repository';
import type { Pool } from 'pg';

export const PLACEHOLDER_CONSENT_WARNING = 'PLACEHOLDER — not final consent text, not for real users';
export const placeholderConsentScript = Object.freeze({ language: 'en', version: '0.0.0-placeholder', warning: PLACEHOLDER_CONSENT_WARNING, cards: [{ key: 'what_we_do', text: `${PLACEHOLDER_CONSENT_WARNING}. We would like to record your story.` }] });

class InMemoryM2Repository implements M2Repository {
  readonly families = new Map<string, M2Family>(); readonly memberships = new Map<string, M2Membership>(); readonly persons = new Map<string, { id: string; displayName: string; preferredLanguage: 'xh' | 'en'; linkedUserId: string | null; createdByUserId: string }>(); readonly stories = new Map<string, M2Story>(); readonly storyRoles = new Map<string, M2StoryRole>(); readonly invitations = new Map<string, M2Invitation>(); readonly consents = new Map<string, M2Consent>();
  async createFamily(userId: string, name: string) { const id = randomUUID(); this.families.set(id, { id, name, createdByUserId: userId }); const membershipId = randomUUID(); this.memberships.set(membershipId, { id: membershipId, familyCircleId: id, userId, circleRole: 'family_admin' }); return this.families.get(id)!; }
  async listFamilies(userId: string) { return [...this.memberships.values()].filter((membership) => membership.userId === userId).map((membership) => this.families.get(membership.familyCircleId)).filter((family): family is M2Family => Boolean(family)); }
  async createPerson(userId: string, input: { displayName: string; preferredLanguage: 'xh' | 'en' }) { const person = { id: randomUUID(), ...input, linkedUserId: null, createdByUserId: userId }; this.persons.set(person.id, person); return person; }
  async createStory(userId: string, input: { familyCircleId: string; storytellerPersonId: string; title?: string }) { if (!this.families.has(input.familyCircleId) || !this.persons.has(input.storytellerPersonId)) throw new Error('not_found'); const story = { id: randomUUID(), familyCircleId: input.familyCircleId, storytellerPersonId: input.storytellerPersonId, rightsHolderPersonId: input.storytellerPersonId, createdByUserId: userId, title: input.title ?? null, status: 'draft' as const, audience: 'private' as const }; this.stories.set(story.id, story); const role = { id: randomUUID(), storyId: story.id, userId, role: 'recorder' as const, grantedByUserId: userId }; this.storyRoles.set(role.id, role); return story; }
  async getStory(storyId: string) { return this.stories.get(storyId) ?? null; }
  async getInvitation(id: string) { return this.invitations.get(id) ?? null; }
  async hasConsent(id: string) { return this.consents.has(id); }
  async hasConsentEvidenceMedia(assetId: string) { return [...this.consents.values()].some((record) => record.evidenceMediaAssetId === assetId); }
  async activeConsentScopes(storyId: string) { const consent = [...this.consents.values()].find((record) => record.storyId === storyId); return new Set(Object.entries(consent?.scopes ?? {}).filter(([, granted]) => granted).map(([scope]) => scope)); }
  async linkPerson(personId: string, userId: string) { const person = this.persons.get(personId); if (!person) throw new Error('not_found'); person.linkedUserId = userId; }
  async addMembership(membership: M2Membership) { this.memberships.set(membership.id, membership); }
  async invite(userId: string, input: { type: M2Invitation['type']; invitedEmail: string; familyCircleId?: string; storyId?: string; personId?: string }) { const token = randomUUID(); const invitation = { id: randomUUID(), type: input.type, familyCircleId: input.familyCircleId ?? null, storyId: input.storyId ?? null, personId: input.personId ?? null, invitedEmail: input.invitedEmail.toLowerCase(), token, createdByUserId: userId, status: 'pending' as const }; this.invitations.set(invitation.id, invitation); return { ...invitation, token: createHash('sha256').update(token).digest('hex') }; }
  async acceptInvitation(id: string, userId: string) { const invitation = this.invitations.get(id); if (!invitation || invitation.status !== 'pending') throw new Error('not_found'); invitation.status = 'accepted'; if (invitation.type === 'storyteller_account_link' && invitation.personId) { const person = this.persons.get(invitation.personId); if (person) person.linkedUserId = userId; } return invitation; }
  async recordConsent(storyId: string, input: Omit<M2Consent, 'id' | 'storyId'>) { const consent = { id: randomUUID(), storyId, ...input }; this.consents.set(consent.id, consent); return consent; }
  async withdrawConsent(storyId: string, userId: string) { const story = this.stories.get(storyId); if (!story) throw new Error('not_found'); const storyteller = this.persons.get(story.storytellerPersonId); if (storyteller?.linkedUserId !== userId && story.createdByUserId !== userId) throw new Error('authorization_denied'); const consent = [...this.consents.values()].find((record) => record.storyId === storyId); if (!consent) throw new Error('not_found'); this.consents.delete(consent.id); return { storyId, status: 'withdrawn' as const }; }
  async grantRole(storyId: string, userId: string, role: M2StoryRole['role'], grantedByUserId: string) { const item = { id: randomUUID(), storyId, userId, role, grantedByUserId }; this.storyRoles.set(item.id, item); return item; }
  async circleRole(userId: string, familyCircleId: string) { return [...this.memberships.values()].find((membership) => membership.userId === userId && membership.familyCircleId === familyCircleId)?.circleRole ?? 'none'; }
  async storyResource(userId: string, storyId: string): Promise<M2StoryContext> { const story = this.stories.get(storyId); if (!story) throw new Error('not_found'); const storytellerUserId = this.persons.get(story.storytellerPersonId)?.linkedUserId ?? null; const rightsHolderUserId = this.persons.get(story.rightsHolderPersonId)?.linkedUserId ?? null; const actorStoryRoles = [...this.storyRoles.values()].filter((role) => role.storyId === storyId && role.userId === userId).map((role) => role.role); return { storytellerUserId, rightsHolderUserId, recorderUserId: story.createdByUserId, actorStoryRoles, actorCircleRole: await this.circleRole(userId, story.familyCircleId), storyStatus: story.status, audience: story.audience }; }
}

export class M2FoundationService {
  private readonly allowPlaceholderConsent: boolean;
  private readonly repository: M2Repository;
  private evidenceMediaResolver: ((assetId: string) => Promise<{ assetId: string; storyId: string; recordingId: string; verified: boolean; playable: boolean } | null>) | null;
  constructor(options: { repository?: M2Repository; allowPlaceholderConsent?: boolean; evidenceMediaResolver?: (assetId: string) => Promise<{ assetId: string; storyId: string; recordingId: string; verified: boolean; playable: boolean } | null> } = {}) { this.repository = options.repository ?? new InMemoryM2Repository(); this.allowPlaceholderConsent = options.allowPlaceholderConsent === true; this.evidenceMediaResolver = options.evidenceMediaResolver ?? null; }
  setEvidenceMediaResolver(resolver: (assetId: string) => Promise<{ assetId: string; storyId: string; recordingId: string; verified: boolean; playable: boolean } | null>) { this.evidenceMediaResolver = resolver; }
  createFamily(userId: string, name: string) { return this.repository.createFamily(userId, name); }
  listFamilies(userId: string) { return this.repository.listFamilies(userId); }
  createPerson(userId: string, input: { displayName: string; preferredLanguage: 'xh' | 'en' }) { return this.repository.createPerson(userId, input); }
  createStory(userId: string, input: { familyCircleId: string; storytellerPersonId: string; title?: string }) { return this.repository.createStory(userId, input); }
  getStory(storyId: string) { return this.repository.getStory(storyId); }
  invite(userId: string, input: { type: M2Invitation['type']; invitedEmail: string; familyCircleId?: string; storyId?: string; personId?: string }) { return this.repository.invite(userId, input); }
  acceptInvitation(id: string, userId: string) { return this.repository.acceptInvitation(id, userId); }
  async recordConsent(storyId: string, input: Omit<M2Consent, 'id' | 'storyId' | 'scriptVersion'> & { scriptVersion?: string }, actorUserId = '00000000-0000-0000-0000-000000000001') { if (input.method === 'assisted_verbal') { if (!input.evidenceMediaAssetId) throw new Error('validation_failed'); const evidence = this.evidenceMediaResolver ? await this.evidenceMediaResolver(input.evidenceMediaAssetId) : null; if (!evidence) throw new Error('evidence_not_found'); if (!evidence.verified || !evidence.playable) throw new Error('evidence_unverified'); if (evidence.storyId !== storyId) throw new Error('evidence_story_mismatch'); if (await this.repository.hasConsentEvidenceMedia(input.evidenceMediaAssetId)) throw new Error('evidence_reused'); } const scriptVersion = input.scriptVersion ?? placeholderConsentScript.version; if (scriptVersion.includes('placeholder') && !this.allowPlaceholderConsent) throw new Error('placeholder_consent_script_forbidden'); return this.repository.recordConsent(storyId, { ...input, scriptVersion }, actorUserId).then((consent) => ({ ...consent, script: placeholderConsentScript })); }
  withdrawConsent(storyId: string, userId: string) { return this.repository.withdrawConsent(storyId, userId); }
  grantRole(storyId: string, userId: string, role: M2StoryRole['role'], grantedByUserId: string) { return this.repository.grantRole(storyId, userId, role, grantedByUserId); }
  circleRole(userId: string, familyCircleId: string): Promise<StoryResourceContext['actorCircleRole']> { return this.repository.circleRole(userId, familyCircleId); }
  storyResource(userId: string, storyId: string) { return this.repository.storyResource(userId, storyId); }
  getInvitation(id: string) { return this.repository.getInvitation(id); }
  hasConsent(id: string) { return this.repository.hasConsent(id); }
  activeConsentScopes(storyId: string) { return this.repository.activeConsentScopes(storyId); }
  linkPerson(personId: string, userId: string) { return this.repository.linkPerson(personId, userId); }
  addMembership(membership: M2Membership) { return this.repository.addMembership(membership); }
}

export function createDrizzleM2FoundationService(options: { pool: Pool; auditKey: Buffer; fieldKey: Buffer }) {
  return new M2FoundationService({ repository: createDrizzleM2Repository(options.pool, options.auditKey, options.fieldKey) });
}
