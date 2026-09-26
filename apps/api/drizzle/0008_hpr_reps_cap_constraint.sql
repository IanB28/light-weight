ALTER TABLE "historical_personal_records" DROP CONSTRAINT IF EXISTS "hpr_reps_positive_check";
ALTER TABLE "historical_personal_records" ADD CONSTRAINT "hpr_reps_range_check" CHECK ("reps" BETWEEN 1 AND 12);
