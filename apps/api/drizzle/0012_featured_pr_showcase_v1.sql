CREATE TABLE IF NOT EXISTS "profile_featured_prs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"exercise_id" varchar(100) NOT NULL,
	"rep_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_featured_prs_slot_check" CHECK ("profile_featured_prs"."slot" BETWEEN 1 AND 3),
	CONSTRAINT "profile_featured_prs_rep_count_check" CHECK ("profile_featured_prs"."rep_count" BETWEEN 1 AND 12)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_featured_prs" ADD CONSTRAINT "profile_featured_prs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_featured_prs" ADD CONSTRAINT "profile_featured_prs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_featured_prs_user_slot_uidx" ON "profile_featured_prs" USING btree ("user_id","slot");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_featured_prs_user_exercise_uidx" ON "profile_featured_prs" USING btree ("user_id","exercise_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_featured_prs_user_id_idx" ON "profile_featured_prs" USING btree ("user_id");
