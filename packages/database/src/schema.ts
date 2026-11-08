import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
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

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), status: text('status').notNull().default('pending_upload'), source: text('source').notNull(), declaredSha256: bytea('declared_sha256').notNull(), declaredSizeBytes: bigint('declared_size_bytes', { mode: 'number' }), declaredMime: text('declared_mime'), verifiedSha256: bytea('verified_sha256'), durationMs: integer('duration_ms'), codec: text('codec'), failureReason: text('failure_reason'), uploadExpiresAt: timestampTz('upload_expires_at').notNull(), createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(), version: integer('version').notNull().default(1),
}, (table) => [uniqueIndex('recordings_one_live_story_unique').on(table.storyId).where(sql`${table.status} NOT IN ('failed','abandoned','deleted')`), check('recordings_status_allowed', sql`${table.status} IN ('pending_upload','uploaded','verifying','verified','failed','abandoned','deleted')`), check('recordings_source_allowed', sql`${table.source} IN ('browser_recording','file_upload')`), check('recordings_failure_allowed', sql`${table.failureReason} IS NULL OR ${table.failureReason} IN ('hash_mismatch','no_audio_stream','too_long','unsupported_format','provider_error')`)]);

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), recordingId: uuid('recording_id').references(() => recordings.id, { onDelete: 'set null' }), role: text('role').notNull(), provider: text('provider').notNull(), providerPublicId: text('provider_public_id').notNull(), providerResourceType: text('provider_resource_type').notNull(), providerDeliveryType: text('provider_delivery_type').notNull(), sha256: bytea('sha256'), sizeBytes: bigint('size_bytes', { mode: 'number' }), status: text('status').notNull().default('pending'), derivedFromAssetId: uuid('derived_from_asset_id').references((): AnyPgColumn => mediaAssets.id), createdAt: timestampTz('created_at').notNull().defaultNow(), deletedAt: timestampTz('deleted_at'),
}, (table) => [uniqueIndex('media_assets_provider_public_id_unique').on(table.provider, table.providerPublicId), index('media_assets_story_role_idx').on(table.storyId, table.role), check('media_assets_role_allowed', sql`${table.role} IN ('original','playback','processing','consent_evidence','consent_script_audio','export_archive')`), check('media_assets_provider_allowed', sql`${table.provider} IN ('cloudinary','fake')`), check('media_assets_status_allowed', sql`${table.status} IN ('pending','available','failed','deleting','deleted')`)]);

export const processingJobs = pgTable('processing_jobs', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }), type: text('type').notNull(), status: text('status').notNull().default('queued'), inputRef: jsonb('input_ref').notNull(), attempts: integer('attempts').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3), lastErrorCode: text('last_error_code'), correlationId: text('correlation_id').notNull(), idempotencyKey: text('idempotency_key').notNull(), createdAt: timestampTz('created_at').notNull().defaultNow(), startedAt: timestampTz('started_at'), finishedAt: timestampTz('finished_at'),
}, (table) => [uniqueIndex('processing_jobs_idempotency_unique').on(table.idempotencyKey), index('processing_jobs_story_type_status_idx').on(table.storyId, table.type, table.status), check('processing_jobs_status_allowed', sql`${table.status} IN ('queued','waiting_budget','running','succeeded','failed_retryable','failed_permanent','cancelled')`)]);

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), versionNumber: integer('version_number').notNull(), status: text('status').notNull(), derivedFromTranscriptId: uuid('derived_from_transcript_id'), asrProcessingJobId: uuid('asr_processing_job_id').notNull().references(() => processingJobs.id), approvedByUserId: uuid('approved_by_user_id').references(() => users.id), approvedAt: timestampTz('approved_at'), contentHash: bytea('content_hash'), createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(), version: integer('version').notNull().default(1),
}, (table) => [uniqueIndex('transcripts_story_job_unique').on(table.storyId, table.asrProcessingJobId), uniqueIndex('transcripts_live_story_unique').on(table.storyId).where(sql`${table.status} IN ('generating','machine_draft','in_review','review_complete')`), check('transcripts_status_allowed', sql`${table.status} IN ('generating','machine_draft','in_review','review_complete','approved_for_translation','superseded','failed')`), check('transcripts_version_positive', sql`${table.versionNumber} >= 1`)]);

export const transcriptSegments = pgTable('transcript_segments', {
  id: uuid('id').primaryKey(), transcriptId: uuid('transcript_id').notNull().references(() => transcripts.id, { onDelete: 'cascade' }), ordinal: integer('ordinal').notNull(), startMs: integer('start_ms').notNull(), endMs: integer('end_ms').notNull(), text: text('text').notNull(), machineText: text('machine_text').notNull(), detectedLanguages: text('detected_languages').array().notNull().default(sql`'{}'::text[]`), asrConfidence: real('asr_confidence'), reviewState: text('review_state').notNull().default('unreviewed'), exclusionReason: text('exclusion_reason'), currentRevision: integer('current_revision').notNull().default(1), version: integer('version').notNull().default(1),
}, (table) => [uniqueIndex('transcript_segments_transcript_ordinal_unique').on(table.transcriptId, table.ordinal), check('transcript_segments_time_order', sql`${table.startMs} >= 0 AND ${table.endMs} > ${table.startMs}`), check('transcript_segments_review_state_allowed', sql`${table.reviewState} IN ('unreviewed','confirmed','corrected','inaudible','excluded')`)]);

