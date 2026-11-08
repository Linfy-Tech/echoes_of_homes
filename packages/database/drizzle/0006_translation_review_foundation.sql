CREATE TABLE "translations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "story_id" uuid NOT NULL REFERENCES "stories"("id") ON DELETE CASCADE,
  "source_transcript_id" uuid NOT NULL REFERENCES "transcripts"("id"),
  "version_number" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'machine_draft' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "translations_status_allowed" CHECK ("translations"."status" IN ('machine_draft','in_review','approved','rejected','superseded')),
  CONSTRAINT "translations_version_positive" CHECK ("translations"."version_number" >= 1)
);
CREATE UNIQUE INDEX "translations_source_version_unique" ON "translations" USING btree ("source_transcript_id","version_number");

CREATE OR REPLACE FUNCTION "assert_translation_source_approved"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "transcripts" WHERE "id" = NEW."source_transcript_id" AND "story_id" = NEW."story_id" AND "status" = 'approved_for_translation') THEN
    RAISE EXCEPTION 'translation_source_not_approved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "translations_source_approved_guard" BEFORE INSERT OR UPDATE OF "source_transcript_id", "story_id" ON "translations" FOR EACH ROW EXECUTE FUNCTION "assert_translation_source_approved"();

CREATE TABLE "translation_segments" (
  "id" uuid PRIMARY KEY NOT NULL,
  "translation_id" uuid NOT NULL REFERENCES "translations"("id") ON DELETE CASCADE,
  "source_segment_id" uuid NOT NULL REFERENCES "transcript_segments"("id"),
  "close_text" text NOT NULL,
  "natural_text" text NOT NULL,
  "machine_close_text" text NOT NULL,
  "machine_natural_text" text NOT NULL,
  "render_mode" text DEFAULT 'normal' NOT NULL,
  "review_state" text DEFAULT 'unreviewed' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "translation_segments_render_mode_allowed" CHECK ("translation_segments"."render_mode" IN ('normal','unclear_marker','inaudible_marker')),
  CONSTRAINT "translation_segments_review_state_allowed" CHECK ("translation_segments"."review_state" IN ('unreviewed','reviewed','edited'))
);
CREATE UNIQUE INDEX "translation_segments_source_unique" ON "translation_segments" USING btree ("translation_id","source_segment_id");

CREATE TABLE "verification_reports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "translation_id" uuid NOT NULL UNIQUE REFERENCES "translations"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "checks_run" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "verification_reports_status_allowed" CHECK ("verification_reports"."status" IN ('complete','incomplete')),
  CONSTRAINT "verification_reports_checks_array" CHECK (jsonb_typeof("verification_reports"."checks_run") = 'array')
);

CREATE TABLE "verification_issues" (
  "id" uuid PRIMARY KEY NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "verification_reports"("id") ON DELETE CASCADE,
  "translation_segment_id" uuid REFERENCES "translation_segments"("id") ON DELETE CASCADE,
  "check_id" text NOT NULL,
  "severity" text NOT NULL,
  "detail" jsonb NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "dismiss_reason" text,
  "resolved_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  CONSTRAINT "verification_issues_severity_allowed" CHECK ("verification_issues"."severity" IN ('blocking','warning')),
  CONSTRAINT "verification_issues_status_allowed" CHECK ("verification_issues"."status" IN ('open','resolved','dismissed')),
  CONSTRAINT "verification_issues_detail_object" CHECK (jsonb_typeof("verification_issues"."detail") = 'object')
);

ALTER TABLE "translations" OWNER TO eoh_migrator;
ALTER TABLE "translation_segments" OWNER TO eoh_migrator;
ALTER TABLE "verification_reports" OWNER TO eoh_migrator;
ALTER TABLE "verification_issues" OWNER TO eoh_migrator;
REVOKE ALL ON TABLE "translations","translation_segments","verification_reports","verification_issues" FROM PUBLIC, eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "translations","translation_segments","verification_reports","verification_issues" TO eoh_app;
