import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
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

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey(),
  displayName: bytea('display_name').notNull(),
  preferredLanguage: text('preferred_language').notNull().default('xh'),
  linkedUserId: uuid('linked_user_id').unique().references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  adultAttestedAt: timestampTz('adult_attested_at'),
  contactEmail: bytea('contact_email'),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
}, (table) => [
  check('persons_preferred_language_allowed', sql`${table.preferredLanguage} IN ('xh', 'en')`),
  check('persons_version_positive', sql`${table.version} >= 1`),
]);

export const familyCircles = pgTable('family_circles', {
  id: uuid('id').primaryKey(), name: text('name').notNull(), createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(), version: integer('version').notNull().default(1),
}, (table) => [check('family_circles_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 80`)]);

export const familyMemberships = pgTable('family_memberships', {
  id: uuid('id').primaryKey(), familyCircleId: uuid('family_circle_id').notNull().references(() => familyCircles.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  circleRole: text('circle_role').notNull().default('family_member'), createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [uniqueIndex('family_memberships_circle_user_unique').on(table.familyCircleId, table.userId), check('family_memberships_role_allowed', sql`${table.circleRole} IN ('family_admin', 'family_member')`)]);

export const stories = pgTable('stories', {
  id: uuid('id').primaryKey(), familyCircleId: uuid('family_circle_id').notNull().references(() => familyCircles.id), storytellerPersonId: uuid('storyteller_person_id').notNull().references(() => persons.id), rightsHolderPersonId: uuid('rights_holder_person_id').notNull().references(() => persons.id), createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id), title: bytea('title'), description: bytea('description'), sourceLanguage: text('source_language').notNull().default('xh'), targetLanguage: text('target_language').default('en'), status: text('status').notNull().default('draft'), audience: text('audience').notNull().default('private'), createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(), version: integer('version').notNull().default(1),
}, (table) => [check('stories_source_language_allowed', sql`${table.sourceLanguage} = 'xh'`), check('stories_target_language_allowed', sql`${table.targetLanguage} IS NULL OR ${table.targetLanguage} = 'en'`), check('stories_status_draft_only_m2', sql`${table.status} = 'draft'`), check('stories_audience_allowed', sql`${table.audience} IN ('private', 'family', 'public')`), index('stories_family_status_idx').on(table.familyCircleId, table.status), index('stories_storyteller_idx').on(table.storytellerPersonId)]);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey(), type: text('type').notNull(), tokenHash: bytea('token_hash').notNull(), invitedEmailLookupHash: bytea('invited_email_lookup_hash').notNull(), familyCircleId: uuid('family_circle_id').references(() => familyCircles.id, { onDelete: 'cascade' }), storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }), personId: uuid('person_id').references(() => persons.id, { onDelete: 'cascade' }), rolePayload: jsonb('role_payload').notNull().default(sql`'{}'::jsonb`), status: text('status').notNull().default('pending'), expiresAt: timestampTz('expires_at').notNull(), createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id), acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id), createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(),
}, (table) => [uniqueIndex('invitations_token_hash_unique').on(table.tokenHash), check('invitations_type_allowed', sql`${table.type} IN ('family_member', 'story_reviewer', 'custodian', 'storyteller_account_link')`), check('invitations_status_allowed', sql`${table.status} IN ('pending', 'accepted', 'expired', 'revoked')`), check('invitations_payload_object', sql`jsonb_typeof(${table.rolePayload}) = 'object'`)]);

export const storyRoles = pgTable('story_roles', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), role: text('role').notNull(), grantedByUserId: uuid('granted_by_user_id').notNull().references(() => users.id), grantedAt: timestampTz('granted_at').notNull().defaultNow(), revokedAt: timestampTz('revoked_at'),
}, (table) => [uniqueIndex('story_roles_live_unique').on(table.storyId, table.userId, table.role).where(sql`${table.revokedAt} IS NULL`), check('story_roles_role_allowed', sql`${table.role} IN ('recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer')`)]);

