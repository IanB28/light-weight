-- Exercise loading bodyweight v2 (assisted load mode and explicit bodyweight factor)
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "bodyweight_factor" double precision;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_mode_check') THEN
    ALTER TABLE "exercises" DROP CONSTRAINT "exercises_load_mode_check";
  END IF;
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_load_mode_check"
    CHECK ("load_mode" IS NULL OR "load_mode" IN ('total', 'per_side', 'per_hand', 'added_weight', 'assisted'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_bodyweight_factor_check') THEN
    ALTER TABLE "exercises" ADD CONSTRAINT "exercises_bodyweight_factor_check"
      CHECK ("bodyweight_factor" IS NULL OR ("bodyweight_factor" > 0 AND "bodyweight_factor" <= 1));
  END IF;
END $$;
