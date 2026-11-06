import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuditSink } from '@echoes-of-home/auth/postgres-adapter';
import type { PoolClient } from 'pg';

export const authAuditActions = Object.freeze({
  'user:create': 'user.registered',
  'user:update': 'user.updated',
  'session:create': 'session.created',
  'session:revoke': 'session.revoked',
  'verification:create': 'auth.challenge_persisted',
  'verification:consume': 'auth.challenge_consumed',
  'verification:revoke': 'auth.challenge_revoked',
} as const);

type Mutation = Parameters<AuditSink>[1];
type Actor =
  | { actorType: 'system'; actorUserId?: null }
  | { actorType: 'user' | 'platform_admin'; actorUserId: string };

export type AuditContext = Actor & {
  correlationId: string;
  storyId?: string | null;
};

type AuditEvent = {
  id: string;
  occurredAt: Date;
  actorType: Actor['actorType'];
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  storyId: string | null;
  metadata: Record<string, unknown>;
  correlationId: string;
};

type AuditDatabaseRow = {
  id: string;
  occurred_at: Date;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  story_id: string | null;
  metadata: unknown;
  correlation_id: string;
  prev_hash: Buffer;
  hash: Buffer;
};

export type AuditVerificationResult =
  | { valid: true; checked: number; headHash: Buffer | null }
  | { valid: false; checked: number; failureId: string | null; reason: 'invalid_row' | 'reordered_id' | 'genesis_prev_hash' | 'previous_hash_mismatch' | 'hash_mismatch' };

const zeroHash = Buffer.alloc(32);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const correlation = /^[A-Za-z0-9._:-]{1,128}$/;
const actionFor = (mutation: Mutation): string | undefined => authAuditActions[`${mutation.model}:${mutation.operation}` as keyof typeof authAuditActions];

function hmacKey(key: Buffer): Buffer {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('Invalid audit HMAC key');
  return Buffer.from(key);
}

function uuidValue(value: string): string {
  if (!uuid.test(value)) throw new Error('Invalid audit UUID');
  return value.toLowerCase();
}

