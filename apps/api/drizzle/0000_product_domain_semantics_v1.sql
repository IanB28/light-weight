-- Product Domain Semantics v1
-- This is the first tracked incremental migration for an existing schema.
-- On a completely new database, create the baseline schema (`pnpm db:push`)
-- before running tracked migrations.

ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "load_mechanism" varchar(32);
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "load_mode" varchar(32);
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "supports_keyboard" boolean;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "supports_plates" boolean;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "supports_external_load" boolean;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "include_bar_weight" boolean;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_mechanism_check') THEN
    ALTER TABLE "exercises" ADD CONSTRAINT "exercises_load_mechanism_check"
      CHECK ("load_mechanism" IS NULL OR "load_mechanism" IN ('barbell', 'dumbbell', 'plate_loaded', 'selectorized', 'cable', 'bodyweight', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_mode_check') THEN
    ALTER TABLE "exercises" ADD CONSTRAINT "exercises_load_mode_check"
      CHECK ("load_mode" IS NULL OR "load_mode" IN ('total', 'per_side', 'per_hand', 'added_weight'));
  END IF;
END $$;

-- Conservative legacy backfill. Curated exceptions below have higher priority.
UPDATE "exercises"
SET
  "load_mechanism" = COALESCE("load_mechanism", CASE
    WHEN "category" = 'barbell' THEN 'barbell'
    WHEN "category" = 'dumbbell' THEN 'dumbbell'
    WHEN "category" = 'machine' THEN 'selectorized'
    WHEN "category" = 'cable' THEN 'cable'
    WHEN "category" = 'bodyweight' THEN 'bodyweight'
    ELSE 'other'
  END),
  "load_mode" = COALESCE("load_mode", CASE
    WHEN "category" = 'dumbbell' THEN 'per_hand'
    WHEN "category" = 'bodyweight' THEN 'added_weight'
    ELSE 'total'
  END),
  "supports_keyboard" = COALESCE("supports_keyboard", "category" <> 'barbell'),
  "supports_plates" = COALESCE("supports_plates", "category" = 'barbell'),
  "supports_external_load" = COALESCE("supports_external_load", true),
  "include_bar_weight" = COALESCE("include_bar_weight", "category" = 'barbell');

-- Known plate-loaded machines.
UPDATE "exercises"
SET "load_mechanism" = 'plate_loaded', "load_mode" = 'total',
    "supports_keyboard" = true, "supports_plates" = true,
    "supports_external_load" = true, "include_bar_weight" = false
WHERE "id" IN ('ex-0739', 'ex-0743', 'ex-0748', 'ex-0755', 'ex-0760');

-- Known selectorized and unilateral cable movements.
UPDATE "exercises"
SET "load_mechanism" = 'selectorized', "load_mode" = 'total',
    "supports_keyboard" = true, "supports_plates" = false,
    "supports_external_load" = true, "include_bar_weight" = false
WHERE "id" = 'ex-0585';

UPDATE "exercises"
SET "load_mechanism" = 'cable', "load_mode" = 'per_side',
    "supports_keyboard" = true, "supports_plates" = false,
    "supports_external_load" = true, "include_bar_weight" = false
WHERE "id" IN ('ex-0189', 'ex-0214');

UPDATE "exercises"
SET "load_mechanism" = 'bodyweight', "load_mode" = 'added_weight',
    "supports_keyboard" = true, "supports_plates" = false,
    "supports_external_load" = true, "include_bar_weight" = false
WHERE "id" IN ('ex-0841', 'ex-1755');

UPDATE "exercises"
SET "load_mechanism" = 'dumbbell', "load_mode" = 'per_hand',
    "supports_keyboard" = true, "supports_plates" = false,
    "supports_external_load" = true, "include_bar_weight" = false
WHERE "id" IN ('ex-0285', 'ex-0289');

ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "set_type" varchar(16);

UPDATE "logged_sets"
SET "set_type" = CASE WHEN "is_warmup" = true THEN 'warmup' ELSE 'working' END
WHERE "set_type" IS NULL OR "set_type" NOT IN ('working', 'warmup', 'drop', 'backoff');

-- Keep the deprecated mirror coherent for old clients and backups.
UPDATE "logged_sets" SET "is_warmup" = ("set_type" = 'warmup');

ALTER TABLE "logged_sets" ALTER COLUMN "set_type" SET DEFAULT 'working';
ALTER TABLE "logged_sets" ALTER COLUMN "set_type" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_set_type_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_set_type_check"
      CHECK ("set_type" IN ('working', 'warmup', 'drop', 'backoff'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_warmup_consistency_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_warmup_consistency_check"
      CHECK ("is_warmup" = ("set_type" = 'warmup'));
  END IF;
END $$;
