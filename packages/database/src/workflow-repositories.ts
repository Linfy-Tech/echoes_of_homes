import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import * as schema from './schema.ts';

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type DrizzleClient = ReturnType<typeof drizzle>;

const tx = async <T>(pool: Pool, work: (client: PoolClient, db: DrizzleClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client, drizzle(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export type DurableJobStatus = 'queued' | 'waiting_budget' | 'running' | 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'cancelled';
export type DurableAsrInput = { recordingId: string; durationMs: number };
export type DurableTranslationInput = { transcriptId: string; glossaryTerms: string[] };

export class DrizzleWorkflowRepository {
  readonly db;
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; this.db = drizzle(pool); }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return tx(this.pool, async (client) => work(client));
  }

  async enqueue(input: { id: string; storyId: string; type: 'asr.transcribe' | 'translation.generate' | 'translation.verify'; inputRef: DurableAsrInput | DurableTranslationInput; idempotencyKey: string; correlationId: string; maxAttempts?: number }): Promise<void> {
    await tx(this.pool, async (client, db) => {
      await db.insert(schema.processingJobs).values({ id: input.id, storyId: input.storyId, type: input.type, status: 'queued', inputRef: input.inputRef, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, maxAttempts: input.maxAttempts ?? 3 }).onConflictDoNothing({ target: schema.processingJobs.idempotencyKey });
      await client.query('SELECT graphile_worker.add_job($1, $2::json, job_key := $3, max_attempts := $4)', [input.type, JSON.stringify({ processingJobId: input.id }), input.id, input.maxAttempts ?? 3]);
    });
  }

  async recoverInFlightJobs(): Promise<number> {
    return tx(this.pool, async (client) => {
      const result = await client.query(`UPDATE processing_jobs SET status='queued', last_error_code='worker_restart' WHERE status='running' AND type IN ('asr.transcribe','translation.generate','translation.verify') RETURNING id,type`);
      for (const row of result.rows) await client.query('SELECT graphile_worker.add_job($1, $2::json, job_key := $3)', [row.type, JSON.stringify({ processingJobId: row.id }), row.id]);
      return result.rowCount ?? 0;
    });
  }

  async job(jobId: string): Promise<Record<string, unknown> | null> { const result = await this.pool.query('SELECT * FROM processing_jobs WHERE id=$1', [jobId]); return result.rows[0] ?? null; }
  async recordingSource(recordingId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(`SELECT r.id, r.story_id, r.status, r.duration_ms, m.provider, m.provider_public_id, m.provider_resource_type, m.provider_delivery_type FROM recordings r JOIN media_assets m ON m.recording_id=r.id AND m.role='original' WHERE r.id=$1`, [recordingId]);
    return result.rows[0] ?? null;
  }
  async step(jobId: string, kind: string, index: number): Promise<Record<string, unknown> | null> { const result = await this.pool.query('SELECT result FROM job_step_results WHERE processing_job_id=$1 AND step_kind=$2 AND step_index=$3', [jobId, kind, index]); return result.rows[0]?.result as Record<string, unknown> | null ?? null; }
  async writeStep(client: Queryable, jobId: string, kind: string, index: number, result: unknown, modelRunId: string): Promise<void> { await client.query(`INSERT INTO job_step_results (processing_job_id, step_kind, step_index, result, model_run_id) VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (processing_job_id,step_kind,step_index) DO NOTHING`, [jobId, kind, index, JSON.stringify(result), modelRunId]); }
  async updateJob(client: Queryable, jobId: string, status: DurableJobStatus, errorCode?: string): Promise<void> { await client.query(`UPDATE processing_jobs SET status=$2, last_error_code=$3, finished_at=CASE WHEN $2 IN ('succeeded','failed_permanent','cancelled') THEN now() ELSE finished_at END WHERE id=$1`, [jobId, status, errorCode ?? null]); }
  async startJob(client: Queryable, jobId: string): Promise<void> { await client.query(`UPDATE processing_jobs SET status='running', attempts=attempts+1, started_at=COALESCE(started_at, now()) WHERE id=$1 AND status IN ('queued','failed_retryable')`, [jobId]); }
  async createModelRun(client: Queryable, input: { id: string; jobId: string; role: 'listener_asr' | 'translator' | 'verifier'; provider: string; modelId: string; inputSha256: Buffer; inputUnits?: number; outputUnits?: number; outcome: 'ok' | 'provider_error' | 'timeout' | 'cancelled' }): Promise<void> { await client.query(`INSERT INTO model_runs (id,processing_job_id,role,provider,model_id,input_sha256,input_units,output_units,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.id, input.jobId, input.role, input.provider, input.modelId, input.inputSha256, input.inputUnits ?? null, input.outputUnits ?? null, input.outcome]); }
  async upsertUsage(client: Queryable, provider: string, costMicros: number): Promise<void> { await client.query(`INSERT INTO ai_usage_daily (date,provider,cost_usd_micros) VALUES (CURRENT_DATE,$1,$2) ON CONFLICT (date,provider) DO UPDATE SET cost_usd_micros=ai_usage_daily.cost_usd_micros + EXCLUDED.cost_usd_micros`, [provider, costMicros]); }
  async reserveUsage(client: Queryable, provider: string, costMicros: number, dailyBudgetMicros: number): Promise<boolean> {
    if (costMicros < 0 || dailyBudgetMicros < 0) throw new Error('invalid_usage_limit');
    const inserted = await client.query(`INSERT INTO ai_usage_daily (date,provider,cost_usd_micros) VALUES (CURRENT_DATE,$1,$2) ON CONFLICT (date,provider) DO NOTHING RETURNING cost_usd_micros`, [provider, costMicros <= dailyBudgetMicros ? costMicros : 0]);
    if (inserted.rows.length > 0) return costMicros <= dailyBudgetMicros;
    const updated = await client.query(`UPDATE ai_usage_daily SET cost_usd_micros=cost_usd_micros+$2 WHERE date=CURRENT_DATE AND provider=$1 AND cost_usd_micros+$2 <= $3 RETURNING cost_usd_micros`, [provider, costMicros, dailyBudgetMicros]);
    return updated.rows.length > 0;
  }
  async usage(provider: string): Promise<number> { const result = await this.pool.query('SELECT cost_usd_micros FROM ai_usage_daily WHERE date=CURRENT_DATE AND provider=$1', [provider]); return Number(result.rows[0]?.cost_usd_micros ?? 0); }
  async consentActive(storyId: string, scopes: readonly string[]): Promise<boolean> { const result = await this.pool.query(`SELECT 1 FROM consent_records c JOIN consent_scope_grants g ON g.consent_record_id=c.id WHERE c.story_id=$1 AND c.status='active' AND g.granted=true AND g.scope = ANY($2::text[]) GROUP BY c.id HAVING COUNT(DISTINCT g.scope)=$3`, [storyId, scopes, scopes.length]); return result.rows.length > 0; }
  async createTranscript(client: Queryable, input: { id: string; storyId: string; jobId: string }): Promise<void> { await client.query(`INSERT INTO transcripts (id,story_id,version_number,status,asr_processing_job_id) VALUES ($1,$2,1,'generating',$3) ON CONFLICT (story_id,asr_processing_job_id) DO NOTHING`, [input.id, input.storyId, input.jobId]); }
  async transcriptForJob(jobId: string): Promise<string | null> { const result = await this.pool.query('SELECT id FROM transcripts WHERE asr_processing_job_id=$1', [jobId]); return result.rows[0]?.id as string | undefined ?? null; }
  async transcript(transcriptId: string): Promise<Record<string, unknown> | null> { const result = await this.pool.query('SELECT * FROM transcripts WHERE id=$1', [transcriptId]); return result.rows[0] ?? null; }
  async saveTranscript(client: Queryable, transcriptId: string, status: 'machine_draft' | 'failed'): Promise<void> { await client.query('UPDATE transcripts SET status=$2, updated_at=now() WHERE id=$1', [transcriptId, status]); }
  async transcriptSegments(transcriptId: string): Promise<Array<{ id: string; ordinal: number; startMs: number; endMs: number; text: string }>> { const result = await this.pool.query('SELECT id,ordinal,start_ms,end_ms,text FROM transcript_segments WHERE transcript_id=$1 ORDER BY ordinal', [transcriptId]); return result.rows as Array<{ id: string; ordinal: number; startMs: number; endMs: number; text: string }>; }
  async saveSegments(client: Queryable, transcriptId: string, segments: Array<{ id: string; ordinal: number; startMs: number; endMs: number; text: string; confidence?: number; uncertain?: boolean }>): Promise<void> { for (const segment of segments) await client.query(`INSERT INTO transcript_segments (id,transcript_id,ordinal,start_ms,end_ms,text,machine_text,asr_confidence) VALUES ($1,$2,$3,$4,$5,$6,$6,$7) ON CONFLICT (transcript_id,ordinal) DO NOTHING`, [segment.id, transcriptId, segment.ordinal, segment.startMs, segment.endMs, segment.text, segment.confidence ?? null]); }
  async saveFlag(client: Queryable, input: { id: string; transcriptId: string; segmentId: string; reason: string; source: string }): Promise<void> { await client.query(`INSERT INTO uncertainty_flags (id,transcript_id,segment_id,reason,source,question_for_reviewer) VALUES ($1,$2,$3,$4,$5,'Please check this part of the recording.')`, [input.id, input.transcriptId, input.segmentId, input.reason, input.source]); }

  async createTranslation(client: Queryable, input: { id: string; storyId: string; transcriptId: string }): Promise<void> { await client.query(`INSERT INTO translations (id,story_id,source_transcript_id,status) VALUES ($1,$2,$3,'generating') ON CONFLICT (source_transcript_id,version_number) DO NOTHING`, [input.id, input.storyId, input.transcriptId]); }
  async updateTranslation(client: Queryable, id: string, status: string): Promise<void> { await client.query('UPDATE translations SET status=$2, updated_at=now(), version=version+1 WHERE id=$1', [id, status]); }
  async translation(id: string): Promise<Record<string, unknown> | null> { const result = await this.pool.query('SELECT * FROM translations WHERE id=$1', [id]); return result.rows[0] ?? null; }
  async saveTranslationSegment(client: Queryable, input: { id: string; translationId: string; sourceSegmentId: string; close: string; natural: string }): Promise<void> { await client.query(`INSERT INTO translation_segments (id,translation_id,source_segment_id,close_text,natural_text,machine_close_text,machine_natural_text) VALUES ($1,$2,$3,$4,$5,$4,$5) ON CONFLICT (translation_id,source_segment_id) DO NOTHING`, [input.id, input.translationId, input.sourceSegmentId, input.close, input.natural]); }
  async saveVerification(client: Queryable, input: { id: string; translationId: string; status: 'complete' | 'incomplete'; issues: Array<{ id: string; checkId: string; severity: 'blocking' | 'warning'; detail: string }> }): Promise<void> { await client.query(`INSERT INTO verification_reports (id,translation_id,status,checks_run) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (translation_id) DO UPDATE SET status=EXCLUDED.status, checks_run=EXCLUDED.checks_run`, [input.id, input.translationId, input.status, JSON.stringify(['segment.alignment','marker.preservation','llm.omission'])]); for (const issue of input.issues) await client.query(`INSERT INTO verification_issues (id,report_id,check_id,severity,detail) VALUES ($1,$2,$3,$4,$5::jsonb)`, [issue.id, input.id, issue.checkId, issue.severity, JSON.stringify({ detail: issue.detail })]); }

  async persistApprovedStoryVersion(client: Queryable, input: { id: string; storyId: string; transcriptId: string; translationId: string | null; approvedByUserId: string; snapshotHash: Buffer; acceptedUncertaintyCount: number }): Promise<void> {
    const source = await client.query(`SELECT t.story_id, t.status AS transcript_status, tr.status AS translation_status FROM transcripts t LEFT JOIN translations tr ON tr.id=$3 WHERE t.id=$2 AND t.story_id=$1`, [input.storyId, input.transcriptId, input.translationId]);
    const row = source.rows[0];
    if (!row || row.transcript_status !== 'approved_for_translation' || (input.translationId && row.translation_status !== 'approved')) throw new Error('approved_sources_required');
    await client.query(`UPDATE story_versions SET status='superseded' WHERE story_id=$1 AND status='approved'`, [input.storyId]);
    const next = await client.query(`SELECT COALESCE(MAX(version_number),0)+1 AS version FROM story_versions WHERE story_id=$1`, [input.storyId]);
    await client.query(`INSERT INTO story_versions (id,story_id,version_number,transcript_id,translation_id,status,approved_by_user_id,approved_at,snapshot_hash,accepted_uncertainty_count) VALUES ($1,$2,$3,$4,$5,'approved',$6,now(),$7,$8)`, [input.id, input.storyId, next.rows[0]?.version ?? 1, input.transcriptId, input.translationId, input.approvedByUserId, input.snapshotHash, input.acceptedUncertaintyCount]);
    await client.query(`UPDATE stories SET current_story_version_id=$2,status='approved',updated_at=now(),version=version+1 WHERE id=$1`, [input.storyId, input.id]);
  }
}