function contextValue(context: AuditContext): Omit<AuditEvent, 'id' | 'occurredAt' | 'action' | 'entityType' | 'entityId' | 'metadata'> {
  if (typeof context.correlationId !== 'string' || !correlation.test(context.correlationId)) throw new Error('Invalid audit context');
  const storyId = context.storyId == null ? null : uuidValue(context.storyId);
  if (context.actorType === 'system') {
    if (context.actorUserId != null) throw new Error('Invalid audit context');
    return { actorType: 'system', actorUserId: null, storyId, correlationId: context.correlationId };
  }
  if (!['user', 'platform_admin'].includes(context.actorType)) throw new Error('Invalid audit context');
  return {
    actorType: context.actorType,
    actorUserId: uuidValue(context.actorUserId),
    storyId,
    correlationId: context.correlationId,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new Error('Invalid audit event');
}

function eventBytes(event: AuditEvent): Buffer {
  return Buffer.from(canonicalJson({
    action: event.action,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    correlationId: event.correlationId,
    entityId: event.entityId,
    entityType: event.entityType,
    id: event.id,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
    storyId: event.storyId,
  }), 'utf8');
}

function eventHash(key: Buffer, event: AuditEvent, prevHash: Buffer): Buffer {
  return createHmac('sha256', key)
    .update('echoes.audit.v1\0', 'utf8')
    .update(eventBytes(event))
    .update(prevHash)
    .digest();
}

function databaseEvent(row: AuditDatabaseRow): AuditEvent | null {
  try {
    if (!/^[1-9][0-9]*$/.test(row.id) || !(row.occurred_at instanceof Date) || !Number.isFinite(row.occurred_at.getTime())) return null;
    if (!['user', 'system', 'platform_admin'].includes(row.actor_type) || typeof row.action !== 'string' || !row.action.length) return null;
    if (typeof row.entity_type !== 'string' || !row.entity_type.length || typeof row.correlation_id !== 'string') return null;
    if (row.actor_type === 'system' ? row.actor_user_id !== null : row.actor_user_id === null) return null;
    const metadata = row.metadata;
    if (metadata === null || Array.isArray(metadata) || typeof metadata !== 'object') return null;
    return {
      id: row.id,
      occurredAt: row.occurred_at,
      actorType: row.actor_type as Actor['actorType'],
      actorUserId: row.actor_user_id == null ? null : uuidValue(row.actor_user_id),
      action: row.action,
      entityType: row.entity_type,
      entityId: uuidValue(row.entity_id),
      storyId: row.story_id == null ? null : uuidValue(row.story_id),
      metadata: metadata as Record<string, unknown>,
      correlationId: row.correlation_id,
    };
  } catch {
    return null;
  }
}

export function createAuthAuditSink(options: { key: Buffer; context: (mutation: Mutation) => AuditContext }): AuditSink {
  const key = hmacKey(options.key);
  if (typeof options.context !== 'function') throw new Error('Invalid audit context resolver');
  return async (tx, mutation) => {
    const action = actionFor(mutation);
    if (!action) throw new Error('Unsupported audit mutation');
    const context = contextValue(options.context(mutation));
    const entityId = uuidValue(mutation.entityId);
    const isolation = await tx.query<{ transaction_isolation: string }>('SHOW transaction_isolation');
    if (isolation.rows[0]?.transaction_isolation !== 'read committed') throw new Error('Audit writes require READ COMMITTED transactions');
    await tx.query('SELECT pg_advisory_xact_lock(1162827569, 1096107092)');
    const previous = await tx.query<{ hash: Buffer }>('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1');
    const prevHash = previous.rows[0]?.hash ?? zeroHash;
    if (!Buffer.isBuffer(prevHash) || prevHash.length !== 32) throw new Error('Invalid audit chain head');
    const reservation = await tx.query<{ id: string; occurred_at: Date }>("SELECT nextval(pg_get_serial_sequence('audit_events','id'))::text AS id, now() AS occurred_at");
    const reserved = reservation.rows[0];
    if (!reserved) throw new Error('Audit sequence unavailable');
    const event: AuditEvent = {
      ...context,
      id: reserved.id,
      occurredAt: reserved.occurred_at,
      action,
      entityType: mutation.model,
      entityId,
      metadata: { operation: mutation.operation },
    };
    const hash = eventHash(key, event, prevHash);
    await tx.query(
      'INSERT INTO audit_events (id,occurred_at,actor_type,actor_user_id,action,entity_type,entity_id,story_id,metadata,correlation_id,prev_hash,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [event.id, event.occurredAt, event.actorType, event.actorUserId, event.action, event.entityType, event.entityId, event.storyId, event.metadata, event.correlationId, prevHash, hash],
    );
  };
}

export async function verifyAuditChain(db: Pick<PoolClient, 'query'>, auditKey: Buffer): Promise<AuditVerificationResult> {
  const key = hmacKey(auditKey);
  const result = await db.query<AuditDatabaseRow>('SELECT id::text,occurred_at,actor_type,actor_user_id,action,entity_type,entity_id,story_id,metadata,correlation_id,prev_hash,hash FROM audit_events ORDER BY audit_events.id ASC');
  let expectedPrevious = zeroHash;
  let previousId = 0n;
  let checked = 0;
  for (const row of result.rows) {
    const event = databaseEvent(row);
    if (!event || !Buffer.isBuffer(row.prev_hash) || row.prev_hash.length !== 32 || !Buffer.isBuffer(row.hash) || row.hash.length !== 32) {
      return { valid: false, checked, failureId: row.id ?? null, reason: 'invalid_row' };
    }
    const currentId = BigInt(event.id);
    if (currentId <= previousId) return { valid: false, checked, failureId: event.id, reason: 'reordered_id' };
    if (!timingSafeEqual(row.prev_hash, expectedPrevious)) {
      return { valid: false, checked, failureId: event.id, reason: checked === 0 ? 'genesis_prev_hash' : 'previous_hash_mismatch' };
    }
    let expectedHash: Buffer;
    try {
      expectedHash = eventHash(key, event, row.prev_hash);
    } catch {
      return { valid: false, checked, failureId: event.id, reason: 'invalid_row' };
    }
    if (!timingSafeEqual(row.hash, expectedHash)) return { valid: false, checked, failureId: event.id, reason: 'hash_mismatch' };
    previousId = currentId;
    expectedPrevious = Buffer.from(row.hash);
    checked += 1;
  }
  return { valid: true, checked, headHash: checked ? Buffer.from(expectedPrevious) : null };
}
