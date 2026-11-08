CREATE TABLE "transcript_revisions" (
  "id" uuid PRIMARY KEY NOT NULL, "segment_id" uuid NOT NULL, "actor_user_id" uuid NOT NULL, "from_text" text NOT NULL, "to_text" text NOT NULL, "version" integer NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "family_glossary_terms" (
  "id" uuid PRIMARY KEY NOT NULL, "story_id" uuid NOT NULL, "term" text NOT NULL, "category" text NOT NULL, "status" text DEFAULT 'proposed' NOT NULL, "proposed_by_user_id" uuid NOT NULL, "approved_by_user_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY NOT NULL, "recipient_user_id" uuid NOT NULL, "story_id" uuid NOT NULL, "kind" text NOT NULL, "read_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_segment_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE cascade;
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "family_glossary_terms" ADD CONSTRAINT "family_glossary_terms_story_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
ALTER TABLE "family_glossary_terms" ADD CONSTRAINT "family_glossary_terms_proposed_by_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "family_glossary_terms" ADD CONSTRAINT "family_glossary_terms_approved_by_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_story_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade;
CREATE UNIQUE INDEX "transcript_revisions_segment_version_unique" ON "transcript_revisions" USING btree ("segment_id","version");
ALTER TABLE "family_glossary_terms" ADD CONSTRAINT "family_glossary_terms_status_allowed" CHECK ("status" IN ('proposed','approved','rejected'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_allowed" CHECK ("kind" IN ('reviewer_invited','review_complete','transcript_approved'));
ALTER TABLE "transcript_revisions" OWNER TO eoh_migrator;
ALTER TABLE "family_glossary_terms" OWNER TO eoh_migrator;
ALTER TABLE "notifications" OWNER TO eoh_migrator;
REVOKE ALL ON TABLE "transcript_revisions","family_glossary_terms","notifications" FROM PUBLIC, eoh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "transcript_revisions","family_glossary_terms","notifications" TO eoh_app;
