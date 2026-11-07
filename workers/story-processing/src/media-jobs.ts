import type { MediaStorageProvider, ProviderRef } from '@echoes-of-home/media-storage';

type PoolClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, string | number | Buffer | null>> }> };

export type MediaVerifyInput = { processingJobId: string; storyId: string; recordingId: string; requiredScopes: readonly string[]; correlationId: string };

/** Must be called on the same SQL transaction as the domain state change. */
export async function enqueueMediaVerify(client: PoolClient, input: MediaVerifyInput, consentGate: (client: PoolClient, storyId: string, scopes: readonly string[]) => Promise<void>): Promise<void> {
  await consentGate(client, input.storyId, input.requiredScopes);
  await client.query(`INSERT INTO processing_jobs (id, story_id, type, status, input_ref, idempotency_key, correlation_id) VALUES ($1, $2, 'media.verify', 'queued', $3::jsonb, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`, [input.processingJobId, input.storyId, JSON.stringify({ recordingId: input.recordingId }), `media.verify:${input.recordingId}`, input.correlationId]);
  await client.query(`SELECT graphile_worker.add_job('media.verify', $1::json, job_key := $2)`, [JSON.stringify({ processingJobId: input.processingJobId }), input.processingJobId]);
}

/** Worker wrapper: the second consent check happens immediately before any provider read. */
export async function verifyMediaAtJobStart(client: PoolClient, provider: MediaStorageProvider, input: { processingJobId: string; storyId: string; recordingId: string }, consentGate: (client: PoolClient, storyId: string, scopes: readonly string[]) => Promise<boolean>): Promise<'cancelled' | 'succeeded' | 'failed_permanent'> {
  if (!await consentGate(client, input.storyId, ['record_and_store', 'cross_border_processing'])) { await client.query(`UPDATE processing_jobs SET status='cancelled', finished_at=now() WHERE id=$1 AND status='queued'`, [input.processingJobId]); return 'cancelled'; }
  await client.query(`UPDATE processing_jobs SET status='running', attempts=attempts+1, started_at=now() WHERE id=$1 AND status='queued'`, [input.processingJobId]);
  const row = (await client.query(`SELECT r.declared_sha256, r.declared_size_bytes, m.provider, m.provider_public_id, m.provider_resource_type, m.provider_delivery_type FROM recordings r JOIN media_assets m ON m.recording_id=r.id AND m.role='original' WHERE r.id=$1`, [input.recordingId])).rows[0];
  if (!row) { await client.query(`UPDATE processing_jobs SET status='failed_permanent', last_error_code='not_found', finished_at=now() WHERE id=$1`, [input.processingJobId]); return 'failed_permanent'; }
  const ref: ProviderRef = { provider: row.provider as ProviderRef['provider'], publicId: String(row.provider_public_id), resourceType: row.provider_resource_type as ProviderRef['resourceType'], deliveryType: 'authenticated' };
  const head = await provider.head(ref);
  const declaredHash = row.declared_sha256 instanceof Buffer ? row.declared_sha256.toString('hex') : String(row.declared_sha256 ?? '');
  if (!head || head.bytes !== Number(row.declared_size_bytes) || head.sha256 !== declaredHash) { await client.query(`UPDATE recordings SET status='failed', failure_reason='hash_mismatch', verified_sha256=$2 WHERE id=$1`, [input.recordingId, head ? Buffer.from(head.sha256, 'hex') : null]); await client.query(`UPDATE processing_jobs SET status='failed_permanent', last_error_code='hash_mismatch', finished_at=now() WHERE id=$1`, [input.processingJobId]); return 'failed_permanent'; }
  await client.query(`UPDATE recordings SET status='verified', verified_sha256=$2, updated_at=now() WHERE id=$1`, [input.recordingId, Buffer.from(head.sha256, 'hex')]); await client.query(`UPDATE processing_jobs SET status='succeeded', finished_at=now() WHERE id=$1`, [input.processingJobId]); return 'succeeded';
}

export async function abandonExpiredUploads(client: PoolClient, provider: MediaStorageProvider, now = new Date()): Promise<number> {
  const rows = (await client.query(`SELECT r.id, m.provider, m.provider_public_id, m.provider_resource_type, m.provider_delivery_type FROM recordings r LEFT JOIN media_assets m ON m.recording_id=r.id AND m.role='original' WHERE r.status='pending_upload' AND r.upload_expires_at < $1 FOR UPDATE`, [now])).rows;
  for (const row of rows) { if (row.provider_public_id) await provider.deleteAsset({ provider: row.provider as ProviderRef['provider'], publicId: String(row.provider_public_id), resourceType: row.provider_resource_type as ProviderRef['resourceType'], deliveryType: 'authenticated' }); await client.query(`UPDATE recordings SET status='abandoned', updated_at=now() WHERE id=$1 AND status='pending_upload'`, [row.id]); }
  return rows.length;
}
