CREATE TABLE "recordings" (
  "id" uuid PRIMARY KEY NOT NULL, "story_id" uuid NOT NULL, "status" text DEFAULT 'pending_upload' NOT NULL,
  "source" text NOT NULL, "declared_sha256" bytea NOT NULL, "declared_size_bytes" bigint, "declared_mime" text,
  "verified_sha256" bytea, "duration_ms" integer, "codec" text, "failure_reason" text,
  "upload_expires_at" timestamp with time zone NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "version" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "media_assets" (
  "id" uuid PRIMARY KEY NOT NULL, "story_id" uuid NOT NULL, "recording_id" uuid, "role" text NOT NULL,
  "provider" text NOT NULL, "provider_public_id" text NOT NULL, "provider_resource_type" text NOT NULL,
  "provider_delivery_type" text NOT NULL, "sha256" bytea, "size_bytes" bigint, "status" text DEFAULT 'pending' NOT NULL,
  "derived_from_asset_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "deleted_at" timestamp with time zone
);
CREATE TABLE "processing_jobs" (
  "id" uuid PRIMARY KEY NOT NULL, "story_id" uuid, "type" text NOT NULL, "status" text DEFAULT 'queued' NOT NULL,
  "input_ref" jsonb NOT NULL, "attempts" integer DEFAULT 0 NOT NULL, "max_attempts" integer DEFAULT 3 NOT NULL,
  "last_error_code" text, "correlation_id" text NOT NULL, "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "started_at" timestamp with time zone, "finished_at" timestamp with time zone
);
CREATE TABLE "webhook_receipts" (
  "provider" text NOT NULL, "provider_event_id" text NOT NULL, "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_receipts_provider_provider_event_id_pk" PRIMARY KEY("provider","provider_event_id")
);
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE set null;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_derived_from_asset_id_media_assets_id_fk" FOREIGN KEY ("derived_from_asset_id") REFERENCES "public"."media_assets"("id");
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
CREATE UNIQUE INDEX "recordings_one_live_story_unique" ON "recordings" USING btree ("story_id") WHERE "recordings"."status" NOT IN ('failed','abandoned','deleted');
CREATE UNIQUE INDEX "media_assets_provider_public_id_unique" ON "media_assets" USING btree ("provider","provider_public_id");
CREATE INDEX "media_assets_story_role_idx" ON "media_assets" USING btree ("story_id","role");
CREATE UNIQUE INDEX "processing_jobs_idempotency_unique" ON "processing_jobs" USING btree ("idempotency_key");
CREATE INDEX "processing_jobs_story_type_status_idx" ON "processing_jobs" USING btree ("story_id","type","status");
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_status_allowed" CHECK ("recordings"."status" IN ('pending_upload','uploaded','verifying','verified','failed','abandoned','deleted'));
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_source_allowed" CHECK ("recordings"."source" IN ('browser_recording','file_upload'));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_provider_allowed" CHECK ("media_assets"."provider" IN ('cloudinary','fake'));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_status_allowed" CHECK ("media_assets"."status" IN ('pending','available','failed','deleting','deleted'));
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_status_allowed" CHECK ("processing_jobs"."status" IN ('queued','waiting_budget','running','succeeded','failed_retryable','failed_permanent','cancelled'));
