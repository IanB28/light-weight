import { isWorkoutSetType } from './setSemantics.js';
import type { Routine, RoutineExerciseTemplate, RoutineSetTemplate, RoutineTemplateV2, WorkoutSetType } from './types.js';

export const DEFAULT_ROUTINE_SET_TYPE: WorkoutSetType = 'warmup';
export const DEFAULT_ROUTINE_SET_TARGET_WEIGHT_KG = 0;
export const MAX_ROUTINE_EXERCISES = 100;
export const MAX_ROUTINE_SETS_PER_EXERCISE = 50;

/** Default initial set prescribed when an exercise is added to a new routine. */
export function createDefaultRoutineSetTemplate(): RoutineSetTemplate {
  return {
    setType: DEFAULT_ROUTINE_SET_TYPE,
    targetWeightKg: DEFAULT_ROUTINE_SET_TARGET_WEIGHT_KG
  };
}

/** Default exercise template with exactly one 0 kg warmup set. */
export function createDefaultRoutineExerciseTemplate(exerciseId: string): RoutineExerciseTemplate {
  return {
    exerciseId: exerciseId.trim(),
    sets: [createDefaultRoutineSetTemplate()]
  };
}

/** Constructs a canonical RoutineTemplateV2 from an ordered list of exercise IDs. */
export function createDefaultRoutineTemplate(exerciseIds: readonly string[]): RoutineTemplateV2 {
  const seen = new Set<string>();
  const exercises: RoutineExerciseTemplate[] = [];
  for (const rawId of exerciseIds) {
    if (typeof rawId === 'string') {
      const id = rawId.trim();
      if (id.length > 0 && !seen.has(id)) {
        seen.add(id);
        exercises.push(createDefaultRoutineExerciseTemplate(id));
      }
    }
  }
  return {
    version: 2,
    exercises
  };
}

/** Validates that a target weight is finite, non-NaN, and non-negative. */
export function isValidRoutineTargetWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value) && value >= 0;
}

/** Validates and normalizes a single set template. Rejects NaN, Infinity, and negative weights. */
export function normalizeRoutineSetTemplate(input: unknown): RoutineSetTemplate | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const setTypeCandidate = candidate.setType ?? DEFAULT_ROUTINE_SET_TYPE;
  if (!isWorkoutSetType(setTypeCandidate)) return null;

  const rawWeight = candidate.targetWeightKg ?? candidate.weightKg;
  if (!isValidRoutineTargetWeight(rawWeight)) return null;

  return {
    setType: setTypeCandidate,
    targetWeightKg: Math.round(rawWeight * 100_000) / 100_000
  };
}

/**
 * Normalizes an exercise template, filtering duplicate exercise IDs and ensuring
 * at least one valid set exists (defaulting to 1 warmup / 0 kg if needed).
 */
export function normalizeRoutineExerciseTemplate(
  input: unknown,
  seenExerciseIds?: Set<string>
): RoutineExerciseTemplate | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.exerciseId !== 'string') return null;
  const exerciseId = candidate.exerciseId.trim();
  if (!exerciseId) return null;

  if (seenExerciseIds) {
    if (seenExerciseIds.has(exerciseId)) return null;
    seenExerciseIds.add(exerciseId);
  }

  const rawSets = Array.isArray(candidate.sets) ? candidate.sets : [];
  const validSets: RoutineSetTemplate[] = [];
  for (const rawSet of rawSets) {
    const normalized = normalizeRoutineSetTemplate(rawSet);
    if (normalized) {
      validSets.push(normalized);
    }
  }

  // Invariant E: each exercise has at least one set template.
  if (validSets.length === 0) {
    validSets.push(createDefaultRoutineSetTemplate());
  }

  return {
    exerciseId,
    sets: validSets
  };
}

/**
 * Normalizes a RoutineTemplateV2 structure.
 *
 * Uses the legacy compatibility projection (fallbackExerciseIds) to recover
 * malformed or missing template entries deterministically without dropping exercises.
 * For a fully valid V2 template, template order remains strictly canonical.
 */
