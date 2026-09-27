import {
  Routine,
  RoutineExerciseTemplate,
  RoutineSetTemplate,
  RoutineTemplateV2,
  WorkoutSetType,
  createDefaultRoutineSetTemplate,
  getRoutineExerciseIds,
  isValidRoutineTargetWeight,
  isWorkoutSetType,
  normalizeRoutine
} from '@light-weight/domain';

export interface RoutineEditorSetDraft {
  id: string;
  setType: WorkoutSetType;
  targetWeightKg: number;
}

export interface RoutineEditorExerciseDraft {
  exerciseId: string;
  sets: RoutineEditorSetDraft[];
}

export interface RoutineEditorDraft {
  id?: string;
  name: string;
  description: string;
  exercises: RoutineEditorExerciseDraft[];
  ownerId?: string;
  origin?: Routine['origin'];
}

let setKeyCounter = 0;
function generateSetKey(exerciseId: string, index: number): string {
  setKeyCounter += 1;
  return `s-${exerciseId}-${index}-${Date.now()}-${setKeyCounter}`;
}

/**
 * Initializes a deep-cloned routine editor draft.
 * - When routine is supplied (EDIT mode): preloads existing ID, ownerId, origin,
 *   name, description, and canonical exercises and sets.
 * - When routine is omitted (CREATE mode): preloads blank name, description,
 *   and empty exercises.
 */
export function createRoutineEditorDraft(
  routine?: Routine | null,
  ownerId?: string
): RoutineEditorDraft {
  if (routine) {
    const canonicalExerciseIds = getRoutineExerciseIds(routine);
    const templateExercisesByExerciseId = new Map<string, RoutineExerciseTemplate>();

    if (routine.template?.version === 2 && Array.isArray(routine.template.exercises)) {
      for (const ex of routine.template.exercises) {
        if (ex && typeof ex.exerciseId === 'string') {
          templateExercisesByExerciseId.set(ex.exerciseId, ex);
        }
      }
    }

    const exercises: RoutineEditorExerciseDraft[] = canonicalExerciseIds.map((exerciseId) => {
      const existing = templateExercisesByExerciseId.get(exerciseId);
      if (existing && Array.isArray(existing.sets) && existing.sets.length > 0) {
        return {
          exerciseId,
          sets: existing.sets.map((s, idx) => ({
            id: generateSetKey(exerciseId, idx),
            setType: s.setType,
            targetWeightKg: s.targetWeightKg
          }))
        };
      }
      return {
        exerciseId,
        sets: [
          {
            id: generateSetKey(exerciseId, 0),
            setType: 'warmup',
            targetWeightKg: 0
          }
        ]
      };
    });

    return {
      id: routine.id,
      name: routine.name,
      description: routine.description ?? '',
      ownerId: routine.userId,
      origin: routine.origin ? JSON.parse(JSON.stringify(routine.origin)) : undefined,
      exercises
    };
  }

  return {
    id: undefined,
    name: '',
    description: '',
    ownerId: ownerId || 'local-anonymous',
    origin: undefined,
    exercises: []
  };
}

/**
 * Appends a new exercise to the routine template draft with 1 warmup set @ 0 kg.
 * Rejects duplicate exercise IDs.
 */
export function addRoutineExerciseTemplate(
  draft: RoutineEditorDraft,
  exerciseId: string
): RoutineEditorDraft {
  const cleanId = exerciseId.trim();
  if (!cleanId) return draft;
  if (draft.exercises.some((e) => e.exerciseId === cleanId)) {
    return draft;
  }

  return {
    ...draft,
    exercises: [
      ...draft.exercises,
      {
        exerciseId: cleanId,
        sets: [
          {
            id: generateSetKey(cleanId, 0),
            setType: 'warmup',
            targetWeightKg: 0
          }
        ]
      }
    ]
  };
}

/**
 * Immutably removes an exercise from the routine template draft.
 */
