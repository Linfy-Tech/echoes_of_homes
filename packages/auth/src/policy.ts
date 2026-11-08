export const policyActions = [
  'story.read', 'transcript.read', 'story.audio.stream', 'story.version.read',
  'recording.create', 'recording.read', 'recording.complete',
  'consent.create', 'consent.revoke', 'consent.withdraw', 'consent.read', 'consent.evidence.upload',
  'story.role.manage', 'transcript.segment.edit', 'transcript.flag.resolve', 'transcript.review.complete',
  'transcript.flag.accept_uncertain', 'transcript.approve', 'translation.read', 'translation.generate', 'translation.segment.edit',
  'translation.issue.manage', 'translation.approve', 'story.approve_final', 'story.audience.change',
  'story.delete', 'story.export', 'story.activity.read', 'glossary.propose', 'glossary.approve',
  'story.metadata.edit', 'admin.jobs', 'admin.break_glass',
  'family.create', 'family.read', 'family.invite', 'family.member.remove', 'person.read', 'person.create', 'person.link_account',
  'story.create', 'custodian.designate', 'invitation.accept',
] as const;

export type PolicyAction = typeof policyActions[number];
export type AccountRole = 'member' | 'platform_admin';
export type AccountStatus = 'active' | 'closing' | 'closed';
export type StoryRole = 'recorder' | 'transcript_reviewer' | 'translation_reviewer' | 'viewer';
export type ConsentScope = 'record_and_store' | 'cross_border_processing' | 'ai_transcription' | 'human_review' | 'translation' | 'share_family';
export type StoryStatus = 'draft' | 'ready_to_record' | 'uploading' | 'processing' | 'transcript_review' | 'transcript_approved' | 'translating' | 'translation_review' | 'final_review' | 'approved' | 'paused' | 'deletion_pending' | 'deleted';
export type DenialReason = 'actor_inactive' | 'missing_role' | 'consent_missing' | 'audience_excludes' | 'state_forbids';

export type Actor = Readonly<{
  userId: string;
  accountRole: AccountRole;
  status: AccountStatus;
  secondFactorVerified: boolean;
}>;

/** Fully loaded per-request snapshot; callers must not cache it across requests. */
export type StoryResourceContext = Readonly<{
  storytellerUserId: string | null;
  rightsHolderUserId: string | null;
  recorderUserId: string | null;
  actorStoryRoles: readonly StoryRole[];
  actorCircleRole: 'none' | 'family_member' | 'family_admin';
  storyStatus: StoryStatus;
  deletionRequesterUserId: string | null;
  audience: 'private' | 'family' | 'public';
  hasApprovedVersion: boolean;
  translationApproved: boolean;
  activeConsentScopes: ReadonlySet<ConsentScope>;
  hasValidBreakGlassGrant: boolean;
  assistedConsentSessionOpen: boolean;
  custodianAssistedConfirmationCurrent: boolean;
  firstStoryVersionApproved: boolean;
  audienceChange?: 'widen' | 'narrow';
  adminReadOnlyProjection: boolean;
  adminDeletionApproved: boolean;
  familyCircleRole?: 'none' | 'family_member' | 'family_admin';
  personCreatorUserId?: string | null;
  personLinkedUserId?: string | null;
  invitationCreatorUserId?: string | null;
  invitationRecipientUserId?: string | null;
}>;

export class AuthorizationError extends Error {
  readonly code = 'authorization_denied';
  readonly action: PolicyAction;
  readonly reason: DenialReason;
  constructor(action: PolicyAction, reason: DenialReason) {
    super(`Authorization denied: ${action} (${reason})`);
    this.name = 'AuthorizationError';
    this.action = action;
    this.reason = reason;
  }
}

