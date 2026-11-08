CREATE TABLE "transcripts" (
  "id" uuid PRIMARY KEY NOT NULL, "story_id" uuid NOT NULL, "version_number" integer NOT NULL, "status" text NOT NULL,
  "derived_from_transcript_id" uuid, "asr_processing_job_id" uuid NOT NULL, "approved_by_user_id" uuid, "approved_at" timestamp with time zone,
  "content_hash" bytea, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "version" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "transcript_segments" (
  "id" uuid PRIMARY KEY NOT NULL, "transcript_id" uuid NOT NULL, "ordinal" integer NOT NULL, "start_ms" integer NOT NULL, "end_ms" integer NOT NULL,
  "text" text NOT NULL, "machine_text" text NOT NULL, "detected_languages" text[] DEFAULT '{}'::text[] NOT NULL, "asr_confidence" real,
  "review_state" text DEFAULT 'unreviewed' NOT NULL, "exclusion_reason" text, "current_revision" integer DEFAULT 1 NOT NULL, "version" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "uncertainty_flags" (
  "id" uuid PRIMARY KEY NOT NULL, "transcript_id" uuid NOT NULL, "segment_id" uuid NOT NULL, "char_start" integer, "char_end" integer,
  "reason" text NOT NULL, "source" text NOT NULL, "suggestion_text" text, "question_for_reviewer" text, "status" text DEFAULT 'open' NOT NULL,
  "resolved_by_user_id" uuid, "resolved_at" timestamp with time zone, "model_run_id" uuid
);
CREATE TABLE "model_runs" (
  "id" uuid PRIMARY KEY NOT NULL, "processing_job_id" uuid NOT NULL, "role" text NOT NULL, "provider" text NOT NULL, "model_id" text NOT NULL,
  "model_version_label" text, "prompt_id" text, "prompt_version" text, "params" jsonb DEFAULT '{}'::jsonb NOT NULL, "input_sha256" bytea NOT NULL,
  "output_sha256" bytea, "input_units" integer, "output_units" integer, "cost_usd_micros" integer, "latency_ms" integer, "outcome" text NOT NULL,
  "provider_request_id" text, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "job_step_results" (
  "processing_job_id" uuid NOT NULL, "step_kind" text NOT NULL, "step_index" integer NOT NULL, "result" jsonb NOT NULL, "model_run_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT "job_step_results_pk" PRIMARY KEY("processing_job_id","step_kind","step_index")
);
CREATE TABLE "ai_usage_daily" ("date" date NOT NULL, "provider" text NOT NULL, "cost_usd_micros" integer DEFAULT 0 NOT NULL, CONSTRAINT "ai_usage_daily_pk" PRIMARY KEY("date","provider"));
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_story_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_job_fk" FOREIGN KEY ("asr_processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade;
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade;
ALTER TABLE "uncertainty_flags" ADD CONSTRAINT "uncertainty_flags_transcript_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade;
ALTER TABLE "uncertainty_flags" ADD CONSTRAINT "uncertainty_flags_segment_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade;
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_job_fk" FOREIGN KEY ("processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade;
ALTER TABLE "job_step_results" ADD CONSTRAINT "job_step_results_job_fk" FOREIGN KEY ("processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade;
ALTER TABLE "job_step_results" ADD CONSTRAINT "job_step_results_model_run_fk" FOREIGN KEY ("model_run_id") REFERENCES "public"."model_runs"("id");
CREATE UNIQUE INDEX "transcripts_story_job_unique" ON "transcripts" USING btree ("story_id","asr_processing_job_id");
CREATE UNIQUE INDEX "transcripts_live_story_unique" ON "transcripts" USING btree ("story_id") WHERE "transcripts"."status" IN ('generating','machine_draft','in_review','review_complete');
CREATE UNIQUE INDEX "transcript_segments_transcript_ordinal_unique" ON "transcript_segments" USING btree ("transcript_id","ordinal");
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_status_allowed" CHECK ("status" IN ('generating','machine_draft','in_review','review_complete','approved_for_translation','superseded','failed'));
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_time_order" CHECK ("start_ms" >= 0 AND "end_ms" > "start_ms");
ALTER TABLE "job_step_results" ADD CONSTRAINT "job_step_results_kind_allowed" CHECK ("step_kind" IN ('asr_chunk','translation_batch','verify_batch'));
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_cost_nonnegative" CHECK ("cost_usd_micros" >= 0);
ALTER TABLE "transcripts" OWNER TO eoh_migrator;
ALTER TABLE "transcript_segments" OWNER TO eoh_migrator;
ALTER TABLE "uncertainty_flags" OWNER TO eoh_migrator;
ALTER TABLE "model_runs" OWNER TO eoh_migrator;
ALTER TABLE "job_step_results" OWNER TO eoh_migrator;
ALTER TABLE "ai_usage_daily" OWNER TO eoh_migrator;
REVOKE ALL ON TABLE "transcripts","transcript_segments","uncertainty_flags","model_runs","job_step_results","ai_usage_daily" FROM PUBLIC, eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "transcripts","transcript_segments","uncertainty_flags","model_runs","job_step_results","ai_usage_daily" TO eoh_app;