export function normalizeRoutineTemplate(
  input: unknown,
  fallbackExerciseIds?: readonly string[]
): RoutineTemplateV2 | null {
  const fallbackList = Array.isArray(fallbackExerciseIds)
    ? fallbackExerciseIds.filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim())
    : [];
  const fallbackSet = new Set(fallbackList);

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    // 1. Attempt strict validation first.
    // If input is structurally valid, template.exercises is strictly authoritative.
    // Conflicting or extra fallback exerciseIds are ignored (omitted exercises are NOT resurrected).
    try {
      return validateRoutineTemplateV2(input);
    } catch {
      // 2. Strict validation failed: enter tolerant recovery mode.
    }

    const candidate = input as Record<string, unknown>;
    if (candidate.version === 2 && Array.isArray(candidate.exercises)) {
      const seenIds = new Set<string>();
      const exercises: RoutineExerciseTemplate[] = [];

      for (const ex of candidate.exercises) {
        const normalizedEx = normalizeRoutineExerciseTemplate(ex, seenIds);
        if (normalizedEx) {
          exercises.push(normalizedEx);
        } else {
          // If ex was malformed, check if its exerciseId exists in fallbackExerciseIds
          if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
            const rawId = (ex as Record<string, unknown>).exerciseId;
            if (typeof rawId === 'string') {
              const id = rawId.trim();
              if (id && fallbackSet.has(id) && !seenIds.has(id)) {
                seenIds.add(id);
                exercises.push(createDefaultRoutineExerciseTemplate(id));
              }
            }
          }
        }
      }

      // In tolerant recovery mode: use fallbackExerciseIds to recover exercises lost due to corruption:
      for (const fallbackId of fallbackList) {
        if (!seenIds.has(fallbackId)) {
          seenIds.add(fallbackId);
          exercises.push(createDefaultRoutineExerciseTemplate(fallbackId));
        }
      }

      return {
        version: 2,
        exercises
      };
    }
  }

  if (fallbackList.length > 0 || Array.isArray(fallbackExerciseIds)) {
    return createDefaultRoutineTemplate(fallbackList);
  }

  return null;
}

/**
 * Reconciles an incoming legacy exerciseIds list with an existing RoutineTemplateV2.
 *
 * - incomingExerciseIds order is authoritative for exercise membership and sequence.
 * - existingTemplate is authoritative for set count, set types, and target weights
 *   for exercises that still exist in incomingExerciseIds.
 * - New exercises absent from existingTemplate receive 1 warmup set @ 0 kg.
 * - Removed exercises (present in existingTemplate but absent in incomingExerciseIds) are omitted.
 * - Duplicate exercise IDs in incomingExerciseIds are deduplicated deterministically (first occurrence preserved).
 * - Never mutates input objects.
 * - If existingTemplate is null/undefined/invalid, creates a default V2 template from incomingExerciseIds.
 */
