-- An old API writes exercise_ids without knowing exercise_template. Keep the
-- configured V2 sets for retained exercises while applying that legacy edit.
-- No existing rows are rewritten by this migration.
CREATE OR REPLACE FUNCTION reconcile_routine_template_on_legacy_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prior_exercise jsonb;
  raw_id jsonb;
  exercise_id text;
  prior_ids text[] := ARRAY[]::text[];
  seen_ids text[] := ARRAY[]::text[];
  reconciled_exercises jsonb := '[]'::jsonb;
  canonical_ids jsonb := '[]'::jsonb;
BEGIN
  IF NEW.exercise_ids IS NOT DISTINCT FROM OLD.exercise_ids
     OR NEW.exercise_template IS DISTINCT FROM OLD.exercise_template THEN
    RETURN NEW;
  END IF;

  -- Corrupt/unknown templates are not rewritten. The application has its own
  -- tolerant normalization; this guard only operates on recognizable V2 data.
  IF OLD.exercise_template IS NULL
     OR jsonb_typeof(OLD.exercise_template) IS DISTINCT FROM 'object'
     OR OLD.exercise_template->'version' IS DISTINCT FROM '2'::jsonb
     OR jsonb_typeof(OLD.exercise_template->'exercises') IS DISTINCT FROM 'array'
     OR jsonb_typeof(NEW.exercise_ids) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  -- Reject ambiguous/corrupt exercise entries rather than losing any sets.
  FOR prior_exercise IN SELECT value FROM jsonb_array_elements(OLD.exercise_template->'exercises') LOOP
    IF jsonb_typeof(prior_exercise) IS DISTINCT FROM 'object'
       OR jsonb_typeof(prior_exercise->'exerciseId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(prior_exercise->'sets') IS DISTINCT FROM 'array' THEN
      RETURN NEW;
    END IF;
    IF jsonb_array_length(prior_exercise->'sets') = 0 THEN
      RETURN NEW;
    END IF;
    exercise_id := btrim(prior_exercise->>'exerciseId');
    IF exercise_id = '' OR exercise_id <> prior_exercise->>'exerciseId'
       OR exercise_id = ANY(prior_ids) THEN
      RETURN NEW;
    END IF;
    prior_ids := array_append(prior_ids, exercise_id);
  END LOOP;

  -- The old API accepts at most 100 string IDs. Keep first occurrence/order
  -- for duplicates, matching the domain reconciler's membership semantics.
  FOR raw_id IN SELECT value FROM jsonb_array_elements(NEW.exercise_ids) LOOP
    IF jsonb_typeof(raw_id) <> 'string' THEN
      CONTINUE;
    END IF;
    exercise_id := btrim(raw_id #>> '{}');
    IF exercise_id = '' OR exercise_id = ANY(seen_ids) THEN
      CONTINUE;
    END IF;
    EXIT WHEN cardinality(seen_ids) >= 100;
    seen_ids := array_append(seen_ids, exercise_id);
    canonical_ids := canonical_ids || to_jsonb(exercise_id);

    SELECT value INTO prior_exercise
    FROM jsonb_array_elements(OLD.exercise_template->'exercises')
    WHERE value->>'exerciseId' = exercise_id
    LIMIT 1;

    reconciled_exercises := reconciled_exercises || COALESCE(
      prior_exercise,
      jsonb_build_object(
        'exerciseId', exercise_id,
        'sets', jsonb_build_array(jsonb_build_object('setType', 'warmup', 'targetWeightKg', 0))
      )
    );
  END LOOP;

  NEW.exercise_ids := canonical_ids;
  NEW.exercise_template := jsonb_set(OLD.exercise_template, '{exercises}', reconciled_exercises);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'routines_legacy_template_reconcile_trigger'
      AND tgrelid = 'routines'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER routines_legacy_template_reconcile_trigger
      BEFORE UPDATE OF exercise_ids, exercise_template ON routines
      FOR EACH ROW
      EXECUTE FUNCTION reconcile_routine_template_on_legacy_update();
  END IF;
END;
$$;
