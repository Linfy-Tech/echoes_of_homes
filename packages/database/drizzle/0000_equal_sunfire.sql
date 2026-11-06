DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eoh_migrator') THEN
		CREATE ROLE eoh_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eoh_app') THEN
		CREATE ROLE eoh_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_roles
		WHERE rolname IN ('eoh_migrator', 'eoh_app')
			AND (NOT rolcanlogin OR rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
	) OR EXISTS (
		SELECT 1 FROM pg_auth_members membership
		JOIN pg_roles member_role ON member_role.oid = membership.member
		WHERE member_role.rolname IN ('eoh_migrator', 'eoh_app')
	) OR EXISTS (
		SELECT 1 FROM pg_database database_record
		JOIN pg_roles owner_role ON owner_role.oid = database_record.datdba
		WHERE database_record.datname = current_database() AND owner_role.rolname = 'eoh_app'
	) OR EXISTS (
		SELECT 1 FROM pg_namespace schema_record
		JOIN pg_roles owner_role ON owner_role.oid = schema_record.nspowner
		WHERE owner_role.rolname = 'eoh_app'
	) THEN
		RAISE EXCEPTION 'Existing Echoes database role is not least-privilege';
	END IF;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA public TO eoh_migrator;
--> statement-breakpoint
REVOKE ALL ON SCHEMA public FROM eoh_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO eoh_app;
--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format('GRANT CREATE ON DATABASE %I TO eoh_migrator', current_database());
	EXECUTE format('REVOKE CREATE ON DATABASE %I FROM eoh_app', current_database());
	EXECUTE format('REVOKE CREATE ON DATABASE %I FROM PUBLIC', current_database());
END
$$;
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"story_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"prev_hash" "bytea" NOT NULL,
	"hash" "bytea" NOT NULL,
	CONSTRAINT "audit_events_actor_type_allowed" CHECK ("audit_events"."actor_type" IN ('user', 'system', 'platform_admin')),
	CONSTRAINT "audit_events_action_not_empty" CHECK (char_length("audit_events"."action") > 0),
	CONSTRAINT "audit_events_entity_type_not_empty" CHECK (char_length("audit_events"."entity_type") > 0),
	CONSTRAINT "audit_events_metadata_object" CHECK (jsonb_typeof("audit_events"."metadata") = 'object'),
	CONSTRAINT "audit_events_prev_hash_sha256" CHECK (octet_length("audit_events"."prev_hash") = 32),
	CONSTRAINT "audit_events_hash_sha256" CHECK (octet_length("audit_events"."hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_lookup_hash" "bytea" NOT NULL,
	"code_hash" "bytea",
	"link_token_hash" "bytea",
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_attempts_range" CHECK ("auth_challenges"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("key","user_id"),
	CONSTRAINT "idempotency_keys_request_hash_sha256" CHECK (octet_length("idempotency_keys"."request_hash") = 32),
	CONSTRAINT "idempotency_keys_response_status_range" CHECK ("idempotency_keys"."response_status" BETWEEN 100 AND 599),
	CONSTRAINT "idempotency_keys_response_body_object" CHECK (jsonb_typeof("idempotency_keys"."response_body") = 'object')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent_summary" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "bytea" NOT NULL,
	"email_lookup_hash" "bytea" NOT NULL,
	"display_name" text NOT NULL,
	"ui_language" text DEFAULT 'xh' NOT NULL,
	"account_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_display_name_length" CHECK (char_length("users"."display_name") BETWEEN 1 AND 80),
	CONSTRAINT "users_ui_language_allowed" CHECK ("users"."ui_language" IN ('xh', 'en')),
	CONSTRAINT "users_account_role_allowed" CHECK ("users"."account_role" IN ('member', 'platform_admin')),
	CONSTRAINT "users_status_allowed" CHECK ("users"."status" IN ('active', 'closing', 'closed')),
	CONSTRAINT "users_version_positive" CHECK ("users"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_story_id_idx" ON "audit_events" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "auth_challenges_email_lookup_hash_idx" ON "auth_challenges" USING btree ("email_lookup_hash");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_active_user_idx" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lookup_hash_unique" ON "users" USING btree ("email_lookup_hash");
--> statement-breakpoint
ALTER TABLE "users" OWNER TO eoh_migrator;
ALTER TABLE "sessions" OWNER TO eoh_migrator;
ALTER TABLE "auth_challenges" OWNER TO eoh_migrator;
ALTER TABLE "audit_events" OWNER TO eoh_migrator;
ALTER TABLE "idempotency_keys" OWNER TO eoh_migrator;
ALTER SEQUENCE "audit_events_id_seq" OWNER TO eoh_migrator;
--> statement-breakpoint
REVOKE ALL ON TABLE "users", "sessions", "auth_challenges", "audit_events", "idempotency_keys" FROM PUBLIC, eoh_app;
REVOKE ALL ON SEQUENCE "audit_events_id_seq" FROM PUBLIC, eoh_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "users", "sessions", "auth_challenges", "idempotency_keys" TO eoh_app;
GRANT SELECT, INSERT ON TABLE "audit_events" TO eoh_app;
GRANT USAGE, SELECT ON SEQUENCE "audit_events_id_seq" TO eoh_app;
--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
		ALTER SCHEMA drizzle OWNER TO eoh_migrator;
		ALTER TABLE drizzle.__drizzle_migrations OWNER TO eoh_migrator;
		ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO eoh_migrator;
	END IF;
END
$$;
