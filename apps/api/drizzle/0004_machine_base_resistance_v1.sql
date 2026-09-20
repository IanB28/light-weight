-- Machine base resistance snapshot columns on logged_sets
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_profile_id" varchar(100);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_profile_label" varchar(100);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_base_resistance_kg" numeric(6, 2);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_base_resistance_status" varchar(20);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_base_source_label" varchar(255);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_base_source_url" text;
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_manufacturer" varchar(255);
ALTER TABLE "logged_sets" ADD COLUMN IF NOT EXISTS "machine_model" varchar(255);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_status_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_status_check"
      CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" IN ('none', 'unknown', 'suggested', 'verified', 'user_defined'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_kg_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_kg_check"
      CHECK ("machine_base_resistance_kg" IS NULL OR "machine_base_resistance_kg" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_unknown_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_unknown_check"
      CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" <> 'unknown' OR "machine_base_resistance_kg" IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_none_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_none_check"
      CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" <> 'none' OR "machine_base_resistance_kg" IS NULL OR "machine_base_resistance_kg" = 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_positive_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_positive_check"
      CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" NOT IN ('suggested', 'user_defined', 'verified') OR "machine_base_resistance_kg" > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logged_sets_machine_base_verified_check') THEN
    ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_machine_base_verified_check"
      CHECK ("machine_base_resistance_status" IS NULL OR "machine_base_resistance_status" <> 'verified' OR ("machine_base_resistance_kg" > 0 AND ("machine_base_source_url" IS NOT NULL OR ("machine_manufacturer" IS NOT NULL AND "machine_model" IS NOT NULL AND "machine_base_source_label" IS NOT NULL))));
  END IF;
END $$;
