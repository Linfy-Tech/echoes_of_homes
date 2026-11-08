import { createHash, randomUUID } from 'node:crypto';
import type { ConsentScope, StoryResourceContext, StoryRole } from '@echoes-of-home/auth/policy';

export type Audience = 'private' | 'family' | 'public';
export type FinalStoryVersion = {
  id: string;
  storyId: string;
  versionNumber: number;
  status: 'approved' | 'superseded' | 'withdrawn';
  transcriptHash: string;
  translationHash: string | null;
  isiXhosaText: string;
  englishText: string | null;
  audioAssetId: string;
  provenance: Array<{ action: string; actorUserId: string; occurredAt: string }>;
};

type Story = {
  id: string;
  familyCircleId: string;
  storytellerUserId: string | null;
  rightsHolderUserId: string;
  custodianRightsHolder: boolean;
  status: 'final_review' | 'approved';
  audience: Audience;
  consentScopes: Set<ConsentScope>;
  custodianConfirmationAt: Date | null;
  viewerUserIds: Set<string>;
  familyMemberUserIds: Set<string>;
  transcriptApproved: boolean;
  translationApproved: boolean;
  isiXhosaText: string;
  englishText: string | null;
  audioAssetId: string;
  transcriptHash: string;
  translationHash: string | null;
  versions: FinalStoryVersion[];
};

export class FinalStoryDomainError extends Error {
  readonly code: 'not_found' | 'forbidden' | 'invalid_state_transition' | 'consent_missing' | 'conflict' | 'public_sharing_disabled' | 'audience_denied';
  constructor(code: FinalStoryDomainError['code'], message: string = code) { super(message); this.code = code; }
}

export class FinalApprovalReaderSharing {
  readonly stories = new Map<string, Story>();
  readonly audit: Array<{ storyId: string; action: string; actorUserId: string; occurredAt: string }> = [];
  private readonly publicSharingEnabled: boolean;

  constructor(options: { publicSharingEnabled?: boolean } = {}) { this.publicSharingEnabled = options.publicSharingEnabled === true; }

  registerStory(input: { storyId: string; familyCircleId: string; storytellerUserId: string | null; rightsHolderUserId: string; custodianRightsHolder?: boolean; transcriptApproved?: boolean; translationApproved?: boolean; consentScopes?: Iterable<ConsentScope>; isiXhosaText?: string; englishText?: string | null; audioAssetId?: string; transcriptHash?: string; translationHash?: string | null }): Story {
    const story: Story = {
      id: input.storyId, familyCircleId: input.familyCircleId, storytellerUserId: input.storytellerUserId, rightsHolderUserId: input.rightsHolderUserId,
      custodianRightsHolder: input.custodianRightsHolder ?? false, status: 'final_review', audience: 'private', consentScopes: new Set(input.consentScopes ?? []),
      custodianConfirmationAt: null, viewerUserIds: new Set(), familyMemberUserIds: new Set(), transcriptApproved: input.transcriptApproved ?? true,
      translationApproved: input.translationApproved ?? false, isiXhosaText: input.isiXhosaText ?? '', englishText: input.englishText ?? null,
      audioAssetId: input.audioAssetId ?? `audio-${input.storyId}`, transcriptHash: input.transcriptHash ?? createHash('sha256').update(input.isiXhosaText ?? '').digest('hex'),
      translationHash: input.translationHash ?? null, versions: [],
    };
    this.stories.set(story.id, story); return story;
  }

  addFamilyMember(storyId: string, userId: string): void { this.story(storyId).familyMemberUserIds.add(userId); }
  grantViewer(storyId: string, userId: string): void { this.story(storyId).viewerUserIds.add(userId); }
  revokeViewer(storyId: string, userId: string): void { this.story(storyId).viewerUserIds.delete(userId); }
  setConsentScopes(storyId: string, scopes: Iterable<ConsentScope>): void { this.story(storyId).consentScopes = new Set(scopes); }
  confirmCustodianAssistedShare(storyId: string, actorUserId: string): void { const story = this.story(storyId); if (story.rightsHolderUserId !== actorUserId || !story.custodianRightsHolder) throw new FinalStoryDomainError('forbidden'); story.custodianConfirmationAt = new Date(); }

  preview(actorUserId: string, storyId: string): FinalStoryVersion | Story {
    const story = this.story(storyId); if (story.rightsHolderUserId !== actorUserId && story.storytellerUserId !== actorUserId) throw new FinalStoryDomainError('forbidden');
    return story.versions[story.versions.length - 1] ?? { ...story, versions: [] };
  }

