ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "exercise_template" jsonb;
ALTER TABLE "routine_shares" ADD COLUMN IF NOT EXISTS "exercise_template" jsonb;
