import { randomUUID } from 'node:crypto';
import { FakeMediaStorageProvider, type MediaEvent, type MediaStorageProvider, sha256Hex, type ProviderRef } from '@echoes-of-home/media-storage';

type RecordingStatus = 'pending_upload' | 'uploaded' | 'verifying' | 'verified' | 'failed' | 'abandoned';
type Recording = { id: string; storyId: string; status: RecordingStatus; declaredSha256: string; declaredSizeBytes: number; declaredMime: string; uploadExpiresAt: Date; providerRef?: ProviderRef; assetId: string; failureReason?: string; verifiedSha256?: string };
type Job = { id: string; storyId: string; recordingId: string; status: 'queued' | 'running' | 'succeeded' | 'failed_permanent' | 'cancelled'; createdAt: Date };

export class MediaDomainError extends Error { readonly code: 'consent_required' | 'invalid_state_transition' | 'upload_incomplete' | 'hash_mismatch' | 'not_found' | 'webhook_invalid' | 'job_cancelled' | 'validation_failed'; constructor(code: 'consent_required' | 'invalid_state_transition' | 'upload_incomplete' | 'hash_mismatch' | 'not_found' | 'webhook_invalid' | 'job_cancelled' | 'validation_failed', message = code) { super(message); this.code = code; } }

export type MediaFoundation = {
  createRecording(actorUserId: string, storyId: string, input: { source: 'browser_recording' | 'file_upload'; sha256: string; sizeBytes: number; mimeType: string }, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  completeRecording(actorUserId: string, recordingId: string, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  getRecording(actorUserId: string, recordingId: string, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  webhook(headers: Headers, body: Buffer): Promise<{ accepted: boolean }>;
  runVerifyJob(jobId: string): Promise<Record<string, unknown>>;
  cleanupAbandoned(now?: Date): Promise<{ abandoned: number }>;
  stream(actorUserId: string, storyId: string, range?: { start: number; end?: number }, authorize?: () => Promise<void>): Promise<Awaited<ReturnType<MediaStorageProvider['openStream']>>>;
  provider: MediaStorageProvider;
  recordings: Map<string, Recording>;
  jobs: Map<string, Job>;
};

export function createMediaFoundation(options: { provider?: MediaStorageProvider; consentScopes: (storyId: string) => Promise<ReadonlySet<string>> } ): MediaFoundation {
  const provider = options.provider ?? new FakeMediaStorageProvider();
  const recordings = new Map<string, Recording>(); const jobs = new Map<string, Job>();
  const consentGate = async (storyId: string) => { const scopes = await options.consentScopes(storyId); if (!scopes.has('record_and_store') || !scopes.has('cross_border_processing')) throw new MediaDomainError('consent_required'); };
  const enqueue = async (recording: Recording) => { await consentGate(recording.storyId); const id = randomUUID(); jobs.set(id, { id, storyId: recording.storyId, recordingId: recording.id, status: 'queued', createdAt: new Date() }); return id; };
  return {
    provider, recordings, jobs,
    async createRecording(_actorUserId, storyId, input, authorize) { await authorize(); await consentGate(storyId); if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.sizeBytes <= 0 || input.sizeBytes > 2_000_000_000 || !input.mimeType.startsWith('audio/')) throw new MediaDomainError('invalid_state_transition', 'validation_failed'); if ([...recordings.values()].some((recording) => recording.storyId === storyId && !['failed', 'abandoned'].includes(recording.status))) throw new MediaDomainError('invalid_state_transition'); const id = randomUUID(); const assetId = randomUUID(); const upload = await provider.createUploadSession({ assetId, role: 'original', mimeType: input.mimeType, sizeBytes: input.sizeBytes, derivatives: [{ role: 'playback', format: 'mp3', bitrateKbps: 40, channels: 1 }] }); const record: Recording = { id, storyId, status: 'pending_upload', declaredSha256: input.sha256, declaredSizeBytes: input.sizeBytes, declaredMime: input.mimeType, uploadExpiresAt: upload.expiresAt, providerRef: { provider: upload.provider, publicId: upload.publicId, resourceType: 'video', deliveryType: 'authenticated' }, assetId }; recordings.set(id, record); return { recordingId: id, status: record.status, upload: { uploadId: upload.uploadId, chunkSizeBytes: upload.chunkSizeBytes, expiresAt: upload.expiresAt.toISOString() } }; },
    async completeRecording(_actorUserId, recordingId, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') return { recordingId, status: record.status }; const head = record.providerRef ? await provider.head(record.providerRef) : null; if (!head || head.bytes !== record.declaredSizeBytes) throw new MediaDomainError('upload_incomplete'); record.status = 'uploaded'; const jobId = await enqueue(record); return { recordingId, status: record.status, jobId }; },
    async getRecording(_actorUserId, recordingId, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); return { recordingId: record.id, storyId: record.storyId, status: record.status, failureReason: record.failureReason ?? null, verifiedSha256: record.verifiedSha256 ?? null }; },
    async webhook(headers, body) { const event = await provider.verifyNotification(headers, body); if (!event) throw new MediaDomainError('webhook_invalid'); const record = [...recordings.values()].find((item) => item.providerRef?.publicId === event.publicId); if (!record) return { accepted: true }; if (record.status === 'pending_upload') { record.status = 'uploaded'; await enqueue(record); } return { accepted: true }; },
    async runVerifyJob(jobId) { const job = jobs.get(jobId); if (!job) throw new MediaDomainError('not_found'); const record = recordings.get(job.recordingId); if (!record) throw new MediaDomainError('not_found'); if (['succeeded', 'cancelled'].includes(job.status)) return { jobId, status: job.status }; try { await consentGate(job.storyId); } catch { job.status = 'cancelled'; return { jobId, status: job.status }; } job.status = 'running'; record.status = 'verifying'; const head = record.providerRef ? await provider.head(record.providerRef) : null; if (!head || !head.hasAudio || head.bytes !== record.declaredSizeBytes) { record.status = 'failed'; record.failureReason = 'no_audio_stream'; job.status = 'failed_permanent'; return { jobId, status: job.status, recordingStatus: record.status }; } record.verifiedSha256 = head.sha256; if (head.sha256 !== record.declaredSha256) { record.status = 'failed'; record.failureReason = 'hash_mismatch'; job.status = 'failed_permanent'; return { jobId, status: job.status, recordingStatus: record.status }; } record.status = 'verified'; job.status = 'succeeded'; return { jobId, status: job.status, recordingStatus: record.status }; },
    async cleanupAbandoned(now = new Date()) { let abandoned = 0; for (const record of recordings.values()) if (record.status === 'pending_upload' && record.uploadExpiresAt.getTime() < now.getTime()) { record.status = 'abandoned'; abandoned += 1; if (record.providerRef) await provider.deleteAsset(record.providerRef); } return { abandoned }; },
    async stream(_actorUserId, storyId, range, authorize) { await authorize?.(); const record = [...recordings.values()].find((item) => item.storyId === storyId && item.status === 'verified'); if (!record?.providerRef) throw new MediaDomainError('not_found'); return provider.openStream(record.providerRef, range); },
  };
}

export const hashBytes = sha256Hex;
