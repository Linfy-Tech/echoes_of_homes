import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FakeMediaStorageProvider, type MediaEvent, type MediaStorageProvider, sha256Hex, type ProviderRef } from '@echoes-of-home/media-storage';
import type { DrizzleWorkflowRepository } from '@echoes-of-home/database/workflow-repositories';

type RecordingStatus = 'pending_upload' | 'uploaded' | 'verifying' | 'verified' | 'failed' | 'abandoned';
type Recording = { id: string; storyId: string; status: RecordingStatus; declaredSha256: string; declaredSizeBytes: number; declaredMime: string; uploadId: string; uploadExpiresAt: Date; providerRef?: ProviderRef; assetId: string; role: 'original' | 'consent_evidence'; failureReason?: string; verifiedSha256?: string };
type Job = { id: string; storyId: string; recordingId: string; status: 'queued' | 'running' | 'succeeded' | 'failed_permanent' | 'cancelled'; createdAt: Date };

export class MediaDomainError extends Error { readonly code: 'consent_required' | 'invalid_state_transition' | 'upload_incomplete' | 'hash_mismatch' | 'not_found' | 'webhook_invalid' | 'job_cancelled' | 'validation_failed'; constructor(code: 'consent_required' | 'invalid_state_transition' | 'upload_incomplete' | 'hash_mismatch' | 'not_found' | 'webhook_invalid' | 'job_cancelled' | 'validation_failed', message = code) { super(message); this.code = code; } }

