ALTER TABLE "stories" DROP CONSTRAINT "stories_status_draft_only_m2";
ALTER TABLE "stories" ADD CONSTRAINT "stories_status_allowed" CHECK ("stories"."status" IN ('draft','ready_to_record','uploading','processing','transcript_review','transcript_approved','translating','translation_review','final_review','approved','paused','deletion_pending','deleted'));

CREATE TABLE "story_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "story_id" uuid NOT NULL REFERENCES "stories"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "status" text NOT NULL,
  "transcript_hash" bytea NOT NULL,
  "translation_hash" bytea,
  "audio_asset_id" uuid NOT NULL REFERENCES "media_assets"("id"),
  "approved_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "approved_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "story_versions_status_allowed" CHECK ("status" IN ('approved','superseded','withdrawn')),
  CONSTRAINT "story_versions_version_positive" CHECK ("version_number" >= 1)
);
CREATE UNIQUE INDEX "story_versions_story_version_unique" ON "story_versions" USING btree ("story_id","version_number");
ALTER TABLE "story_versions" OWNER TO eoh_migrator;
REVOKE ALL ON TABLE "story_versions" FROM PUBLIC, eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "story_versions" TO eoh_app;
