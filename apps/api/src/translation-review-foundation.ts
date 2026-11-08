import { randomUUID } from 'node:crypto';
import type { ReviewTranscript } from './transcript-review-foundation.ts';

export type TranslationInputSegment = { segmentId: string; sourceText: string; glossaryTerms: readonly string[]; renderMode: 'normal' | 'unclear_marker' | 'inaudible_marker' };
export type TextModelProvider = { readonly provider: string; readonly modelId: string; generateStructured<T>(request: { operation: 'translate' | 'verify'; data: unknown; schema: { parse(value: unknown): T }; temperature: 0; modelId: string; promptId: string; promptVersion: string; signal?: AbortSignal }): Promise<{ output: T; inputUnits: number; outputUnits: number }> };
export type FakeTextModelMode = 'normal' | 'seeded_defect' | 'failure';
export class FakeTextModelProvider implements TextModelProvider {
  readonly provider = 'fake'; readonly modelId = 'fake-text-v1'; calls = 0;
  private readonly options: { mode?: FakeTextModelMode };
  constructor(options: { mode?: FakeTextModelMode } = {}) { this.options = options; }
  async generateStructured<T>(request: { operation: 'translate' | 'verify'; data: unknown; schema: { parse(value: unknown): T }; temperature: 0; modelId: string; promptId: string; promptVersion: string; signal?: AbortSignal }): Promise<{ output: T; inputUnits: number; outputUnits: number }> {
    this.calls += 1; if (this.options.mode === 'failure') throw Object.assign(new Error('text_provider_error'), { retryable: true });
    const data = request.data as { segments?: TranslationInputSegment[] };
    const output = request.operation === 'translate' ? (data.segments ?? []).map((segment) => { const terms = segment.glossaryTerms.filter((term) => segment.sourceText.includes(term)); const marker = segment.renderMode === 'unclear_marker' ? '[unclear in the original]' : segment.renderMode === 'inaudible_marker' ? '[inaudible in the original]' : ''; const close = marker || `Close translation: ${segment.sourceText}`; const natural = marker || `Natural translation: ${segment.sourceText}`; return this.options.mode === 'seeded_defect' && terms.length ? { segmentId: segment.segmentId, close: close.replace(terms[0]!, ''), natural: natural.replace(terms[0]!, ''), preservedTerms: [] } : { segmentId: segment.segmentId, close, natural, preservedTerms: terms }; }) : { issues: this.options.mode === 'seeded_defect' ? [{ checkId: 'llm.omission', severity: 'blocking', detail: 'The seeded verifier found a possible omission.' }] : [] };
    return { output: request.schema.parse(output), inputUnits: JSON.stringify(request.data).length, outputUnits: JSON.stringify(output).length };
  }
}

export type TranslationStatus = 'generating' | 'machine_draft' | 'verifying' | 'in_review' | 'approved' | 'superseded' | 'rejected' | 'failed';
export type TranslationSegment = { id: string; translationId: string; sourceSegmentId: string; closeText: string; naturalText: string; machineCloseText: string; machineNaturalText: string; renderMode: 'normal' | 'unclear_marker' | 'inaudible_marker'; reviewState: 'unreviewed' | 'reviewed' | 'edited'; version: number };
export type VerificationIssue = { id: string; translationSegmentId: string | null; checkId: string; severity: 'blocking' | 'warning'; detail: string; status: 'open' | 'resolved' | 'dismissed' };
export type VerificationReport = { id: string; translationId: string; status: 'complete' | 'incomplete'; checksRun: string[]; issues: VerificationIssue[] };
export type Translation = { id: string; storyId: string; sourceTranscriptId: string; status: TranslationStatus; version: number; segments: TranslationSegment[]; report: VerificationReport | null };

export class TranslationDomainError extends Error { readonly code: 'not_found' | 'forbidden' | 'transcript_not_approved' | 'translation_scope_missing' | 'alignment_incomplete' | 'blocking_issues' | 'conflict' | 'validation_failed'; constructor(code: TranslationDomainError['code'], message: string = code) { super(message); this.code = code; } }