  approveFinal(actorUserId: string, storyId: string): FinalStoryVersion {
    const story = this.story(storyId); if (story.rightsHolderUserId !== actorUserId) throw new FinalStoryDomainError('forbidden');
    if (story.status !== 'final_review' || !story.transcriptApproved || (!story.translationApproved && story.englishText !== null && story.consentScopes.has('translation'))) throw new FinalStoryDomainError('invalid_state_transition');
    const previous = story.versions.at(-1); if (previous) previous.status = 'superseded';
    const occurredAt = new Date().toISOString();
    const provenance = [{ action: 'transcript_approved', actorUserId, occurredAt }, ...(story.translationApproved ? [{ action: 'translation_approved', actorUserId, occurredAt }] : []), { action: 'story_version_approved', actorUserId, occurredAt }];
    const version: FinalStoryVersion = { id: randomUUID(), storyId, versionNumber: story.versions.length + 1, status: 'approved', transcriptHash: story.transcriptHash, translationHash: story.translationHash, isiXhosaText: story.isiXhosaText, englishText: story.englishText, audioAssetId: story.audioAssetId, provenance };
    story.versions.push(version); story.status = 'approved'; this.record(storyId, 'story_version.approved', actorUserId); return version;
  }

  setAudience(actorUserId: string, storyId: string, audience: Audience): Story {
    const story = this.story(storyId); if (story.rightsHolderUserId !== actorUserId) throw new FinalStoryDomainError('forbidden');
    if (story.status !== 'approved') throw new FinalStoryDomainError('invalid_state_transition');
    if (audience === 'public' && !this.publicSharingEnabled) throw new FinalStoryDomainError('public_sharing_disabled');
    if (audience === 'family' && !story.consentScopes.has('share_family')) throw new FinalStoryDomainError('consent_missing');
    if (audience === 'family' && story.custodianRightsHolder && (!story.custodianConfirmationAt || Date.now() - story.custodianConfirmationAt.getTime() > 86_400_000)) throw new FinalStoryDomainError('consent_missing', 'custodian_confirmation_required');
    const previousAudience = story.audience;
    story.audience = audience;
    if (previousAudience === 'family' && audience === 'private') story.viewerUserIds.clear();
    this.record(storyId, 'story.audience_changed', actorUserId); return story;
  }

  resourceFor(actorUserId: string, storyId: string): StoryResourceContext {
    const story = this.story(storyId); const role: StoryRole[] = story.viewerUserIds.has(actorUserId) ? ['viewer'] : [];
    return { storytellerUserId: story.storytellerUserId, rightsHolderUserId: story.rightsHolderUserId, recorderUserId: null, actorStoryRoles: role, actorCircleRole: story.familyMemberUserIds.has(actorUserId) ? 'family_member' : 'none', storyStatus: story.status, deletionRequesterUserId: null, audience: story.audience, hasApprovedVersion: story.versions.some((version) => version.status === 'approved'), translationApproved: story.translationApproved, activeConsentScopes: story.consentScopes, hasValidBreakGlassGrant: false, assistedConsentSessionOpen: false, custodianAssistedConfirmationCurrent: Boolean(story.custodianConfirmationAt && Date.now() - story.custodianConfirmationAt.getTime() <= 86_400_000), firstStoryVersionApproved: story.versions.length > 0, adminReadOnlyProjection: false, adminDeletionApproved: false };
  }

  read(actorUserId: string, storyId: string): { version: FinalStoryVersion; audience: Audience; audioUrl: string } {
    const story = this.story(storyId); const version = story.versions.findLast((item) => item.status === 'approved'); if (!version) throw new FinalStoryDomainError('not_found');
    const owner = actorUserId === story.rightsHolderUserId || actorUserId === story.storytellerUserId;
    const namedViewer = story.viewerUserIds.has(actorUserId) && story.consentScopes.has('share_family');
    const family = story.audience === 'family' && story.familyMemberUserIds.has(actorUserId) && story.consentScopes.has('share_family');
    if (!owner && !namedViewer && !family) throw new FinalStoryDomainError('audience_denied');
    return { version, audience: story.audience, audioUrl: `/v1/stories/${encodeURIComponent(storyId)}/audio` };
  }

  private story(storyId: string): Story { const story = this.stories.get(storyId); if (!story) throw new FinalStoryDomainError('not_found'); return story; }
  private record(storyId: string, action: string, actorUserId: string): void { this.audit.push({ storyId, action, actorUserId, occurredAt: new Date().toISOString() }); }
}