export function removeRoutineExerciseTemplate(
  draft: RoutineEditorDraft,
  exerciseId: string
): RoutineEditorDraft {
  return {
    ...draft,
    exercises: draft.exercises.filter((e) => e.exerciseId !== exerciseId)
  };
}

/**
 * Explicitly moves an exercise within the canonical routine sequence.
 */
export function moveRoutineExercise(
  draft: RoutineEditorDraft,
  fromIndex: number,
  toIndex: number
): RoutineEditorDraft {
  if (
    fromIndex < 0 ||
    fromIndex >= draft.exercises.length ||
    toIndex < 0 ||
    toIndex >= draft.exercises.length ||
    fromIndex === toIndex
  ) {
    return draft;
  }

  const nextExercises = [...draft.exercises];
  const [item] = nextExercises.splice(fromIndex, 1);
  nextExercises.splice(toIndex, 0, item);

  return {
    ...draft,
    exercises: nextExercises
  };
}

/**
 * Adds a new set to an exercise in the routine template draft.
 * Invariant: clones the previous set's setType and targetWeightKg.
 * For the very first set: defaults to warmup 0 kg.
 */
export function addRoutineTemplateSet(
  draft: RoutineEditorDraft,
  exerciseId: string
): RoutineEditorDraft {
  const exerciseIndex = draft.exercises.findIndex((e) => e.exerciseId === exerciseId);
  if (exerciseIndex < 0) return draft;

  const currentExercise = draft.exercises[exerciseIndex];
  const lastSet = currentExercise.sets[currentExercise.sets.length - 1];

  const newSet: RoutineEditorSetDraft = {
    id: generateSetKey(exerciseId, currentExercise.sets.length),
    setType: lastSet ? lastSet.setType : 'warmup',
    targetWeightKg: lastSet ? lastSet.targetWeightKg : 0
  };

  const updatedExercise: RoutineEditorExerciseDraft = {
    ...currentExercise,
    sets: [...currentExercise.sets, newSet]
  };

  const nextExercises = [...draft.exercises];
  nextExercises[exerciseIndex] = updatedExercise;

  return {
    ...draft,
    exercises: nextExercises
  };
}

/**
 * Removes a set from an exercise.
 * Invariant: an exercise MUST always retain at least one set template.
 * If only 1 set remains, the removal is safely prevented.
 */
export function removeRoutineTemplateSet(
  draft: RoutineEditorDraft,
  exerciseId: string,
  setIndex: number
): RoutineEditorDraft {
  const exerciseIndex = draft.exercises.findIndex((e) => e.exerciseId === exerciseId);
  if (exerciseIndex < 0) return draft;

  const currentExercise = draft.exercises[exerciseIndex];
  if (currentExercise.sets.length <= 1) {
    // Preserve invariant: at least one set per exercise
    return draft;
  }

  if (setIndex < 0 || setIndex >= currentExercise.sets.length) {
    return draft;
  }

  const nextSets = currentExercise.sets.filter((_, idx) => idx !== setIndex);
  const updatedExercise: RoutineEditorExerciseDraft = {
    ...currentExercise,
    sets: nextSets
  };

  const nextExercises = [...draft.exercises];
  nextExercises[exerciseIndex] = updatedExercise;

  return {
    ...draft,
    exercises: nextExercises
  };
}

/**
 * Updates a set's setType or targetWeightKg.
 */
