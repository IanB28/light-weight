-- Auth Identities V1 (Federated & External Identity Provider accounts)
-- Additive migration: enables Google sign-in and future identity providers without storing provider credentials on users.

CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL,
  "provider_subject" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "auth_identities_provider_check" CHECK ("provider" IN ('google'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_provider_subject_uidx" ON "auth_identities" ("provider", "provider_subject");
CREATE INDEX IF NOT EXISTS "auth_identities_user_id_idx" ON "auth_identities" ("user_id");