export const transcriptRevisions = pgTable('transcript_revisions', {
  id: uuid('id').primaryKey(), segmentId: uuid('segment_id').notNull().references(() => transcriptSegments.id, { onDelete: 'cascade' }), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), fromText: text('from_text').notNull(), toText: text('to_text').notNull(), version: integer('version').notNull(), createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [uniqueIndex('transcript_revisions_segment_version_unique').on(table.segmentId, table.version)]);

export const uncertaintyFlags = pgTable('uncertainty_flags', {
  id: uuid('id').primaryKey(), transcriptId: uuid('transcript_id').notNull().references(() => transcripts.id, { onDelete: 'cascade' }), segmentId: uuid('segment_id').notNull().references(() => transcriptSegments.id, { onDelete: 'cascade' }), charStart: integer('char_start'), charEnd: integer('char_end'), reason: text('reason').notNull(), source: text('source').notNull(), suggestionText: text('suggestion_text'), questionForReviewer: text('question_for_reviewer'), status: text('status').notNull().default('open'), resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id), resolvedAt: timestampTz('resolved_at'), modelRunId: uuid('model_run_id'),
}, (table) => [check('uncertainty_flags_status_allowed', sql`${table.status} IN ('open','resolved_confirmed','resolved_corrected','resolved_inaudible','accepted_as_uncertain')`), check('uncertainty_flags_source_allowed', sql`${table.source} IN ('asr_signal','heuristic','context_assist','dual_asr','reviewer')`)]);

export const modelRuns = pgTable('model_runs', {
  id: uuid('id').primaryKey(), processingJobId: uuid('processing_job_id').notNull().references(() => processingJobs.id, { onDelete: 'cascade' }), role: text('role').notNull(), provider: text('provider').notNull(), modelId: text('model_id').notNull(), modelVersionLabel: text('model_version_label'), promptId: text('prompt_id'), promptVersion: text('prompt_version'), params: jsonb('params').notNull().default(sql`'{}'::jsonb`), inputSha256: bytea('input_sha256').notNull(), outputSha256: bytea('output_sha256'), inputUnits: integer('input_units'), outputUnits: integer('output_units'), costUsdMicros: integer('cost_usd_micros'), latencyMs: integer('latency_ms'), outcome: text('outcome').notNull(), providerRequestId: text('provider_request_id'), createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [check('model_runs_role_allowed', sql`${table.role} IN ('listener_asr','listener_asr_secondary','context_assist','translator','verifier')`), check('model_runs_outcome_allowed', sql`${table.outcome} IN ('ok','schema_invalid','provider_error','timeout','refused','cancelled')`), check('model_runs_params_object', sql`jsonb_typeof(${table.params}) = 'object'`)]);

export const jobStepResults = pgTable('job_step_results', {
  processingJobId: uuid('processing_job_id').notNull().references(() => processingJobs.id, { onDelete: 'cascade' }), stepKind: text('step_kind').notNull(), stepIndex: integer('step_index').notNull(), result: jsonb('result').notNull(), modelRunId: uuid('model_run_id').references(() => modelRuns.id), createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.processingJobId, table.stepKind, table.stepIndex] }), check('job_step_results_kind_allowed', sql`${table.stepKind} IN ('asr_chunk','translation_batch','verify_batch')`), check('job_step_results_object', sql`jsonb_typeof(${table.result}) = 'object'`)]);

export const aiUsageDaily = pgTable('ai_usage_daily', {
  date: date('date', { mode: 'string' }).notNull(), provider: text('provider').notNull(), costUsdMicros: integer('cost_usd_micros').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.date, table.provider] }), check('ai_usage_daily_cost_nonnegative', sql`${table.costUsdMicros} >= 0`)]);

export const familyGlossaryTerms = pgTable('family_glossary_terms', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), term: text('term').notNull(), category: text('category').notNull(), status: text('status').notNull().default('proposed'), proposedByUserId: uuid('proposed_by_user_id').notNull().references(() => users.id), approvedByUserId: uuid('approved_by_user_id').references(() => users.id), createdAt: timestampTz('created_at').notNull().defaultNow(), updatedAt: timestampTz('updated_at').notNull().defaultNow(),
}, (table) => [check('family_glossary_terms_status_allowed', sql`${table.status} IN ('proposed','approved','rejected')`), check('family_glossary_terms_term_length', sql`char_length(${table.term}) BETWEEN 1 AND 120`)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(), recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), kind: text('kind').notNull(), readAt: timestampTz('read_at'), createdAt: timestampTz('created_at').notNull().defaultNow(),
}, (table) => [check('notifications_kind_allowed', sql`${table.kind} IN ('reviewer_invited','review_complete','transcript_approved')`)]);

export const webhookReceipts = pgTable('webhook_receipts', {
  provider: text('provider').notNull(), providerEventId: text('provider_event_id').notNull(), receivedAt: timestampTz('received_at').notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.provider, table.providerEventId] })]);

export const custodianDesignations = pgTable('custodian_designations', {
  id: uuid('id').primaryKey(), storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }), custodianUserId: uuid('custodian_user_id').notNull().references(() => users.id), custodianPersonId: uuid('custodian_person_id').notNull().references(() => persons.id), status: text('status').notNull().default('pending_acceptance'), designatedInConsentRecordId: uuid('designated_in_consent_record_id').notNull().references(() => consentRecords.id), acceptedAt: timestampTz('accepted_at'), revokedAt: timestampTz('revoked_at'),
}, (table) => [uniqueIndex('custodian_designations_live_story_unique').on(table.storyId).where(sql`${table.status} IN ('pending_acceptance', 'active')`), check('custodian_designations_status_allowed', sql`${table.status} IN ('pending_acceptance', 'active', 'revoked')`)]);
