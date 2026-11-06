import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: bytea('email').notNull(),
  emailLookupHash: bytea('email_lookup_hash').notNull(),
  displayName: text('display_name').notNull(),
  uiLanguage: text('ui_language').notNull().default('xh'),
  accountRole: text('account_role').notNull().default('member'),
  status: text('status').notNull().default('active'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
}, (table) => [
  uniqueIndex('users_email_lookup_hash_unique').on(table.emailLookupHash),
  check('users_display_name_length', sql`char_length(${table.displayName}) BETWEEN 1 AND 80`),
  check('users_ui_language_allowed', sql`${table.uiLanguage} IN ('xh', 'en')`),
  check('users_account_role_allowed', sql`${table.accountRole} IN ('member', 'platform_admin')`),
  check('users_status_allowed', sql`${table.status} IN ('active', 'closing', 'closed')`),
  check('users_version_positive', sql`${table.version} >= 1`),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: bytea('token_hash').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  lastSeenAt: timestampTz('last_seen_at').notNull().defaultNow(),
  expiresAt: timestampTz('expires_at').notNull(),
  revokedAt: timestampTz('revoked_at'),
  userAgentSummary: text('user_agent_summary'),
}, (table) => [
  uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
  index('sessions_active_user_idx').on(table.userId).where(sql`${table.revokedAt} IS NULL`),
]);

export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey(),
  emailLookupHash: bytea('email_lookup_hash').notNull(),
  codeHash: bytea('code_hash'),
  linkTokenHash: bytea('link_token_hash'),
  expiresAt: timestampTz('expires_at').notNull(),
  consumedAt: timestampTz('consumed_at'),
  attempts: integer('attempts').notNull().default(0),
  createdIpHash: bytea('created_ip_hash'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [
  index('auth_challenges_email_lookup_hash_idx').on(table.emailLookupHash),
  check('auth_challenges_attempts_range', sql`${table.attempts} BETWEEN 0 AND 5`),
]);

export const auditEvents = pgTable('audit_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  occurredAt: timestampTz('occurred_at').notNull().defaultNow(),
  actorType: text('actor_type').notNull(),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  storyId: uuid('story_id'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  correlationId: text('correlation_id').notNull(),
  prevHash: bytea('prev_hash').notNull(),
  hash: bytea('hash').notNull(),
}, (table) => [
  index('audit_events_entity_idx').on(table.entityType, table.entityId),
  index('audit_events_story_id_idx').on(table.storyId),
  check('audit_events_actor_type_allowed', sql`${table.actorType} IN ('user', 'system', 'platform_admin')`),
  check('audit_events_action_not_empty', sql`char_length(${table.action}) > 0`),
  check('audit_events_entity_type_not_empty', sql`char_length(${table.entityType}) > 0`),
  check('audit_events_metadata_object', sql`jsonb_typeof(${table.metadata}) = 'object'`),
  check('audit_events_prev_hash_sha256', sql`octet_length(${table.prevHash}) = 32`),
  check('audit_events_hash_sha256', sql`octet_length(${table.hash}) = 32`),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: uuid('key').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  requestHash: bytea('request_hash').notNull(),
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'idempotency_keys_pkey', columns: [table.key, table.userId] }),
  index('idempotency_keys_created_at_idx').on(table.createdAt),
  check('idempotency_keys_request_hash_sha256', sql`octet_length(${table.requestHash}) = 32`),
  check('idempotency_keys_response_status_range', sql`${table.responseStatus} BETWEEN 100 AND 599`),
  check('idempotency_keys_response_body_object', sql`jsonb_typeof(${table.responseBody}) = 'object'`),
]);
