-- Migration 0005: machine base resistance integrity constraints

-- 1. Ensure any historical 'none' rows have canonical machine_base_resistance_kg = 0
UPDATE "logged_sets"
SET "machine_base_resistance_kg" = 0
WHERE "machine_base_resistance_status" = 'none'
  AND ("machine_base_resistance_kg" IS NULL OR "machine_base_resistance_kg" <> 0);

-- 2. Sanitize historical contradictory rows where weight_kg < machine_base_resistance_kg
-- Degrades base claim to unknown/NULL while preserving weight_kg and machine_profile_id/label
UPDATE "logged_sets"
SET
  "machine_base_resistance_status" = 'unknown',
  "machine_base_resistance_kg" = NULL,
  "machine_base_source_label" = NULL,
  "machine_base_source_url" = NULL,
  "machine_manufacturer" = NULL,
  "machine_model" = NULL
WHERE "machine_base_resistance_kg" IS NOT NULL
  AND "weight_kg" < "machine_base_resistance_kg";

-- 3. Sanitize historical rows where machine_base_resistance_kg is present but status is NULL
-- Clears machine_base_resistance_kg and source fields while preserving weight_kg and profile id/label
UPDATE "logged_sets"
SET
  "machine_base_resistance_kg" = NULL,
  "machine_base_source_label" = NULL,
  "machine_base_source_url" = NULL,
  "machine_manufacturer" = NULL,
  "machine_model" = NULL
WHERE "machine_base_resistance_kg" IS NOT NULL
  AND "machine_base_resistance_status" IS NULL;

-- 4. Replace 'none' check with strengthened constraint requiring machine_base_resistance_kg = 0
ALTER TABLE "logged_sets"
DROP CONSTRAINT IF EXISTS "logged_sets_machine_base_none_check";

ALTER TABLE "logged_sets"
ADD CONSTRAINT "logged_sets_machine_base_none_check"
CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" <> 'none' OR "machine_base_resistance_kg" = 0);

-- 5. Add requires-status constraint: machine_base_resistance_kg requires machine_base_resistance_status
ALTER TABLE "logged_sets"
DROP CONSTRAINT IF EXISTS "logged_sets_machine_base_requires_status_check";

ALTER TABLE "logged_sets"
ADD CONSTRAINT "logged_sets_machine_base_requires_status_check"
CHECK ("machine_base_resistance_kg" IS NULL OR "machine_base_resistance_status" IS NOT NULL);

-- 6. Add total load invariant: weight_kg must be >= machine_base_resistance_kg when base resistance is present
ALTER TABLE "logged_sets"
DROP CONSTRAINT IF EXISTS "logged_sets_machine_base_total_load_check";

ALTER TABLE "logged_sets"
ADD CONSTRAINT "logged_sets_machine_base_total_load_check"
CHECK ("machine_base_resistance_kg" IS NULL OR "weight_kg" >= "machine_base_resistance_kg");