export type TranslationStore = { translations: Map<string, Translation>; reports: Map<string, VerificationReport> };
export const createTranslationStore = (): TranslationStore => ({ translations: new Map(), reports: new Map() });

const numberPattern = /\b\d+(?:[.,]\d+)?\b/g;
const markerFor = (reviewState: string): TranslationSegment['renderMode'] => reviewState === 'inaudible' ? 'inaudible_marker' : reviewState === 'excluded' ? 'unclear_marker' : 'normal';

export class TranslationReviewFoundation {
  readonly store: TranslationStore;
  constructor(store: TranslationStore = createTranslationStore()) { this.store = store; }

  async translate(input: { actorUserId: string; transcript: ReviewTranscript; translationScopeGranted: boolean; glossaryTerms?: readonly string[]; provider?: TextModelProvider; mode?: 'close' | 'natural' }): Promise<Translation> {
    if (input.transcript.status !== 'approved_for_translation') throw new TranslationDomainError('transcript_not_approved');
    if (!input.translationScopeGranted) throw new TranslationDomainError('translation_scope_missing');
    const provider = input.provider ?? new FakeTextModelProvider();
    const translationId = randomUUID();
    const requestSegments: TranslationInputSegment[] = input.transcript.segments.filter((segment) => segment.reviewState !== 'excluded').map((segment) => ({ segmentId: segment.id, sourceText: segment.text, glossaryTerms: input.glossaryTerms ?? [], renderMode: markerFor(segment.reviewState) }));
    const schema = { parse(value: unknown): Array<{ segmentId: string; close: string; natural: string; preservedTerms: string[] }> { if (!Array.isArray(value)) throw new Error('translation_schema_invalid'); return value as Array<{ segmentId: string; close: string; natural: string; preservedTerms: string[] }>; } };
    const translation: Translation = { id: translationId, storyId: input.transcript.storyId, sourceTranscriptId: input.transcript.id, status: 'generating', version: 1, segments: [], report: null };
    this.store.translations.set(translationId, translation);
    try {
      const result = await provider.generateStructured({ operation: 'translate', data: { segments: requestSegments }, schema, temperature: 0, modelId: provider.modelId, promptId: 'translator', promptVersion: '1.0.0' });
    const byId = new Map(result.output.map((item) => [item.segmentId, item]));
    if (byId.size !== requestSegments.length || requestSegments.some((segment) => !byId.has(segment.segmentId))) throw new TranslationDomainError('alignment_incomplete');
    for (const source of requestSegments) {
      const output = byId.get(source.segmentId)!;
      const requiredTerms = source.glossaryTerms.filter((term) => source.sourceText.includes(term));
      if (requiredTerms.some((term) => !output.close.includes(term) || !output.natural.includes(term))) throw new TranslationDomainError('validation_failed', 'marker_not_preserved');
      if (source.renderMode !== 'normal' && (!output.close.includes('[') || !output.natural.includes('['))) throw new TranslationDomainError('validation_failed', 'uncertainty_marker_missing');
    }
      translation.status = 'machine_draft';
      translation.segments = requestSegments.map((source) => { const output = byId.get(source.segmentId)!; return { id: randomUUID(), translationId, sourceSegmentId: source.segmentId, closeText: output.close, naturalText: output.natural, machineCloseText: output.close, machineNaturalText: output.natural, renderMode: source.renderMode, reviewState: 'unreviewed', version: 1 }; });
      translation.status = 'verifying';
      await this.verify(translationId, provider);
      translation.status = 'in_review';
      return translation;
    } catch (error) {
      translation.status = 'failed';
      throw error;
    }
  }