export const consentScripts = pgTable('consent_scripts', {
  id: uuid('id').primaryKey(), language: text('language').notNull(), version: text('version').notNull(), contentHash: bytea('content_hash').notNull(), content: jsonb('content').notNull(), audioMediaAssetIds: uuid('audio_media_asset_ids').array().notNull().default(sql`'{}'::uuid[]`), processorsDisclosed: jsonb('processors_disclosed').notNull().default(sql`'[]'::jsonb`), approvedBy: text('approved_by'), publishedAt: timestampTz('published_at'),
}, (table) => [uniqueIndex('consent_scripts_language_version_unique').on(table.language, table.version), check('consent_scripts_language_allowed', sql`${table.language} IN ('xh', 'en')`), check('consent_scripts_content_object', sql`jsonb_typeof(${table.content}) = 'object'`), check('consent_scripts_placeholder_unpublished', sql`${table.version} NOT LIKE '%placeholder%' OR (${table.approvedBy} IS NULL AND ${table.publishedAt} IS NULL)`)]);

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), storytellerPersonId: uuid('storyteller_person_id').notNull().references(() => persons.id), status: text('status').notNull().default('active'), method: text('method').notNull(), consentScriptId: uuid('consent_script_id').notNull().references(() => consentScripts.id), presentedLanguage: text('presented_language').notNull(), operatedByUserId: uuid('operated_by_user_id').notNull().references(() => users.id), evidenceMediaAssetId: uuid('evidence_media_asset_id'), comprehensionResult: jsonb('comprehension_result').notNull(), rightsHolderChoice: text('rights_holder_choice').notNull(), supersedesId: uuid('supersedes_id').references((): AnyPgColumn => consentRecords.id, { onDelete: 'set null' }), changeKind: text('change_kind').notNull(), createdAt: timestampTz('created_at').notNull().defaultNow(), supersededAt: timestampTz('superseded_at'), withdrawnAt: timestampTz('withdrawn_at'),
}, (table) => [uniqueIndex('consent_records_active_story_unique').on(table.storyId).where(sql`${table.status} = 'active'`), check('consent_records_status_allowed', sql`${table.status} IN ('active', 'superseded', 'withdrawn')`), check('consent_records_method_allowed', sql`${table.method} IN ('self_digital', 'assisted_verbal')`), check('consent_records_assisted_evidence_required', sql`${table.method} <> 'assisted_verbal' OR ${table.evidenceMediaAssetId} IS NOT NULL`), check('consent_records_language_allowed', sql`${table.presentedLanguage} IN ('xh', 'en')`), check('consent_records_rights_holder_allowed', sql`${table.rightsHolderChoice} IN ('self', 'custodian')`), check('consent_records_change_allowed', sql`${table.changeKind} IN ('initial', 'grant', 'revoke', 'withdraw_all')`), check('consent_records_comprehension_object', sql`jsonb_typeof(${table.comprehensionResult}) = 'object'`)]);

export const consentScopeGrants = pgTable('consent_scope_grants', {
  consentRecordId: uuid('consent_record_id').notNull().references(() => consentRecords.id, { onDelete: 'cascade' }), scope: text('scope').notNull(), granted: boolean('granted').notNull(),
}, (table) => [primaryKey({ columns: [table.consentRecordId, table.scope] }), check('consent_scope_allowed', sql`${table.scope} IN ('record_and_store', 'cross_border_processing', 'ai_transcription', 'human_review', 'translation', 'share_family', 'share_public', 'model_training')`), check('consent_scope_r1_disabled', sql`${table.scope} NOT IN ('share_public', 'model_training') OR ${table.granted} = false`)]);

export const custodianDesignations = pgTable('custodian_designations', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), custodianUserId: uuid('custodian_user_id').notNull().references(() => users.id), custodianPersonId: uuid('custodian_person_id').notNull().references(() => persons.id), status: text('status').notNull().default('pending_acceptance'), designatedInConsentRecordId: uuid('designated_in_consent_record_id').notNull().references(() => consentRecords.id), acceptedAt: timestampTz('accepted_at'), revokedAt: timestampTz('revoked_at'),
}, (table) => [uniqueIndex('custodian_designations_live_story_unique').on(table.storyId).where(sql`${table.status} IN ('pending_acceptance', 'active')`), check('custodian_designations_status_allowed', sql`${table.status} IN ('pending_acceptance', 'active', 'revoked')`)]);
