import { randomUUID } from 'node:crypto';
import type { AsrProvider, AsrSegment, AudioChunk } from '@echoes-of-home/ai-providers/asr';
import { chunkAudio, stitchSegments } from '@echoes-of-home/ai-providers/audio';

export type AsrJobStatus = 'queued' | 'waiting_budget' | 'running' | 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'cancelled';
export type AsrJob = { id: string; storyId: string; idempotencyKey: string; status: AsrJobStatus; attempts: number; maxAttempts: number; chunks: AudioChunk[]; transcriptId?: string };
export type StoredSegment = AsrSegment & { id: string; transcriptId: string; ordinal: number };
export type UncertaintyFlag = { id: string; transcriptId: string; segmentId: string; reason: 'low_confidence' | 'provider_uncertain'; source: 'asr_signal' | 'heuristic' };
export type ModelRun = { id: string; jobId: string; outcome: 'ok' | 'provider_error' | 'timeout' | 'cancelled'; inputUnits: number; createdAt: Date };
export type AsrStore = {
  jobs: Map<string, AsrJob>;
  transcripts: Map<string, { id: string; jobId: string; storyId: string; status: 'generating' | 'machine_draft' | 'failed' }>;
  segments: Map<string, StoredSegment[]>;
  modelRuns: ModelRun[];
  stepResults: Map<string, { text: string; segments: AsrSegment[] }>;
  uncertaintyFlags: UncertaintyFlag[];
  usageDailyMicros: number;
};

export function createAsrStore(): AsrStore { return { jobs: new Map(), transcripts: new Map(), segments: new Map(), modelRuns: [], stepResults: new Map(), uncertaintyFlags: [], usageDailyMicros: 0 }; }

/** Thresholds are deliberately supplied by configuration; M0 has not calibrated them. */
export type UncertaintyThresholds = { lowConfidence: number };
export function deriveUncertaintyFlags(transcriptId: string, segments: StoredSegment[], thresholds: UncertaintyThresholds): UncertaintyFlag[] {
  return segments.filter((segment) => segment.uncertain === true || (segment.confidence !== undefined && segment.confidence < thresholds.lowConfidence)).map((segment) => ({ id: randomUUID(), transcriptId, segmentId: segment.id, reason: segment.uncertain ? 'provider_uncertain' : 'low_confidence', source: segment.uncertain ? 'asr_signal' : 'heuristic' }));
}

export class AsrCircuitBreaker {
  private failures = 0;
  private calls = 0;
  private readonly options: { dailyBudgetMicros: number; callCostMicros: number; failureRate: number; minimumCalls?: number };
  constructor(options: { dailyBudgetMicros: number; callCostMicros: number; failureRate: number; minimumCalls?: number }) { this.options = options; }
  canCall(usageDailyMicros: number): boolean { return usageDailyMicros + this.options.callCostMicros <= this.options.dailyBudgetMicros && (this.calls < (this.options.minimumCalls ?? 3) || this.failures / this.calls < this.options.failureRate); }
  get callCostMicros(): number { return this.options.callCostMicros; }
  record(outcome: 'ok' | 'failure'): void { this.calls += 1; if (outcome === 'failure') this.failures += 1; }
}

export async function enqueueAsrJob(options: { store: AsrStore; storyId: string; idempotencyKey: string; audio: Uint8Array; durationMs: number; consentGate: () => Promise<boolean>; maxAttempts?: number }): Promise<AsrJob> {
  const existing = [...options.store.jobs.values()].find((job) => job.idempotencyKey === options.idempotencyKey);
  if (existing) return existing;
  if (!await options.consentGate()) throw new Error('consent_required');
  const job: AsrJob = { id: randomUUID(), storyId: options.storyId, idempotencyKey: options.idempotencyKey, status: 'queued', attempts: 0, maxAttempts: options.maxAttempts ?? 3, chunks: chunkAudio(options.audio, options.durationMs) };
  options.store.jobs.set(job.id, job);
  return job;
}

export async function runAsrJob(options: { store: AsrStore; jobId: string; provider: AsrProvider; breaker: AsrCircuitBreaker; consentGate: () => Promise<boolean>; uncertaintyThresholds?: UncertaintyThresholds; logger?: (event: string, fields: Record<string, unknown>) => void }): Promise<AsrJobStatus> {
  const { store, jobId, provider, breaker } = options;
  const job = store.jobs.get(jobId);
  if (!job) throw new Error('not_found');
  if (['succeeded', 'failed_permanent', 'cancelled'].includes(job.status)) return job.status;
  if (!await options.consentGate()) { job.status = 'cancelled'; return job.status; }
  if (!breaker.canCall(store.usageDailyMicros)) { job.status = 'waiting_budget'; return job.status; }
  job.status = 'running'; job.attempts += 1;
  const transcriptId = job.transcriptId ?? randomUUID(); job.transcriptId = transcriptId;
  store.transcripts.set(transcriptId, { id: transcriptId, jobId, storyId: job.storyId, status: 'generating' });
  const results: Array<{ chunk: AudioChunk; segments: AsrSegment[] }> = [];
  try {
    for (const chunk of job.chunks) {
      if (!await options.consentGate()) { job.status = 'cancelled'; return job.status; }
      const stepKey = `${job.id}:asr_chunk:${chunk.index}`;
      const previous = store.stepResults.get(stepKey);
      if (previous) { results.push({ chunk, segments: previous.segments }); continue; }
      try {
        const response = await provider.transcribe(chunk);
        breaker.record('ok'); store.usageDailyMicros += breaker.callCostMicros;
        store.modelRuns.push({ id: randomUUID(), jobId, outcome: 'ok', inputUnits: response.inputUnits ?? chunk.audio.byteLength, createdAt: new Date() });
        store.stepResults.set(stepKey, { text: response.text, segments: response.segments });
        results.push({ chunk, segments: response.segments });
        options.logger?.('asr.chunk.completed', { jobId, chunkIndex: chunk.index, outcome: 'ok' });
      } catch (error) {
        const timeout = error instanceof Error && error.message.includes('timeout');
        breaker.record('failure'); store.modelRuns.push({ id: randomUUID(), jobId, outcome: timeout ? 'timeout' : 'provider_error', inputUnits: chunk.audio.byteLength, createdAt: new Date() });
        options.logger?.('asr.chunk.failed', { jobId, chunkIndex: chunk.index, outcome: timeout ? 'timeout' : 'provider_error' });
        job.status = job.attempts >= job.maxAttempts ? 'failed_permanent' : 'failed_retryable';
        return job.status;
      }
    }
    const segments = stitchSegments(results).map((segment, ordinal) => ({ ...segment, id: randomUUID(), transcriptId, ordinal }));
    store.segments.set(transcriptId, segments); if (options.uncertaintyThresholds) store.uncertaintyFlags.push(...deriveUncertaintyFlags(transcriptId, segments, options.uncertaintyThresholds)); store.transcripts.get(transcriptId)!.status = 'machine_draft'; job.status = 'succeeded';
    return job.status;
  } catch {
    job.status = 'failed_permanent'; return job.status;
  }
}