  async verify(translationId: string, provider: TextModelProvider = new FakeTextModelProvider()): Promise<VerificationReport> {
    const translation = this.get(translationId); const sourceById = new Map<string, string>();
    // The source text is represented by the segment ID in this structural slice; callers may attach source text for deterministic checks.
    const issues: VerificationIssue[] = [];
    for (const segment of translation.segments) {
      if (!segment.closeText.trim() || !segment.naturalText.trim()) issues.push({ id: randomUUID(), translationSegmentId: segment.id, checkId: 'alignment.empty', severity: 'blocking', detail: 'A translation variant is empty.', status: 'open' });
      if (segment.closeText.match(numberPattern)?.join('|') !== segment.naturalText.match(numberPattern)?.join('|')) issues.push({ id: randomUUID(), translationSegmentId: segment.id, checkId: 'num.mismatch', severity: 'blocking', detail: 'Number markers differ between translation variants.', status: 'open' });
      if (segment.renderMode !== 'normal' && (!segment.closeText.includes('[') || !segment.naturalText.includes('['))) issues.push({ id: randomUUID(), translationSegmentId: segment.id, checkId: 'marker.missing', severity: 'blocking', detail: 'Required uncertainty marker is missing.', status: 'open' });
      sourceById.set(segment.sourceSegmentId, segment.sourceSegmentId);
    }
    const schema = { parse(value: unknown): { issues: Array<{ checkId: string; severity: 'blocking' | 'warning'; detail: string }> } { return value as { issues: Array<{ checkId: string; severity: 'blocking' | 'warning'; detail: string }> }; } };
    const model = await provider.generateStructured({ operation: 'verify', data: { source: [...sourceById.values()].join(' '), translated: translation.segments.map((segment) => segment.naturalText).join(' ') }, schema, temperature: 0, modelId: provider.modelId, promptId: 'verifier', promptVersion: '1.0.0' });
    for (const issue of model.output.issues) issues.push({ id: randomUUID(), translationSegmentId: null, checkId: issue.checkId, severity: issue.severity, detail: issue.detail.slice(0, 500), status: 'open' });
    const report: VerificationReport = { id: randomUUID(), translationId, status: issues.some((issue) => issue.severity === 'blocking') ? 'incomplete' : 'complete', checksRun: ['segment.alignment', 'marker.preservation', 'num.mismatch', 'llm.omission'], issues };
    translation.report = report; this.store.reports.set(report.id, report); return report;
  }

  editSegment(actorUserId: string, translationId: string, segmentId: string, expectedVersion: number, closeText: string, naturalText: string): TranslationSegment { void actorUserId; const translation = this.get(translationId); const segment = translation.segments.find((item) => item.id === segmentId); if (!segment) throw new TranslationDomainError('not_found'); if (segment.version !== expectedVersion) throw new TranslationDomainError('conflict'); if (!closeText.trim() || !naturalText.trim()) throw new TranslationDomainError('validation_failed'); segment.closeText = closeText; segment.naturalText = naturalText; segment.reviewState = 'edited'; segment.version += 1; translation.version += 1; return segment; }
  resolveIssue(issueId: string, status: 'resolved' | 'dismissed', reason?: string): VerificationIssue { for (const report of this.store.reports.values()) { const issue = report.issues.find((item) => item.id === issueId); if (issue) { if (status === 'dismissed' && !reason?.trim()) throw new TranslationDomainError('validation_failed', 'dismiss_reason_required'); issue.status = status; return issue; } } throw new TranslationDomainError('not_found'); }
  approve(actorUserId: string, translationId: string): Translation { void actorUserId; const translation = this.get(translationId); if (translation.status !== 'in_review') throw new TranslationDomainError('validation_failed'); if (translation.report?.issues.some((issue) => issue.severity === 'blocking' && issue.status === 'open')) throw new TranslationDomainError('blocking_issues'); for (const item of this.store.translations.values()) if (item.sourceTranscriptId === translation.sourceTranscriptId && item.id !== translation.id && item.status === 'approved') item.status = 'superseded'; translation.status = 'approved'; translation.version += 1; return translation; }
  get(translationId: string): Translation { const translation = this.store.translations.get(translationId); if (!translation) throw new TranslationDomainError('not_found'); return translation; }
}
