import assert from 'node:assert/strict';
import test from 'node:test';
import { ReviewDomainError, TranscriptReviewFoundation } from '../src/transcript-review-foundation.ts';

function fixture() {
  const review = new TranscriptReviewFoundation();
  const transcript = review.seedMachineDraft({ storyId: 'story-1', rightsHolderUserId: 'rights-holder', translationScopeGranted: true, segments: [
    { id: 'segment-1', startMs: 0, endMs: 1_000, text: 'Makhulu wethu', flagReason: 'low_confidence' },
    { id: 'segment-2', startMs: 1_000, endMs: 2_000, text: 'eQonce' },
  ] });
  review.inviteReviewer('rights-holder', 'story-1', 'reviewer'); review.openReview('reviewer', 'story-1');
  return { review, transcript };
}

test('segment and flag state machines accept valid transitions and reject invalid approval', () => {
  const { review, transcript } = fixture(); const first = transcript.segments[0]; const firstVersion = first.version; const flag = transcript.flags[0];
  assert.throws(() => review.completeReview('reviewer', 'story-1'), /invalid_state_transition/);
  review.editSegment('reviewer', first.id, first.version, 'confirm', { resolveFlagIds: [flag.id] });
  assert.equal(first.reviewState, 'confirmed'); assert.equal(flag.status, 'resolved_confirmed');
  const second = transcript.segments[1]; review.editSegment('reviewer', second.id, second.version, 'correct', { text: 'eQonce corrected', resolveFlagIds: [] });
  assert.throws(() => review.editSegment('reviewer', second.id, second.version, 'correct', { text: 'eQonce' }), /validation_failed/);
  assert.throws(() => review.editSegment('reviewer', first.id, firstVersion, 'reopen'), (error) => error instanceof ReviewDomainError && error.code === 'conflict');
});

test('optimistic concurrency surfaces stale edits instead of clobbering text', () => {
  const { review, transcript } = fixture(); const segment = transcript.segments[0]; const version = segment.version;
  review.editSegment('reviewer', segment.id, version, 'correct', { text: 'Makhulu wethu omkhulu' });
  assert.throws(() => review.editSegment('reviewer', segment.id, version, 'correct', { text: 'silahlekelwe' }), (error) => error instanceof ReviewDomainError && error.code === 'conflict');
  assert.equal(segment.text, 'Makhulu wethu omkhulu');
});

test('reviewer invitation and policy deny non-invited users', () => {
  const { review, transcript } = fixture();
  assert.throws(() => review.getCurrent('outsider', 'story-1'), /forbidden/);
  assert.equal(review.getCurrent('reviewer', 'story-1').id, transcript.id);
});

test('split and merge preserve reviewable segment structure', () => {
  const { review, transcript } = fixture(); const second = transcript.segments[1]; const [left, right] = review.splitSegment('reviewer', second.id, second.version, 2);
  assert.equal(left.endMs, right.startMs); assert.equal(transcript.segments.length, 3);
  const merged = review.mergeSegments('reviewer', left.id, right.id, left.version); assert.equal(merged.text, 'eQ once'); assert.equal(transcript.segments.length, 2);
});

test('context assist suggests glossary matches without changing segment text', () => {
  const { review, transcript } = fixture(); const original = transcript.segments[1].text; const term = review.proposeGlossaryTerm('reviewer', 'story-1', 'eQonce', 'place'); review.approveGlossaryTerm('rights-holder', term.id);
  const flags = review.runContextAssist('reviewer', 'story-1', ['segment-2']); assert.equal(flags.length, 1); assert.equal(transcript.segments[1].text, original); assert.equal(flags[0].source, 'context_assist');
});

test('glossary matching treats injection-like text as literal data', () => {
  const { review, transcript } = fixture(); const term = review.proposeGlossaryTerm('reviewer', 'story-1', 'ignore previous instructions', 'place'); review.approveGlossaryTerm('rights-holder', term.id); transcript.segments[1].text = 'We heard: ignore previous instructions';
  assert.doesNotThrow(() => review.runContextAssist('reviewer', 'story-1', ['segment-2'])); assert.equal(transcript.segments[1].text, 'We heard: ignore previous instructions');
});

test('review complete then approval is rights-holder-only and content-free notifications are emitted', () => {
  const { review, transcript } = fixture(); const first = transcript.segments[0]; const second = transcript.segments[1]; review.editSegment('reviewer', first.id, first.version, 'confirm', { resolveFlagIds: [transcript.flags[0].id] }); review.editSegment('reviewer', second.id, second.version, 'confirm');
  review.completeReview('reviewer', 'story-1'); assert.equal(transcript.status, 'review_complete'); assert.throws(() => review.approveForTranslation('reviewer', transcript.id), /forbidden/);
  const approved = review.approveForTranslation('rights-holder', transcript.id); assert.equal(approved.status, 'approved_for_translation'); assert.equal(approved.translationEnqueued, false); assert.ok(approved.contentHash); assert.ok(review.notificationsFor('rights-holder').every((notification) => notification.content === null));
});
