import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { DrizzleWorkflowRepository } from '@echoes-of-home/database/workflow-repositories';
import { FakeAsrProvider, type AsrProvider } from '@echoes-of-home/ai-providers/asr';
import { chunkAudio, stitchSegments } from '@echoes-of-home/ai-providers/audio';
import type { MediaStorageProvider, ProviderRef } from '@echoes-of-home/media-storage';

type ConsentGate = (storyId: string) => Promise<boolean>;
type Log = (event: string, fields: Record<string, unknown>) => void;

const jsonInput = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') throw new Error('invalid_job_input');
  return value as Record<string, unknown>;
};

const providerRef = (row: Record<string, unknown>): ProviderRef => ({
  provider: row.provider as 'fake' | 'cloudinary',
  publicId: String(row.provider_public_id),
  resourceType: row.provider_resource_type as 'video' | 'raw',
  deliveryType: 'authenticated',
});

/** Durable ASR task. Audio is loaded by the caller so the job payload never contains audio bytes. */
export async function runDurableAsrJob(options: {
  repo: DrizzleWorkflowRepository;
  processingJobId: string;
  provider?: AsrProvider;
  mediaProvider: MediaStorageProvider;
  consentGate: ConsentGate;
  dailyBudgetMicros?: number;
  callCostMicros?: number;
  uncertaintyThreshold?: number;
  logger?: Log;
}): Promise<'succeeded' | 'cancelled' | 'waiting_budget' | 'failed_retryable' | 'failed_permanent'> {
  const { repo, processingJobId, mediaProvider, consentGate } = options;
  const job = await repo.job(processingJobId);
  if (!job) throw new Error('processing_job_not_found');
  const storyId = String(job.story_id);
  const input = jsonInput(job.input_ref);
  const recordingId = String(input.recordingId);
  if (!await consentGate(storyId)) {
    await repo.transaction((client) => repo.updateJob(client, processingJobId, 'cancelled', 'consent_withdrawn'));
    return 'cancelled';
  }

  await repo.transaction((client) => repo.startJob(client, processingJobId));
  const running = await repo.job(processingJobId);
  if (!running || running.status !== 'running') return (running?.status as never) ?? 'failed_permanent';
  const source = await repo.recordingSource(recordingId);
  if (!source || source.story_id !== storyId || source.status !== 'verified') {
    await repo.transaction((client) => repo.updateJob(client, processingJobId, 'failed_permanent', 'recording_not_verified'));
    return 'failed_permanent';
  }

  const transcriptId = await repo.transcriptForJob(processingJobId) ?? randomUUID();
  await repo.transaction((client) => repo.createTranscript(client, { id: transcriptId, storyId, jobId: processingJobId }));
  const provider = options.provider ?? new FakeAsrProvider();
  const workingDir = await mkdtemp(join(tmpdir(), 'echoes-asr-'));
  try {
    const path = join(workingDir, 'recording.bin');
    await mediaProvider.download(providerRef(source), path);
    const { readFile } = await import('node:fs/promises');
    const audio = new Uint8Array(await readFile(path));
    const durationMs = Number(source.duration_ms ?? input.durationMs ?? 1);
    const chunks = chunkAudio(audio, durationMs);
    const results: Array<{ chunk: (typeof chunks)[number]; segments: Awaited<ReturnType<AsrProvider['transcribe']>>['segments'] }> = [];
    for (const chunk of chunks) {
      if (!await consentGate(storyId)) {
        await repo.transaction((client) => repo.updateJob(client, processingJobId, 'cancelled', 'consent_withdrawn'));
        return 'cancelled';
      }
      const previous = await repo.step(processingJobId, 'asr_chunk', chunk.index);
      if (previous) {
        results.push({ chunk, segments: previous.segments as typeof results[number]['segments'] });
        continue;
      }
      const admitted = await repo.transaction((client) => repo.reserveUsage(client, provider.provider, options.callCostMicros ?? 1, options.dailyBudgetMicros ?? 1_000_000));
      if (!admitted) {
        await repo.transaction((client) => repo.updateJob(client, processingJobId, 'waiting_budget', 'daily_budget_exhausted'));
        return 'waiting_budget';
      }
      try {
        const response = await provider.transcribe(chunk, { languageHints: ['xh'] });
        const modelRunId = randomUUID();
        const inputSha = Buffer.from(chunk.sha256, 'hex');
        await repo.transaction(async (client) => {
          await repo.createModelRun(client, { id: modelRunId, jobId: processingJobId, role: 'listener_asr', provider: provider.provider, modelId: provider.modelId, inputSha256: inputSha, inputUnits: response.inputUnits ?? chunk.audio.byteLength, outputUnits: response.outputUnits, outcome: 'ok' });
          await repo.writeStep(client, processingJobId, 'asr_chunk', chunk.index, { text: response.text, segments: response.segments }, modelRunId);
        });
        results.push({ chunk, segments: response.segments });
        options.logger?.('asr.chunk.completed', { processingJobId, chunkIndex: chunk.index });
      } catch (error) {
        const code = error instanceof Error && error.message.includes('timeout') ? 'provider_timeout' : 'provider_error';
        const current = await repo.job(processingJobId);
        const permanent = Number(current?.attempts ?? 0) >= Number(current?.max_attempts ?? 3);
        await repo.transaction(async (client) => {
          await repo.createModelRun(client, { id: randomUUID(), jobId: processingJobId, role: 'listener_asr', provider: provider.provider, modelId: provider.modelId, inputSha256: Buffer.from(chunk.sha256, 'hex'), inputUnits: chunk.audio.byteLength, outcome: code === 'provider_timeout' ? 'timeout' : 'provider_error' });
          await repo.updateJob(client, processingJobId, permanent ? 'failed_permanent' : 'failed_retryable', code);
        });
        options.logger?.('asr.chunk.failed', { processingJobId, chunkIndex: chunk.index, errorCode: code });
        if (!permanent) throw error;
        return 'failed_permanent';
      }
    }
    const stitched = stitchSegments(results).map((segment, ordinal) => ({ id: randomUUID(), ordinal, startMs: segment.startMs, endMs: segment.endMs, text: segment.text, confidence: segment.confidence, uncertain: segment.uncertain }));
    await repo.transaction(async (client) => {
      await repo.saveSegments(client, transcriptId, stitched);
      for (const segment of stitched.filter((item) => item.uncertain || (item.confidence !== undefined && item.confidence < (options.uncertaintyThreshold ?? 0.5)))) {
        await repo.saveFlag(client, { id: randomUUID(), transcriptId, segmentId: segment.id, reason: segment.uncertain ? 'provider_uncertain' : 'low_confidence', source: segment.uncertain ? 'asr_signal' : 'heuristic' });
      }
      await repo.saveTranscript(client, transcriptId, 'machine_draft');
      await repo.updateJob(client, processingJobId, 'succeeded');
    });
    return 'succeeded';
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}

/** Durable translation task; it intentionally remains provider-neutral and uses the shared fake adapter. */
export async function runDurableTranslationJob(options: { repo: DrizzleWorkflowRepository; processingJobId: string; logger?: Log }): Promise<'succeeded' | 'failed_permanent'> {
  const { repo, processingJobId } = options;
  const job = await repo.job(processingJobId);
  if (!job) throw new Error('processing_job_not_found');
  const input = jsonInput(job.input_ref);
  const transcriptId = String(input.transcriptId);
  const transcript = await repo.transcript(transcriptId);
  if (!transcript || transcript.status !== 'approved_for_translation') {
    await repo.transaction((client) => repo.updateJob(client, processingJobId, 'failed_permanent', 'transcript_not_approved'));
    return 'failed_permanent';
  }
  const translationId = String(input.translationId ?? randomUUID());
  const sourceSegments = await repo.transcriptSegments(transcriptId);
  const { FakeTextModelProvider } = await import('@echoes-of-home/ai-providers/text');
  const provider = new FakeTextModelProvider();
  await repo.transaction((client) => repo.startJob(client, processingJobId));
  await repo.transaction((client) => repo.createTranslation(client, { id: translationId, storyId: String(job.story_id), transcriptId }));
  await repo.transaction((client) => repo.updateTranslation(client, translationId, 'machine_draft'));
  let response: Awaited<ReturnType<typeof provider.generateStructured<Array<{ segmentId: string; close: string; natural: string }>>>>;
  try {
    response = await provider.generateStructured({
      operation: 'translate',
      data: { segments: sourceSegments.map((segment) => ({ segmentId: segment.id, sourceText: segment.text, glossaryTerms: [], renderMode: 'normal' as const })) },
      schema: { parse: (value: unknown) => value as Array<{ segmentId: string; close: string; natural: string }> },
      temperature: 0,
      modelId: provider.modelId,
      promptId: 'translation.v1',
      promptVersion: '1',
    });
  } catch (error) {
    const current = await repo.job(processingJobId);
    const permanent = Number(current?.attempts ?? 0) >= Number(current?.max_attempts ?? 3);
    await repo.transaction(async (client) => { await repo.updateTranslation(client, translationId, 'failed'); await repo.updateJob(client, processingJobId, permanent ? 'failed_permanent' : 'failed_retryable', 'provider_error'); });
    if (!permanent) throw error;
    return 'failed_permanent';
  }
  for (const segment of response.output) await repo.transaction((client) => repo.saveTranslationSegment(client, { id: randomUUID(), translationId, sourceSegmentId: segment.segmentId, close: segment.close, natural: segment.natural }));
  await repo.transaction((client) => repo.updateTranslation(client, translationId, 'verifying'));
  await repo.transaction((client) => repo.saveVerification(client, { id: randomUUID(), translationId, status: 'complete', issues: [] }));
  await repo.transaction(async (client) => { await repo.updateTranslation(client, translationId, 'in_review'); await repo.updateJob(client, processingJobId, 'succeeded'); });
  options.logger?.('translation.completed', { processingJobId, translationId, segmentCount: sourceSegments.length });
  return 'succeeded';
}

export const defaultDurableAsrProvider = () => new FakeAsrProvider();
