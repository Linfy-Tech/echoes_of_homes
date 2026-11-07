CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"storyteller_person_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"method" text NOT NULL,
	"consent_script_id" uuid NOT NULL,
	"presented_language" text NOT NULL,
	"operated_by_user_id" uuid NOT NULL,
	"evidence_media_asset_id" uuid,
	"comprehension_result" jsonb NOT NULL,
	"rights_holder_choice" text NOT NULL,
	"supersedes_id" uuid,
	"change_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "consent_records_status_allowed" CHECK ("consent_records"."status" IN ('active', 'superseded', 'withdrawn')),
	CONSTRAINT "consent_records_method_allowed" CHECK ("consent_records"."method" IN ('self_digital', 'assisted_verbal')),
	CONSTRAINT "consent_records_assisted_evidence_required" CHECK ("consent_records"."method" <> 'assisted_verbal' OR "consent_records"."evidence_media_asset_id" IS NOT NULL),
	CONSTRAINT "consent_records_language_allowed" CHECK ("consent_records"."presented_language" IN ('xh', 'en')),
	CONSTRAINT "consent_records_rights_holder_allowed" CHECK ("consent_records"."rights_holder_choice" IN ('self', 'custodian')),
	CONSTRAINT "consent_records_change_allowed" CHECK ("consent_records"."change_kind" IN ('initial', 'grant', 'revoke', 'withdraw_all')),
	CONSTRAINT "consent_records_comprehension_object" CHECK (jsonb_typeof("consent_records"."comprehension_result") = 'object')
);
--> statement-breakpoint
CREATE TABLE "consent_scope_grants" (
	"consent_record_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"granted" boolean NOT NULL,
	CONSTRAINT "consent_scope_grants_consent_record_id_scope_pk" PRIMARY KEY("consent_record_id","scope"),
	CONSTRAINT "consent_scope_allowed" CHECK ("consent_scope_grants"."scope" IN ('record_and_store', 'cross_border_processing', 'ai_transcription', 'human_review', 'translation', 'share_family', 'share_public', 'model_training')),
	CONSTRAINT "consent_scope_r1_disabled" CHECK ("consent_scope_grants"."scope" NOT IN ('share_public', 'model_training') OR "consent_scope_grants"."granted" = false)
);
--> statement-breakpoint
CREATE TABLE "consent_scripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"version" text NOT NULL,
	"content_hash" "bytea" NOT NULL,
	"content" jsonb NOT NULL,
	"audio_media_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"processors_disclosed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "consent_scripts_language_allowed" CHECK ("consent_scripts"."language" IN ('xh', 'en')),
	CONSTRAINT "consent_scripts_content_object" CHECK (jsonb_typeof("consent_scripts"."content") = 'object')
);
--> statement-breakpoint
CREATE TABLE "custodian_designations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"custodian_user_id" uuid NOT NULL,
	"custodian_person_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_acceptance' NOT NULL,
	"designated_in_consent_record_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "custodian_designations_status_allowed" CHECK ("custodian_designations"."status" IN ('pending_acceptance', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "family_circles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "family_circles_name_length" CHECK (char_length("family_circles"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "family_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"circle_role" text DEFAULT 'family_member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_memberships_role_allowed" CHECK ("family_memberships"."circle_role" IN ('family_admin', 'family_member'))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"invited_email_lookup_hash" "bytea" NOT NULL,
	"family_circle_id" uuid,
	"story_id" uuid,
	"person_id" uuid,
	"role_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_type_allowed" CHECK ("invitations"."type" IN ('family_member', 'story_reviewer', 'custodian', 'storyteller_account_link')),
	CONSTRAINT "invitations_status_allowed" CHECK ("invitations"."status" IN ('pending', 'accepted', 'expired', 'revoked')),
	CONSTRAINT "invitations_payload_object" CHECK (jsonb_typeof("invitations"."role_payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" "bytea" NOT NULL,
	"preferred_language" text DEFAULT 'xh' NOT NULL,
	"linked_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"adult_attested_at" timestamp with time zone,
	"contact_email" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "persons_linked_user_id_unique" UNIQUE("linked_user_id"),
	CONSTRAINT "persons_preferred_language_allowed" CHECK ("persons"."preferred_language" IN ('xh', 'en')),
	CONSTRAINT "persons_version_positive" CHECK ("persons"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_circle_id" uuid NOT NULL,
	"storyteller_person_id" uuid NOT NULL,
	"rights_holder_person_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" "bytea",
	"description" "bytea",
	"source_language" text DEFAULT 'xh' NOT NULL,
	"target_language" text DEFAULT 'en',
	"status" text DEFAULT 'draft' NOT NULL,
	"audience" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stories_source_language_allowed" CHECK ("stories"."source_language" = 'xh'),
	CONSTRAINT "stories_target_language_allowed" CHECK ("stories"."target_language" IS NULL OR "stories"."target_language" = 'en'),
	CONSTRAINT "stories_status_draft_only_m2" CHECK ("stories"."status" = 'draft'),
	CONSTRAINT "stories_audience_allowed" CHECK ("stories"."audience" IN ('private', 'family', 'public'))
);
--> statement-breakpoint
CREATE TABLE "story_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "story_roles_role_allowed" CHECK ("story_roles"."role" IN ('recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_storyteller_person_id_persons_id_fk" FOREIGN KEY ("storyteller_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_script_id_consent_scripts_id_fk" FOREIGN KEY ("consent_script_id") REFERENCES "public"."consent_scripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_operated_by_user_id_users_id_fk" FOREIGN KEY ("operated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_scope_grants" ADD CONSTRAINT "consent_scope_grants_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodian_designations" ADD CONSTRAINT "custodian_designations_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodian_designations" ADD CONSTRAINT "custodian_designations_custodian_user_id_users_id_fk" FOREIGN KEY ("custodian_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodian_designations" ADD CONSTRAINT "custodian_designations_custodian_person_id_persons_id_fk" FOREIGN KEY ("custodian_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodian_designations" ADD CONSTRAINT "custodian_designations_designated_in_consent_record_id_consent_records_id_fk" FOREIGN KEY ("designated_in_consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_circles" ADD CONSTRAINT "family_circles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_family_circle_id_family_circles_id_fk" FOREIGN KEY ("family_circle_id") REFERENCES "public"."family_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memberships" ADD CONSTRAINT "family_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_family_circle_id_family_circles_id_fk" FOREIGN KEY ("family_circle_id") REFERENCES "public"."family_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_family_circle_id_family_circles_id_fk" FOREIGN KEY ("family_circle_id") REFERENCES "public"."family_circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_storyteller_person_id_persons_id_fk" FOREIGN KEY ("storyteller_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_rights_holder_person_id_persons_id_fk" FOREIGN KEY ("rights_holder_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_roles" ADD CONSTRAINT "story_roles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_roles" ADD CONSTRAINT "story_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_roles" ADD CONSTRAINT "story_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_active_story_unique" ON "consent_records" USING btree ("story_id") WHERE "consent_records"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "consent_scripts_language_version_unique" ON "consent_scripts" USING btree ("language","version");--> statement-breakpoint
CREATE UNIQUE INDEX "custodian_designations_live_story_unique" ON "custodian_designations" USING btree ("story_id") WHERE "custodian_designations"."status" IN ('pending_acceptance', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "family_memberships_circle_user_unique" ON "family_memberships" USING btree ("family_circle_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "stories_family_status_idx" ON "stories" USING btree ("family_circle_id","status");--> statement-breakpoint
CREATE INDEX "stories_storyteller_idx" ON "stories" USING btree ("storyteller_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_roles_live_unique" ON "story_roles" USING btree ("story_id","user_id","role") WHERE "story_roles"."revoked_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "persons" OWNER TO eoh_migrator;
ALTER TABLE "family_circles" OWNER TO eoh_migrator;
ALTER TABLE "family_memberships" OWNER TO eoh_migrator;
ALTER TABLE "invitations" OWNER TO eoh_migrator;
ALTER TABLE "stories" OWNER TO eoh_migrator;
ALTER TABLE "story_roles" OWNER TO eoh_migrator;
ALTER TABLE "consent_scripts" OWNER TO eoh_migrator;
ALTER TABLE "consent_records" OWNER TO eoh_migrator;
ALTER TABLE "consent_scope_grants" OWNER TO eoh_migrator;
ALTER TABLE "custodian_designations" OWNER TO eoh_migrator;
--> statement-breakpoint
REVOKE ALL ON TABLE "persons" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "family_circles" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "family_memberships" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "invitations" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "stories" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "story_roles" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "consent_scripts" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "consent_records" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "consent_scope_grants" FROM PUBLIC, eoh_app;
REVOKE ALL ON TABLE "custodian_designations" FROM PUBLIC, eoh_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "persons" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "family_circles" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "family_memberships" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invitations" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "stories" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "story_roles" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "consent_scripts" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "consent_records" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "consent_scope_grants" TO eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "custodian_designations" TO eoh_app;
