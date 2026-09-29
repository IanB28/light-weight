-- Preserve configured V2 routine sets when an older API creates or imports a
-- share without knowing exercise_template. Existing rows are not rewritten.
CREATE OR REPLACE FUNCTION reconcile_v2_routine_template_snapshot(
  source_template jsonb,
  requested_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  source_exercise jsonb;
  raw_id jsonb;
  exercise_id text;
  source_ids text[] := ARRAY[]::text[];
  seen_ids text[] := ARRAY[]::text[];
  reconciled_exercises jsonb := '[]'::jsonb;
BEGIN
  IF source_template IS NULL
     OR jsonb_typeof(source_template) IS DISTINCT FROM 'object'
     OR source_template->'version' IS DISTINCT FROM '2'::jsonb
     OR jsonb_typeof(source_template->'exercises') IS DISTINCT FROM 'array'
     OR jsonb_typeof(requested_ids) IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  -- Match 0010's fail-safe shape checks. Ambiguous or corrupt configured
  -- entries must not be partially copied into a new share/import.
  FOR source_exercise IN SELECT value FROM jsonb_array_elements(source_template->'exercises') LOOP
    IF jsonb_typeof(source_exercise) IS DISTINCT FROM 'object'
       OR jsonb_typeof(source_exercise->'exerciseId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(source_exercise->'sets') IS DISTINCT FROM 'array' THEN
      RETURN NULL;
    END IF;
    IF jsonb_array_length(source_exercise->'sets') = 0 THEN
      RETURN NULL;
    END IF;
    exercise_id := btrim(source_exercise->>'exerciseId');
    IF exercise_id = '' OR exercise_id <> source_exercise->>'exerciseId'
       OR exercise_id = ANY(source_ids) THEN
      RETURN NULL;
    END IF;
    source_ids := array_append(source_ids, exercise_id);
  END LOOP;

  -- Preserve the first occurrence/order and at most 100 IDs, exactly as the
  -- D3 routine guard does. Retained objects are copied without modification.
  FOR raw_id IN SELECT value FROM jsonb_array_elements(requested_ids) LOOP
    IF jsonb_typeof(raw_id) <> 'string' THEN
      CONTINUE;
    END IF;
    exercise_id := btrim(raw_id #>> '{}');
    IF exercise_id = '' OR exercise_id = ANY(seen_ids) THEN
      CONTINUE;
    END IF;
    EXIT WHEN cardinality(seen_ids) >= 100;
    seen_ids := array_append(seen_ids, exercise_id);

    SELECT value INTO source_exercise
    FROM jsonb_array_elements(source_template->'exercises')
    WHERE value->>'exerciseId' = exercise_id
    LIMIT 1;

    reconciled_exercises := reconciled_exercises || COALESCE(
      source_exercise,
      jsonb_build_object(
        'exerciseId', exercise_id,
        'sets', jsonb_build_array(jsonb_build_object('setType', 'warmup', 'targetWeightKg', 0))
      )
    );
  END LOOP;

  RETURN jsonb_set(source_template, '{exercises}', reconciled_exercises);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION snapshot_legacy_routine_share_template()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_template jsonb;
  snapshot jsonb;
BEGIN
  IF NEW.exercise_template IS NOT NULL OR NEW.source_routine_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A share may only inherit configured data from its sender-owned source.
  SELECT exercise_template INTO source_template
  FROM routines
  WHERE id = NEW.source_routine_id AND user_id = NEW.sender_id;

  snapshot := reconcile_v2_routine_template_snapshot(source_template, NEW.exercise_ids);
  IF snapshot IS NOT NULL THEN
    NEW.exercise_template := snapshot;
    NEW.exercise_ids := (
      SELECT COALESCE(jsonb_agg(entry.value->'exerciseId' ORDER BY entry.ordinality), '[]'::jsonb)
      FROM jsonb_array_elements(snapshot->'exercises') WITH ORDINALITY AS entry(value, ordinality)
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hydrate_legacy_imported_routine_template()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  imported_ids jsonb;
  configured_template jsonb;
  canonical_ids jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'imported'
     OR OLD.imported_routine_id IS NOT NULL
     OR NEW.imported_routine_id IS NULL
     OR NEW.exercise_template IS DISTINCT FROM OLD.exercise_template
     OR NEW.exercise_ids IS DISTINCT FROM OLD.exercise_ids THEN
    RETURN NEW;
  END IF;

  -- Lock only the recipient's newly imported clone. A current V2 import
  -- already has a template and must never be overwritten by this guard.
  SELECT exercise_ids INTO imported_ids
  FROM routines
  WHERE id = NEW.imported_routine_id
    AND user_id = NEW.recipient_id
    AND exercise_template IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  configured_template := reconcile_v2_routine_template_snapshot(NEW.exercise_template, imported_ids);
  IF configured_template IS NULL THEN
    RETURN NEW;
  END IF;

  canonical_ids := (
    SELECT COALESCE(jsonb_agg(entry.value->'exerciseId' ORDER BY entry.ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(configured_template->'exercises') WITH ORDINALITY AS entry(value, ordinality)
  );
  UPDATE routines
  SET exercise_ids = canonical_ids, exercise_template = configured_template
  WHERE id = NEW.imported_routine_id
    AND user_id = NEW.recipient_id
    AND exercise_template IS NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'routine_shares_legacy_snapshot_trigger'
      AND tgrelid = 'routine_shares'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER routine_shares_legacy_snapshot_trigger
      BEFORE INSERT ON routine_shares
      FOR EACH ROW
      EXECUTE FUNCTION snapshot_legacy_routine_share_template();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'routine_shares_legacy_import_reconcile_trigger'
      AND tgrelid = 'routine_shares'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER routine_shares_legacy_import_reconcile_trigger
      AFTER UPDATE OF status, imported_routine_id ON routine_shares
      FOR EACH ROW
      EXECUTE FUNCTION hydrate_legacy_imported_routine_template();
  END IF;
END;
$$;