type Predicate = (actor: Actor, resource: StoryResourceContext) => DenialReason | null;
const hasRole = (resource: StoryResourceContext, role: StoryRole) => resource.actorStoryRoles.includes(role);
const scope = (resource: StoryResourceContext, required: ConsentScope) => resource.activeConsentScopes.has(required);
const storyteller = (actor: Actor, resource: StoryResourceContext) => resource.storytellerUserId === actor.userId;
const rightsHolder = (actor: Actor, resource: StoryResourceContext) => resource.rightsHolderUserId === actor.userId;
const recorder = (actor: Actor, resource: StoryResourceContext) => resource.recorderUserId === actor.userId;
const storytellerIsRightsHolder = (actor: Actor, resource: StoryResourceContext) => storyteller(actor, resource) && rightsHolder(actor, resource);
const breakGlass = (actor: Actor, resource: StoryResourceContext) => actor.accountRole === 'platform_admin' && actor.secondFactorVerified && resource.hasValidBreakGlassGrant;
const approvedAudienceAccess = (resource: StoryResourceContext) => resource.hasApprovedVersion && scope(resource, 'share_family') && (hasRole(resource, 'viewer') || (resource.actorCircleRole === 'family_member' && resource.audience === 'family'));
const reviewAccess = (resource: StoryResourceContext) => hasRole(resource, 'transcript_reviewer') && scope(resource, 'human_review');
const translationReviewAccess = (resource: StoryResourceContext) => hasRole(resource, 'translation_reviewer') && scope(resource, 'human_review') && scope(resource, 'translation');
const isAdmin = (actor: Actor) => actor.accountRole === 'platform_admin' && actor.secondFactorVerified;

const allowIf = (allowed: (actor: Actor, resource: StoryResourceContext) => boolean, reason: DenialReason = 'missing_role'): Predicate => (actor, resource) => allowed(actor, resource) ? null : reason;
const policies: Readonly<Record<PolicyAction, Predicate>> = {
  'story.read': (actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource) || reviewAccess(resource) || translationReviewAccess(resource) || approvedAudienceAccess(resource) || breakGlass(actor, resource) || (isAdmin(actor) && resource.adminReadOnlyProjection) ? null : 'audience_excludes',
  'transcript.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource) || translationReviewAccess(resource) || breakGlass(actor, resource)),
  'story.audio.stream': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource) || translationReviewAccess(resource) || approvedAudienceAccess(resource) || breakGlass(actor, resource), 'audience_excludes'),
  'story.version.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource) || translationReviewAccess(resource) || approvedAudienceAccess(resource) || breakGlass(actor, resource), 'audience_excludes'),
  'recording.create': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource)),
  'recording.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource)),
  'recording.complete': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource)),
  'consent.create': allowIf((actor, resource) => storyteller(actor, resource) || (recorder(actor, resource) && resource.assistedConsentSessionOpen)),
  'consent.revoke': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource)),
  'consent.withdraw': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource)),
  'consent.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource) || breakGlass(actor, resource)),
  'consent.evidence.upload': allowIf((actor, resource) => resource.assistedConsentSessionOpen && (storyteller(actor, resource) || recorder(actor, resource))),
  'story.role.manage': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource)),
  'transcript.segment.edit': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource)),
  'transcript.flag.resolve': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource)),
  'transcript.review.complete': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || reviewAccess(resource)),
  'transcript.flag.accept_uncertain': allowIf((actor, resource) => storytellerIsRightsHolder(actor, resource) || rightsHolder(actor, resource)),
  'transcript.approve': allowIf((actor, resource) => storytellerIsRightsHolder(actor, resource) || rightsHolder(actor, resource)),
  'translation.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || translationReviewAccess(resource) || (reviewAccess(resource) && resource.translationApproved) || breakGlass(actor, resource)),
  'translation.generate': allowIf((actor, resource) => (storyteller(actor, resource) || rightsHolder(actor, resource)) && resource.translationApproved && scope(resource, 'translation')),
  'translation.segment.edit': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || translationReviewAccess(resource)),
  'translation.issue.manage': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || translationReviewAccess(resource)),
  'translation.approve': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || translationReviewAccess(resource)),
  'story.approve_final': allowIf((actor, resource) => storytellerIsRightsHolder(actor, resource) || rightsHolder(actor, resource)),
  'story.audience.change': (actor, resource) => {
    if (resource.audienceChange === 'narrow') return storyteller(actor, resource) || rightsHolder(actor, resource) ? null : 'missing_role';
    if (resource.audienceChange !== 'widen') return 'state_forbids';
    if (!rightsHolder(actor, resource)) return 'missing_role';
    if (!scope(resource, 'share_family')) return 'consent_missing';
    if (storytellerIsRightsHolder(actor, resource)) return null;
    return resource.custodianAssistedConfirmationCurrent ? null : 'consent_missing';
  },
  'story.delete': (actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || (isAdmin(actor) && resource.adminDeletionApproved) ? null : 'missing_role',
  'story.export': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource)),
  'story.activity.read': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || breakGlass(actor, resource) || (isAdmin(actor) && resource.adminReadOnlyProjection), 'audience_excludes'),
  'glossary.propose': allowIf((actor, resource) => storyteller(actor, resource) || rightsHolder(actor, resource) || recorder(actor, resource) || reviewAccess(resource) || translationReviewAccess(resource) || ['family_member', 'family_admin'].includes(resource.actorCircleRole)),
  'glossary.approve': allowIf((actor, resource) => storytellerIsRightsHolder(actor, resource) || rightsHolder(actor, resource)),
  'story.metadata.edit': allowIf((actor, resource) => rightsHolder(actor, resource) || (recorder(actor, resource) && !resource.firstStoryVersionApproved)),
  'family.read': allowIf((_actor, resource) => resource.actorCircleRole === 'family_member' || resource.actorCircleRole === 'family_admin'),
  'family.create': allowIf(() => true),
  'family.invite': allowIf((_actor, resource) => resource.actorCircleRole === 'family_admin'),
  'family.member.remove': allowIf((_actor, resource) => resource.actorCircleRole === 'family_admin'),
  'person.read': allowIf((actor, resource) => resource.personCreatorUserId === actor.userId || resource.personLinkedUserId === actor.userId || resource.actorCircleRole === 'family_admin'),
  'person.create': allowIf((actor, resource) => resource.personCreatorUserId === actor.userId),
  'person.link_account': allowIf((actor, resource) => resource.invitationRecipientUserId === actor.userId || resource.personCreatorUserId === actor.userId),
  'story.create': allowIf((actor, resource) => storyteller(actor, resource) || resource.actorCircleRole === 'family_member' || resource.actorCircleRole === 'family_admin' || resource.recorderUserId === actor.userId),
  'custodian.designate': allowIf((actor, resource) => storytellerIsRightsHolder(actor, resource)),
  'invitation.accept': allowIf((actor, resource) => resource.invitationRecipientUserId === actor.userId),
  'admin.jobs': allowIf((actor) => isAdmin(actor)),
  'admin.break_glass': allowIf((actor) => isAdmin(actor)),
};

