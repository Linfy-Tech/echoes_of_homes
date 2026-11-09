DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "story_versions") THEN
    RAISE EXCEPTION 'story_versions_forward_migration_requires_empty_table: old hash-only rows cannot be safely linked to transcript/translation IDs';
  END IF;
END
$$;

ALTER TABLE "stories" ADD COLUMN "current_story_version_id" uuid;

ALTER TABLE "story_versions"
  DROP COLUMN "transcript_hash",
  DROP COLUMN "translation_hash",
  DROP COLUMN "audio_asset_id",
  ADD COLUMN "transcript_id" uuid NOT NULL,
  ADD COLUMN "translation_id" uuid,
  ADD COLUMN "snapshot_hash" bytea NOT NULL,
  ADD COLUMN "accepted_uncertainty_count" integer DEFAULT 0 NOT NULL;

ALTER TABLE "story_versions"
  ADD CONSTRAINT "story_versions_transcript_fk" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "story_versions_translation_fk" FOREIGN KEY ("translation_id") REFERENCES "translations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "story_versions_accepted_uncertainty_nonnegative" CHECK ("accepted_uncertainty_count" >= 0);

CREATE UNIQUE INDEX "story_versions_one_current_approved" ON "story_versions" USING btree ("story_id") WHERE "status" = 'approved';

ALTER TABLE "stories"
  ADD CONSTRAINT "stories_current_story_version_fk" FOREIGN KEY ("current_story_version_id") REFERENCES "story_versions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "stories_audience_version_required" CHECK ("audience" = 'private' OR "current_story_version_id" IS NOT NULL);

CREATE OR REPLACE FUNCTION "assert_story_version_sources_approved"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "transcripts"
    WHERE "id" = NEW."transcript_id"
      AND "story_id" = NEW."story_id"
      AND "status" = 'approved_for_translation'
  ) THEN
    RAISE EXCEPTION 'story_version_transcript_not_approved' USING ERRCODE = '23514';
  END IF;
  IF NEW."translation_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "translations"
    WHERE "id" = NEW."translation_id"
      AND "story_id" = NEW."story_id"
      AND "source_transcript_id" = NEW."transcript_id"
      AND "status" = 'approved'
  ) THEN
    RAISE EXCEPTION 'story_version_translation_not_approved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "story_versions_approved_sources_guard"
  BEFORE INSERT OR UPDATE OF "story_id", "transcript_id", "translation_id"
  ON "story_versions" FOR EACH ROW EXECUTE FUNCTION "assert_story_version_sources_approved"();

ALTER TABLE "translations" DROP CONSTRAINT "translations_status_allowed";
ALTER TABLE "translations" ADD CONSTRAINT "translations_status_allowed" CHECK ("status" IN ('generating','machine_draft','verifying','in_review','approved','superseded','rejected','failed'));

ALTER TABLE "stories" OWNER TO eoh_migrator;
ALTER TABLE "story_versions" OWNER TO eoh_migrator;
REVOKE ALL ON TABLE "stories","story_versions" FROM PUBLIC, eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "stories","story_versions" TO eoh_app;