export function updateRoutineTemplateSet(
  draft: RoutineEditorDraft,
  exerciseId: string,
  setIndex: number,
  updates: Partial<{ setType: WorkoutSetType; targetWeightKg: number }>
): RoutineEditorDraft {
  const exerciseIndex = draft.exercises.findIndex((e) => e.exerciseId === exerciseId);
  if (exerciseIndex < 0) return draft;

  const currentExercise = draft.exercises[exerciseIndex];
  if (setIndex < 0 || setIndex >= currentExercise.sets.length) {
    return draft;
  }

  const currentSet = currentExercise.sets[setIndex];
  let setType = currentSet.setType;
  if (updates.setType !== undefined && isWorkoutSetType(updates.setType)) {
    setType = updates.setType;
  }

  let targetWeightKg = currentSet.targetWeightKg;
  if (updates.targetWeightKg !== undefined && isValidRoutineTargetWeight(updates.targetWeightKg)) {
    targetWeightKg = Math.round(updates.targetWeightKg * 100_000) / 100_000;
  }

  const updatedSet: RoutineEditorSetDraft = {
    ...currentSet,
    setType,
    targetWeightKg
  };

  const nextSets = [...currentExercise.sets];
  nextSets[setIndex] = updatedSet;

  const updatedExercise: RoutineEditorExerciseDraft = {
    ...currentExercise,
    sets: nextSets
  };

  const nextExercises = [...draft.exercises];
  nextExercises[exerciseIndex] = updatedExercise;

  return {
    ...draft,
    exercises: nextExercises
  };
}

/**
 * Computes whether the current draft has unsaved changes compared to the initial draft.
 */
export function isRoutineEditorDraftDirty(
  initialDraft: RoutineEditorDraft,
  currentDraft: RoutineEditorDraft
): boolean {
  if (initialDraft.name.trim() !== currentDraft.name.trim()) return true;
  if (initialDraft.description.trim() !== currentDraft.description.trim()) return true;

  if (initialDraft.exercises.length !== currentDraft.exercises.length) return true;

  for (let i = 0; i < initialDraft.exercises.length; i++) {
    const initEx = initialDraft.exercises[i];
    const currEx = currentDraft.exercises[i];

    if (initEx.exerciseId !== currEx.exerciseId) return true;
    if (initEx.sets.length !== currEx.sets.length) return true;

    for (let s = 0; s < initEx.sets.length; s++) {
      const initSet = initEx.sets[s];
      const currSet = currEx.sets[s];

      if (initSet.setType !== currSet.setType) return true;
      if (Math.abs(initSet.targetWeightKg - currSet.targetWeightKg) > 0.0001) return true;
    }
  }

  return false;
}

/**
 * Validates whether the draft is ready to be saved.
 * Requires:
 * - non-empty name
 * - at least 1 exercise
 * - every exercise has >= 1 valid set
 */
export function canSaveRoutineEditorDraft(draft: RoutineEditorDraft): boolean {
  if (!draft.name.trim()) return false;
  if (draft.exercises.length === 0) return false;

  for (const ex of draft.exercises) {
    if (!ex.exerciseId) return false;
    if (ex.sets.length === 0) return false;
    for (const set of ex.sets) {
      if (!isWorkoutSetType(set.setType)) return false;
      if (!isValidRoutineTargetWeight(set.targetWeightKg)) return false;
    }
  }

  return true;
}

/**
 * Assembles and normalizes the final Routine payload from the draft.
 * - Preserves routine ID in edit mode, or generates a new ID.
 * - Preserves owner ID.
 * - Preserves origin metadata.
 * - Authoritative canonical RoutineTemplateV2 structure.
 * - Regenerates exerciseIds from canonical template order.
 */
export function buildRoutineFromEditorDraft(
  draft: RoutineEditorDraft,
  options?: { generatedId?: string }
): Routine {
  const id = draft.id || options?.generatedId || ('rt-' + Date.now());
  const template: RoutineTemplateV2 = {
    version: 2,
    exercises: draft.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.map((s) => ({
        setType: s.setType,
        targetWeightKg: Math.round(s.targetWeightKg * 100_000) / 100_000
      }))
    }))
  };

  const raw: Routine = {
    id,
    userId: draft.ownerId || 'local-anonymous',
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    exerciseIds: template.exercises.map((e) => e.exerciseId),
    template,
    ...(draft.origin ? { origin: { ...draft.origin } } : {})
  };

  return normalizeRoutine(raw) || raw;
}