function evaluate(actor: Actor | null | undefined, action: PolicyAction, resource: StoryResourceContext): DenialReason | null {
  if (!actor || typeof actor.userId !== 'string' || !actor.userId.length || actor.status !== 'active' || !['member', 'platform_admin'].includes(actor.accountRole) || typeof actor.secondFactorVerified !== 'boolean') return 'actor_inactive';
  if (!Object.hasOwn(policies, action)) return 'state_forbids';
  if (actor.accountRole === 'platform_admin' && !actor.secondFactorVerified) return 'missing_role';
  if (resource.storyStatus === 'deleted') return 'state_forbids';
  if (resource.storyStatus === 'deletion_pending') return action === 'story.delete' && resource.deletionRequesterUserId === actor.userId ? null : 'state_forbids';
  if (actor.accountRole === 'platform_admin') {
    if (!actor.secondFactorVerified) return 'missing_role';
    if (action === 'admin.jobs' || action === 'admin.break_glass') return null;
    if (action === 'story.delete') return resource.adminDeletionApproved ? null : 'missing_role';
    if (action === 'story.read' || action === 'story.activity.read') return breakGlass(actor, resource) || resource.adminReadOnlyProjection ? null : 'audience_excludes';
    if (['transcript.read', 'translation.read', 'story.audio.stream', 'story.version.read', 'consent.read'].includes(action)) return breakGlass(actor, resource) ? null : 'missing_role';
    return 'missing_role';
  }
  return policies[action](actor, resource);
}

/** Returns only an allow/deny boolean; reason codes stay server-side. */
export function can(actor: Actor | null | undefined, action: PolicyAction, resource: StoryResourceContext): boolean {
  return evaluate(actor, action, resource) === null;
}

export function assertCan(actor: Actor | null | undefined, action: PolicyAction, resource: StoryResourceContext): asserts actor is Actor {
  const reason = evaluate(actor, action, resource);
  if (reason) throw new AuthorizationError(action, reason);
}