export function reconcileLegacyRoutineTemplate(
  existingTemplate: RoutineTemplateV2 | null | undefined,
  incomingExerciseIds: readonly string[]
): RoutineTemplateV2 {
  const existingByExerciseId = new Map<string, RoutineExerciseTemplate>();
  if (existingTemplate && existingTemplate.version === 2 && Array.isArray(existingTemplate.exercises)) {
    for (const ex of existingTemplate.exercises) {
      if (ex && typeof ex.exerciseId === 'string' && ex.exerciseId.trim() && Array.isArray(ex.sets)) {
        const id = ex.exerciseId.trim();
        if (!existingByExerciseId.has(id)) {
          const sets: RoutineSetTemplate[] = ex.sets
            .filter((s): s is RoutineSetTemplate => Boolean(s && isWorkoutSetType(s.setType) && isValidRoutineTargetWeight(s.targetWeightKg)))
            .map((s) => ({
              setType: s.setType,
              targetWeightKg: s.targetWeightKg
            }));
          existingByExerciseId.set(id, {
            exerciseId: id,
            sets: sets.length > 0 ? sets : [createDefaultRoutineSetTemplate()]
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const exercises: RoutineExerciseTemplate[] = [];

  for (const rawId of incomingExerciseIds) {
    if (typeof rawId === 'string') {
      const id = rawId.trim();
      if (id.length > 0 && !seen.has(id)) {
        seen.add(id);
        const existing = existingByExerciseId.get(id);
        if (existing) {
          exercises.push({
            exerciseId: id,
            sets: existing.sets.map((s) => ({ ...s }))
          });
        } else {
          exercises.push(createDefaultRoutineExerciseTemplate(id));
        }
      }
    }
  }

  return {
    version: 2,
    exercises
  };
}

/**
 * Extracts canonical exercise IDs. When template V2 exists, template.exercises array
 * order is strictly authoritative and defines the canonical sequence.
 */
export function getRoutineExerciseIds(
  routineOrTemplate: Routine | RoutineTemplateV2 | { template?: RoutineTemplateV2; exerciseIds?: string[] }
): string[] {
  if ('version' in routineOrTemplate && routineOrTemplate.version === 2 && Array.isArray(routineOrTemplate.exercises)) {
    return routineOrTemplate.exercises.map((e) => e.exerciseId);
  }
  if (
    'template' in routineOrTemplate &&
    routineOrTemplate.template &&
    routineOrTemplate.template.version === 2 &&
    Array.isArray(routineOrTemplate.template.exercises)
  ) {
    return routineOrTemplate.template.exercises.map((e) => e.exerciseId);
  }
  if ('exerciseIds' in routineOrTemplate && Array.isArray(routineOrTemplate.exerciseIds)) {
    return [...routineOrTemplate.exerciseIds];
  }
  return [];
}

/**
 * Central pure routine normalizer.
 * - Upgrades legacy routines to effective V2 templates (1 warmup set @ 0 kg).
 * - Preserves exact exercise order.
 * - Regenerates exerciseIds compatibility projection directly from canonical template order.
 * - Preserves routine origin (shared attribution) if present.
 * - Never crashes on corrupt or partial input.
 */
export function normalizeRoutine(input: unknown): Routine | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;

  const id = r.id.trim();
  const name = r.name.trim().slice(0, 255);
  const userId = typeof r.userId === 'string' && r.userId.trim() ? r.userId.trim() : 'local-anonymous';
  const description = typeof r.description === 'string' && r.description.trim() ? r.description.trim() : undefined;

  const rawExerciseIds = Array.isArray(r.exerciseIds)
    ? r.exerciseIds.filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim())
    : [];

  let template: RoutineTemplateV2;
  const rawTemplate = r.template ?? (r as { exerciseTemplate?: unknown }).exerciseTemplate;
  if (rawTemplate && typeof rawTemplate === 'object') {
    const normalized = normalizeRoutineTemplate(rawTemplate, rawExerciseIds);
    template = normalized ?? createDefaultRoutineTemplate(rawExerciseIds);
  } else {
    template = createDefaultRoutineTemplate(rawExerciseIds);
  }

  // Invariant I: exerciseIds is synchronized directly from canonical template order.
  const exerciseIds = template.exercises.map((e) => e.exerciseId);

  let origin: Routine['origin'] | undefined = undefined;
  if (r.origin && typeof r.origin === 'object' && !Array.isArray(r.origin)) {
    const orig = r.origin as Record<string, unknown>;
    if (orig.type === 'shared' && orig.sharedBy && typeof orig.sharedBy === 'object') {
      const sharedBy = orig.sharedBy as Record<string, unknown>;
      origin = {
        type: 'shared',
        sharedBy: {
          id: String(sharedBy.id || ''),
          username: String(sharedBy.username || ''),
          displayName: String(sharedBy.displayName || 'Atleta'),
          avatarUrl: typeof sharedBy.avatarUrl === 'string' ? sharedBy.avatarUrl : undefined
        },
        shareId: typeof orig.shareId === 'string' ? orig.shareId : undefined
      };
    }
  }

  return {
    id,
    userId,
    name,
    ...(description !== undefined ? { description } : {}),
    exerciseIds,
    template,
    ...(origin !== undefined ? { origin } : {})
  };
}

/**
 * Strict server-side validator for incoming RoutineTemplateV2 payloads.
 * Throws an Error with a descriptive reason if any invariant is violated.
 */
export function validateRoutineTemplateV2(raw: unknown): RoutineTemplateV2 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Template must be an object');
  }
  const t = raw as Record<string, unknown>;
  if (t.version !== 2) {
    throw new Error('Invalid template version: expected 2');
  }
  if (!Array.isArray(t.exercises)) {
    throw new Error('Template exercises must be an array');
  }
  if (t.exercises.length > MAX_ROUTINE_EXERCISES) {
    throw new Error(`Template exercises exceed maximum limit of ${MAX_ROUTINE_EXERCISES}`);
  }

  const seen = new Set<string>();
  const exercises: RoutineExerciseTemplate[] = [];

  for (let i = 0; i < t.exercises.length; i++) {
    const ex = t.exercises[i];
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
      throw new Error(`Exercise at index ${i} must be an object`);
    }
    const exercise = ex as Record<string, unknown>;
    if (typeof exercise.exerciseId !== 'string' || !exercise.exerciseId.trim() || exercise.exerciseId.length > 100) {
      throw new Error(`Exercise at index ${i} has invalid exerciseId`);
    }
    const exerciseId = exercise.exerciseId.trim();
    if (seen.has(exerciseId)) {
      throw new Error(`Duplicate exerciseId "${exerciseId}" in routine template`);
    }
    seen.add(exerciseId);

    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
      throw new Error(`Exercise "${exerciseId}" must have at least one set`);
    }
    if (exercise.sets.length > MAX_ROUTINE_SETS_PER_EXERCISE) {
      throw new Error(`Exercise "${exerciseId}" exceeds maximum set limit of ${MAX_ROUTINE_SETS_PER_EXERCISE}`);
    }

    const sets: RoutineSetTemplate[] = [];
    for (let sIdx = 0; sIdx < exercise.sets.length; sIdx++) {
      const set = exercise.sets[sIdx];
      if (!set || typeof set !== 'object' || Array.isArray(set)) {
        throw new Error(`Set at index ${sIdx} for exercise "${exerciseId}" must be an object`);
      }
      const s = set as Record<string, unknown>;
      if (!isWorkoutSetType(s.setType)) {
        throw new Error(`Invalid setType "${String(s.setType)}" in exercise "${exerciseId}"`);
      }
      const rawWeight = s.targetWeightKg ?? s.weightKg;
      if (!isValidRoutineTargetWeight(rawWeight)) {
        throw new Error(`Invalid targetWeightKg for set ${sIdx} in exercise "${exerciseId}"`);
      }
      sets.push({
        setType: s.setType,
        targetWeightKg: Math.round(rawWeight * 100_000) / 100_000
      });
    }

    exercises.push({ exerciseId, sets });
  }

  return { version: 2, exercises };
}