export type MediaFoundation = {
  createRecording(actorUserId: string, storyId: string, input: { source: 'browser_recording' | 'file_upload'; purpose?: 'story' | 'consent_evidence'; sha256: string; sizeBytes: number; mimeType: string }, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  uploadChunk(actorUserId: string, recordingId: string, chunk: Uint8Array, range: { start: number; end: number; total: number }, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  refreshUploadSession(actorUserId: string, recordingId: string, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  completeRecording(actorUserId: string, recordingId: string, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  getRecording(actorUserId: string, recordingId: string, authorize: () => Promise<void>): Promise<Record<string, unknown>>;
  getEvidenceMedia(assetId: string): Promise<{ assetId: string; storyId: string; recordingId: string; verified: boolean; playable: boolean } | null>;
  webhook(headers: Headers, body: Buffer): Promise<{ accepted: boolean }>;
  runVerifyJob(jobId: string): Promise<Record<string, unknown>>;
  cleanupAbandoned(now?: Date): Promise<{ abandoned: number }>;
  stream(actorUserId: string, storyId: string, range?: { start: number; end?: number }, authorize?: () => Promise<void>): Promise<Awaited<ReturnType<MediaStorageProvider['openStream']>>>;
  provider: MediaStorageProvider;
  recordings: Map<string, Recording>;
  jobs: Map<string, Job>;
};

type DurableMediaOptions = { provider?: MediaStorageProvider; consentScopes: (storyId: string) => Promise<ReadonlySet<string>>; workflowRepository: DrizzleWorkflowRepository };

/**
 * Database-backed media boundary used by the API when a workflow repository is
 * configured. The Map fields remain only as a compatibility surface for the
 * pre-durable test adapter; all authoritative reads and writes go through
 * Postgres and the worker job is enqueued transactionally by the repository.
 */
export function createDurableMediaFoundation(options: DurableMediaOptions): MediaFoundation {
  const provider = options.provider ?? new FakeMediaStorageProvider();
  const recordings = new Map<string, Recording>();
  const jobs = new Map<string, Job>();
  const pool = options.workflowRepository.pool;
  const consentGate = async (storyId: string) => {
    const scopes = await options.consentScopes(storyId);
    if (!scopes.has('record_and_store') || !scopes.has('cross_border_processing')) throw new MediaDomainError('consent_required');
  };
  const rowToRecording = (row: Record<string, unknown>): Recording => ({
    id: String(row.id), storyId: String(row.story_id), status: row.status as RecordingStatus,
    declaredSha256: Buffer.from(row.declared_sha256 as Uint8Array).toString('hex'), declaredSizeBytes: Number(row.declared_size_bytes),
    declaredMime: String(row.declared_mime), uploadId: String(row.upload_id ?? ''), uploadExpiresAt: new Date(String(row.upload_expires_at)),
    providerRef: row.provider_public_id ? { provider: String(row.provider) as ProviderRef['provider'], publicId: String(row.provider_public_id), resourceType: String(row.provider_resource_type) as ProviderRef['resourceType'], deliveryType: String(row.provider_delivery_type) as ProviderRef['deliveryType'] } : undefined,
    assetId: String(row.asset_id), role: row.role as Recording['role'], failureReason: row.failure_reason ? String(row.failure_reason) : undefined,
    verifiedSha256: row.verified_sha256 ? Buffer.from(row.verified_sha256 as Uint8Array).toString('hex') : undefined,
  });
  const load = async (recordingId: string) => {
    const result = await pool.query(`SELECT r.*, m.id AS asset_id, m.role, m.provider, m.provider_public_id, m.upload_id, m.provider_resource_type, m.provider_delivery_type FROM recordings r LEFT JOIN media_assets m ON m.recording_id=r.id AND m.role IN ('original','consent_evidence') WHERE r.id=$1`, [recordingId]);
    return result.rows[0] ? rowToRecording(result.rows[0]) : null;
  };
  return {
    provider, recordings, jobs,
    async createRecording(_actor, storyId, input, authorize) {
      await authorize(); if (input.purpose !== 'consent_evidence') await consentGate(storyId);
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.sizeBytes <= 0 || !input.mimeType.startsWith('audio/')) throw new MediaDomainError('validation_failed');
      const existing = await pool.query(`SELECT 1 FROM recordings WHERE story_id=$1 AND status NOT IN ('failed','abandoned','deleted')`, [storyId]);
      if (existing.rows.length) throw new MediaDomainError('invalid_state_transition');
      const id = randomUUID(); const assetId = randomUUID(); const role = input.purpose === 'consent_evidence' ? 'consent_evidence' : 'original';
      const upload = await provider.createUploadSession({ assetId, role, mimeType: input.mimeType, sizeBytes: input.sizeBytes, derivatives: [{ role: 'playback', format: 'mp3', bitrateKbps: 40, channels: 1 }] });
      const providerRef = { provider: upload.provider, publicId: upload.publicId, resourceType: 'video' as const, deliveryType: 'authenticated' as const };
      await options.workflowRepository.transaction(async (client) => {
        await client.query(`INSERT INTO recordings (id,story_id,status,source,declared_sha256,declared_size_bytes,declared_mime,upload_expires_at) VALUES ($1,$2,'pending_upload',$3,$4,$5,$6,$7)`, [id, storyId, input.source, Buffer.from(input.sha256, 'hex'), input.sizeBytes, input.mimeType, upload.expiresAt]);
        await client.query(`INSERT INTO media_assets (id,story_id,recording_id,role,provider,provider_public_id,upload_id,provider_resource_type,provider_delivery_type,size_bytes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`, [assetId, storyId, id, role, providerRef.provider, providerRef.publicId, upload.uploadId, providerRef.resourceType, providerRef.deliveryType, input.sizeBytes]);
      });
      return { recordingId: id, mediaAssetId: assetId, status: 'pending_upload', upload: { uploadId: upload.uploadId, chunkSizeBytes: upload.chunkSizeBytes, expiresAt: upload.expiresAt.toISOString() } };
    },
    async uploadChunk(_actor, recordingId, chunk, range, authorize) {
      await authorize(); const record = await load(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') throw new MediaDomainError('invalid_state_transition');
      const result = await provider.uploadChunk(record.uploadId, chunk, range) as { done: boolean; bytes: number; publicId?: string };
      if (result.publicId) await pool.query('UPDATE media_assets SET provider_public_id=$2 WHERE recording_id=$1', [recordingId, result.publicId]);
      return { recordingId, status: record.status, done: result.done, bytes: result.bytes };
    },
    async refreshUploadSession(_actor, recordingId, authorize) {
      await authorize(); const record = await load(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') throw new MediaDomainError('invalid_state_transition');
      const upload = await provider.refreshUploadSession(record.assetId); await pool.query('UPDATE media_assets SET provider_public_id=$2,upload_id=$3 WHERE id=$1', [record.assetId, upload.publicId, upload.uploadId]);
      return { recordingId, upload: { uploadId: upload.uploadId, chunkSizeBytes: upload.chunkSizeBytes, expiresAt: upload.expiresAt.toISOString() } };
    },
    async completeRecording(_actor, recordingId, authorize) {
      await authorize(); const record = await load(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') return { recordingId, status: record.status };
      const head = record.providerRef ? await provider.head(record.providerRef) : null; if (!head || head.bytes !== record.declaredSizeBytes) throw new MediaDomainError('upload_incomplete');
      const jobId = randomUUID(); await options.workflowRepository.transaction(async (client) => { await client.query(`UPDATE recordings SET status='uploaded',updated_at=now(),version=version+1 WHERE id=$1`, [recordingId]); await client.query(`UPDATE media_assets SET status='available' WHERE id=$1`, [record.assetId]); });
      if (record.role === 'consent_evidence') return { recordingId, status: 'uploaded' };
      await consentGate(record.storyId);
      await options.workflowRepository.enqueue({ id: jobId, storyId: record.storyId, type: 'asr.transcribe', inputRef: { recordingId, durationMs: 0 }, idempotencyKey: `asr:${recordingId}`, correlationId: `api:${recordingId}` });
      return { recordingId, status: 'uploaded', jobId };
    },
    async getRecording(_actor, recordingId, authorize) { await authorize(); const record = await load(recordingId); if (!record) throw new MediaDomainError('not_found'); return { recordingId: record.id, mediaAssetId: record.assetId, storyId: record.storyId, role: record.role, status: record.status, failureReason: record.failureReason ?? null, verifiedSha256: record.verifiedSha256 ?? null }; },
    async getEvidenceMedia(assetId) { const result = await pool.query(`SELECT r.id AS recording_id,r.story_id,r.status,m.id FROM media_assets m JOIN recordings r ON r.id=m.recording_id WHERE m.id=$1 AND m.role='consent_evidence'`, [assetId]); const row = result.rows[0]; return row ? { assetId, storyId: String(row.story_id), recordingId: String(row.recording_id), verified: row.status === 'verified', playable: row.status === 'verified' } : null; },
    async webhook() { return { accepted: true }; },
    async runVerifyJob(jobId) { const job = await options.workflowRepository.job(jobId); if (!job) throw new MediaDomainError('not_found'); return { jobId, status: String(job.status) }; },
    async cleanupAbandoned() { const result = await pool.query(`UPDATE recordings SET status='abandoned',updated_at=now() WHERE status='pending_upload' AND upload_expires_at < now()`); return { abandoned: result.rowCount ?? 0 }; },
    async stream(_actor, storyId, range, authorize) { await authorize?.(); const result = await pool.query(`SELECT m.provider,m.provider_public_id,m.provider_resource_type,m.provider_delivery_type FROM media_assets m JOIN recordings r ON r.id=m.recording_id WHERE m.story_id=$1 AND m.role='original' AND r.status='verified' LIMIT 1`, [storyId]); const row = result.rows[0]; if (!row) throw new MediaDomainError('not_found'); return provider.openStream({ provider: String(row.provider) as ProviderRef['provider'], publicId: String(row.provider_public_id), resourceType: String(row.provider_resource_type) as ProviderRef['resourceType'], deliveryType: String(row.provider_delivery_type) as ProviderRef['deliveryType'] }, range); },
  };
}

export function createMediaFoundation(options: { provider?: MediaStorageProvider; consentScopes: (storyId: string) => Promise<ReadonlySet<string>> } ): MediaFoundation {
  const provider = options.provider ?? new FakeMediaStorageProvider();
  const recordings = new Map<string, Recording>(); const jobs = new Map<string, Job>();
  const consentGate = async (storyId: string) => { const scopes = await options.consentScopes(storyId); if (!scopes.has('record_and_store') || !scopes.has('cross_border_processing')) throw new MediaDomainError('consent_required'); };
  const enqueue = async (recording: Recording) => { if (recording.role !== 'consent_evidence') await consentGate(recording.storyId); const id = randomUUID(); jobs.set(id, { id, storyId: recording.storyId, recordingId: recording.id, status: 'queued', createdAt: new Date() }); return id; };
  return {
    provider, recordings, jobs,
    async createRecording(_actorUserId, storyId, input, authorize) { await authorize(); if (input.purpose !== 'consent_evidence') await consentGate(storyId); if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.sizeBytes <= 0 || input.sizeBytes > 2_000_000_000 || !input.mimeType.startsWith('audio/')) throw new MediaDomainError('invalid_state_transition', 'validation_failed'); if ([...recordings.values()].some((recording) => recording.storyId === storyId && !['failed', 'abandoned'].includes(recording.status))) throw new MediaDomainError('invalid_state_transition'); const id = randomUUID(); const assetId = randomUUID(); const role = input.purpose === 'consent_evidence' ? 'consent_evidence' : 'original'; const upload = await provider.createUploadSession({ assetId, role, mimeType: input.mimeType, sizeBytes: input.sizeBytes, derivatives: [{ role: 'playback', format: 'mp3', bitrateKbps: 40, channels: 1 }] }); const record: Recording = { id, storyId, status: 'pending_upload', declaredSha256: input.sha256, declaredSizeBytes: input.sizeBytes, declaredMime: input.mimeType, uploadId: upload.uploadId, uploadExpiresAt: upload.expiresAt, providerRef: { provider: upload.provider, publicId: upload.publicId, resourceType: 'video', deliveryType: 'authenticated' }, assetId, role }; recordings.set(id, record); return { recordingId: id, mediaAssetId: assetId, status: record.status, upload: { uploadId: upload.uploadId, chunkSizeBytes: upload.chunkSizeBytes, expiresAt: upload.expiresAt.toISOString() } }; },
    async uploadChunk(_actorUserId, recordingId, chunk, range, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') throw new MediaDomainError('invalid_state_transition'); const result = await provider.uploadChunk(record.uploadId, chunk, range) as { done: boolean; bytes: number; publicId?: string }; if (result.publicId && record.providerRef) record.providerRef = { ...record.providerRef, publicId: result.publicId }; return { recordingId, status: record.status, done: result.done, bytes: result.bytes }; },
    async refreshUploadSession(_actorUserId, recordingId, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') throw new MediaDomainError('invalid_state_transition'); const upload = await provider.refreshUploadSession(record.assetId); record.uploadId = upload.uploadId; record.uploadExpiresAt = upload.expiresAt; return { recordingId, upload: { uploadId: upload.uploadId, chunkSizeBytes: upload.chunkSizeBytes, expiresAt: upload.expiresAt.toISOString() } }; },
    async completeRecording(_actorUserId, recordingId, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); if (record.status !== 'pending_upload') return { recordingId, status: record.status }; const head = record.providerRef ? await provider.head(record.providerRef) : null; if (!head || head.bytes !== record.declaredSizeBytes) throw new MediaDomainError('upload_incomplete'); record.status = 'uploaded'; const jobId = await enqueue(record); return { recordingId, status: record.status, jobId }; },
    async getRecording(_actorUserId, recordingId, authorize) { await authorize(); const record = recordings.get(recordingId); if (!record) throw new MediaDomainError('not_found'); return { recordingId: record.id, mediaAssetId: record.assetId, storyId: record.storyId, status: record.status, failureReason: record.failureReason ?? null, verifiedSha256: record.verifiedSha256 ?? null }; },
    async getEvidenceMedia(assetId) { const record = [...recordings.values()].find((item) => item.assetId === assetId); return record ? { assetId, storyId: record.storyId, recordingId: record.id, verified: record.status === 'verified', playable: record.status === 'verified' && Boolean(record.providerRef) } : null; },
    async webhook(headers, body) { const event = await provider.verifyNotification(headers, body); if (!event) throw new MediaDomainError('webhook_invalid'); const record = [...recordings.values()].find((item) => item.providerRef?.publicId === event.publicId); if (!record) return { accepted: true }; if (record.status === 'pending_upload') { record.status = 'uploaded'; await enqueue(record); } return { accepted: true }; },
    async runVerifyJob(jobId) { const job = jobs.get(jobId); if (!job) throw new MediaDomainError('not_found'); const record = recordings.get(job.recordingId); if (!record) throw new MediaDomainError('not_found'); if (['succeeded', 'cancelled'].includes(job.status)) return { jobId, status: job.status }; if (record.role !== 'consent_evidence') { try { await consentGate(job.storyId); } catch { job.status = 'cancelled'; return { jobId, status: job.status }; } } job.status = 'running'; record.status = 'verifying'; const head = record.providerRef ? await provider.head(record.providerRef) : null; if (!head || !head.hasAudio || head.bytes !== record.declaredSizeBytes) { record.status = 'failed'; record.failureReason = 'no_audio_stream'; job.status = 'failed_permanent'; return { jobId, status: job.status, recordingStatus: record.status }; } if (!record.providerRef) throw new MediaDomainError('not_found'); const workDir = await mkdtemp(join(tmpdir(), 'eoh-media-')); const filePath = join(workDir, 'asset'); try { const downloaded = await provider.download(record.providerRef, filePath); const bytes = await readFile(filePath); const verifiedSha256 = sha256Hex(bytes); record.verifiedSha256 = verifiedSha256; if (downloaded.bytes !== record.declaredSizeBytes || bytes.length !== record.declaredSizeBytes || verifiedSha256 !== record.declaredSha256) { record.status = 'failed'; record.failureReason = downloaded.bytes !== record.declaredSizeBytes || bytes.length !== record.declaredSizeBytes ? 'size_mismatch' : 'hash_mismatch'; job.status = 'failed_permanent'; return { jobId, status: job.status, recordingStatus: record.status }; } } finally { await rm(workDir, { recursive: true, force: true }); } record.status = 'verified'; job.status = 'succeeded'; return { jobId, status: job.status, recordingStatus: record.status }; },
    async cleanupAbandoned(now = new Date()) { let abandoned = 0; for (const record of recordings.values()) if (record.status === 'pending_upload' && record.uploadExpiresAt.getTime() < now.getTime()) { record.status = 'abandoned'; abandoned += 1; if (record.providerRef) await provider.deleteAsset(record.providerRef); } return { abandoned }; },
    async stream(_actorUserId, storyId, range, authorize) { await authorize?.(); const record = [...recordings.values()].find((item) => item.storyId === storyId && item.status === 'verified'); if (!record?.providerRef) throw new MediaDomainError('not_found'); return provider.openStream(record.providerRef, range); },
  };
}

export const hashBytes = sha256Hex;
