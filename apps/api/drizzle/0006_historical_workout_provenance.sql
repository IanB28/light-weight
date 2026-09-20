-- Block 16: provenance is additive; legacy sessions deliberately remain NULL.
ALTER TABLE "workout_sessions"
  ADD COLUMN IF NOT EXISTS "performed_date" date,
  ADD COLUMN IF NOT EXISTS "recorded_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "entry_source" varchar(32);

ALTER TABLE "workout_sessions"
  DROP CONSTRAINT IF EXISTS "workout_sessions_entry_source_check";

ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_entry_source_check"
  CHECK ("entry_source" IS NULL OR "entry_source" IN ('live', 'historical_manual'));
