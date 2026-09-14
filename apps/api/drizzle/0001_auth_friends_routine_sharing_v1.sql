-- Auth + User Identity + Friends V1 + Routine Sharing V1
-- Additive migration: existing demo/offline data remains intact.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(30);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" varchar(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" date;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(16);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;

UPDATE "users" SET "email" = lower(trim("email"));
UPDATE "users" SET "display_name" = COALESCE(NULLIF(trim("name"), ''), 'Atleta') WHERE "display_name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "display_name" SET DEFAULT 'Atleta';
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_normalized_uidx" ON "users" (lower("email"));
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_normalized_uidx" ON "users" (lower("username")) WHERE "username" IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_gender_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_gender_check"
      CHECK ("gender" IS NULL OR "gender" IN ('male', 'female'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "csrf_token_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "friendships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_a_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_b_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "friendships_distinct_users_check" CHECK ("user_a_id" <> "user_b_id"),
  CONSTRAINT "friendships_requester_check" CHECK ("requester_id" IN ("user_a_id", "user_b_id")),
  CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_user_pair_uidx" ON "friendships" ("user_a_id", "user_b_id");
CREATE INDEX IF NOT EXISTS "friendships_user_a_idx" ON "friendships" ("user_a_id");
CREATE INDEX IF NOT EXISTS "friendships_user_b_idx" ON "friendships" ("user_b_id");

CREATE TABLE IF NOT EXISTS "routine_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_routine_id" uuid REFERENCES "routines"("id") ON DELETE SET NULL,
  "sender_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "routine_name" varchar(255) NOT NULL,
  "routine_description" text,
  "exercise_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "imported_routine_id" uuid REFERENCES "routines"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "imported_at" timestamptz,
  CONSTRAINT "routine_shares_distinct_users_check" CHECK ("sender_id" <> "recipient_id"),
  CONSTRAINT "routine_shares_status_check" CHECK ("status" IN ('pending', 'imported', 'dismissed'))
);

-- Imported routines remain private copies, with a small immutable attribution
-- snapshot so the recipient can see who shared them after sync/reload.
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "origin" jsonb;
CREATE INDEX IF NOT EXISTS "routine_shares_recipient_idx" ON "routine_shares" ("recipient_id");
CREATE INDEX IF NOT EXISTS "routine_shares_sender_idx" ON "routine_shares" ("sender_id");
