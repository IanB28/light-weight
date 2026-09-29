import {
  getRoutineExerciseIds,
  isWorkoutSetType,
  normalizeRirValue,
  normalizeWorkoutSetType,
  resolveExercisePreviousPerformance,
  type Exercise,
  type ExercisePerformanceHead,
  type LoggedSet,
  type Routine,
  type WorkoutSession
} from '@light-weight/domain';
import type { ActiveExerciseSession } from './types.js';

export interface GetPreviousRoutineExercisePerformanceOptions {
  history: readonly WorkoutSession[];
  routine: Routine;
  exerciseId: string;
  currentRoutines?: readonly Routine[];
  beforeTimestamp?: number;
}

export interface BuildRoutineExerciseSessionsOptions {
  routine: Routine;
  exercisesById: Record<string, Exercise>;
  history?: readonly WorkoutSession[];
  routines?: readonly Routine[];
  beforeTimestamp?: number;
  remoteExercisePerformanceHeads?: Record<string, ExercisePerformanceHead>;
  createBaseExerciseSession: (exercise: Exercise) => ActiveExerciseSession;
}

/**
 * Resolves deterministic chronological timestamp for a workout session.
 * Uses ISO startedAt when valid, falling back to performedDate, and 0 for invalid dates.
 */
export function getSessionChronologicalTimestamp(session: WorkoutSession): number {
  if (session.startedAt) {
    const ms = Date.parse(session.startedAt);
    if (Number.isFinite(ms)) return ms;
  }
  if (session.performedDate) {
    const ms = Date.parse(`${session.performedDate}T12:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * Checks whether a historical session belongs to a target routine.
 *
 * Rules:
 * 1. Primary: exact routineId match (works whether currentRoutines is supplied or not).
 * 2. Conservative legacy fallback (only if session.routineId is absent/empty):
 *    Matches if session.routineName === routine.name AND currentRoutines is provided
 *    AND exactly one current routine has that name (unambiguous).
 *    If currentRoutines is undefined, empty, or has duplicate names, returns false.
 */
export function doesSessionMatchRoutine(
  session: WorkoutSession,
  targetRoutine: Routine,
  currentRoutines?: readonly Routine[]
): boolean {
  if (!session || typeof session !== 'object') return false;

  // Primary: exact routineId match
  if (session.routineId) {
    return session.routineId === targetRoutine.id;
  }

  // Conservative legacy fallback: only if session.routineId is absent/empty
  if (session.routineName && targetRoutine.name && session.routineName === targetRoutine.name) {
    if (currentRoutines && currentRoutines.length > 0) {
      const matchCount = currentRoutines.filter((r) => r.name === targetRoutine.name).length;
      return matchCount === 1;
    }
    return false;
  }

  return false;
}

/**
 * Deep-clones previously performed sets into fresh, decoupled active set objects.
 * Sets start incomplete (completed: false) and machine snapshots are cleared so that
 * today's session context is applied during the current workout.
 */
export function clonePreviousPerformanceSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.map((set, index) => {
    const setType = normalizeWorkoutSetType(set);
    return {
      setIndex: index + 1,
      weightKg: Math.max(0, Number.isFinite(set.weightKg) ? set.weightKg : 0),
      reps: Math.max(1, Number.isFinite(set.reps) ? Math.round(set.reps) : 8),
      completed: false,
      setType,
      isWarmup: setType === 'warmup',
      rir: set.rir !== undefined ? normalizeRirValue(set.rir) : undefined,
      machineProfileId: undefined,
      machineProfileLabel: undefined,
      machineBaseResistanceKg: undefined,
      machineBaseResistanceStatus: undefined,
      machineBaseSourceLabel: undefined,
      machineBaseSourceUrl: undefined,
      machineManufacturer: undefined,
      machineModel: undefined
    };
  });
}

/**
 * Priority 2 fallback: constructs sets from RoutineTemplateV2.
 * Uses template targetWeightKg, setType, default 8 reps, and undefined RIR.
 */
export function hydrateSetsFromRoutineTemplate(routine: Routine, exerciseId: string): LoggedSet[] | null {
  if (!routine.template || routine.template.version !== 2 || !Array.isArray(routine.template.exercises)) {
    return null;
  }
  const exerciseTemplate = routine.template.exercises.find((e) => e.exerciseId === exerciseId);
  if (!exerciseTemplate || !Array.isArray(exerciseTemplate.sets) || exerciseTemplate.sets.length === 0) {
    return null;
  }
  return exerciseTemplate.sets.map((setTemplate, index) => {
    const setType = isWorkoutSetType(setTemplate.setType) ? setTemplate.setType : 'warmup';
    return {
      setIndex: index + 1,
      weightKg: Math.max(0, Number.isFinite(setTemplate.targetWeightKg) ? setTemplate.targetWeightKg : 0),
      reps: 8,
      completed: false,
      setType,
      isWarmup: setType === 'warmup',
      rir: undefined,
      machineProfileId: undefined,
      machineProfileLabel: undefined,
      machineBaseResistanceKg: undefined,
      machineBaseResistanceStatus: undefined,
      machineBaseSourceLabel: undefined,
      machineBaseSourceUrl: undefined,
      machineManufacturer: undefined,
      machineModel: undefined
    };
  });
}

/**
 * Compatibility-only routine-scoped selector retained for historical callers/tests.
 * Active workout hydration uses resolveExercisePreviousPerformance instead.
 * Pure previous-performance selector.
 * Finds the latest valid completed performance for a specific exercise within a specific routine.
 * Continues backwards if the exercise was skipped or had 0 qualifying completed sets.
 */
export function getPreviousRoutineExercisePerformance(
  options: GetPreviousRoutineExercisePerformanceOptions
): LoggedSet[] | null {
  const { history, routine, exerciseId, currentRoutines, beforeTimestamp } = options;
  if (!routine || !exerciseId || !Array.isArray(history) || history.length === 0) {
    return null;
  }

  // Sort descending by actual workout chronology
  const sortedSessions = [...history].sort((a, b) => {
    const timeDiff = getSessionChronologicalTimestamp(b) - getSessionChronologicalTimestamp(a);
    if (timeDiff !== 0) return timeDiff;
    if (a.recordedAt && b.recordedAt) {
      const recDiff = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
      if (Number.isFinite(recDiff) && recDiff !== 0) return recDiff;
    }
    return 0;
  });

  for (const session of sortedSessions) {
    // Exclude HistoricalPersonalRecord or corrupt entities that do not have sets dictionary
    if (!session || typeof session !== 'object' || !session.sets || typeof session.sets !== 'object') {
      continue;
    }

    if (!doesSessionMatchRoutine(session, routine, currentRoutines)) {
      continue;
    }

    if (beforeTimestamp !== undefined) {
      const sessionTimestamp = getSessionChronologicalTimestamp(session);
      if (sessionTimestamp >= beforeTimestamp) {
        continue;
      }
    }

    const exerciseSets = session.sets[exerciseId];
    if (!Array.isArray(exerciseSets) || exerciseSets.length === 0) {
      // Skipped or omitted in this session; continue backwards in history!
      continue;
    }

    const qualifyingSets = exerciseSets.filter((set) => (
      set &&
      set.completed === true &&
      Number.isFinite(set.weightKg) &&
      set.weightKg >= 0 &&
      Number.isFinite(set.reps) &&
      set.reps > 0
    ));

    if (qualifyingSets.length > 0) {
      // Found the latest valid completed performance for this exercise in this routine!
      return clonePreviousPerformanceSets(qualifyingSets);
    }
    // If 0 qualifying sets were found in this session, continue backwards to find previous actual performance!
  }

  return null;
}

/**
 * Pure hydration pipeline for building routine workout sessions.
 *
 * Resolves each routine exercise using:
 * 1. Base exercise session (machine context, plate baseline, UI records)
 * 2. Priority 1: Previous valid performance in that specific routine (bounded by optional beforeTimestamp)
 * 3. Priority 2: RoutineTemplateV2 fallback
 * 4. Priority 3: Canonical default fallback
 */
export function buildRoutineExerciseSessions(
  options: BuildRoutineExerciseSessionsOptions
): ActiveExerciseSession[];
export function buildRoutineExerciseSessions(
  routine: Routine,
  exercisesById: Record<string, Exercise>,
  sessionCreator: (exercise: Exercise) => ActiveExerciseSession
): ActiveExerciseSession[];
export function buildRoutineExerciseSessions(
  routineOrOptions: Routine | BuildRoutineExerciseSessionsOptions,
  legacyExercisesById?: Record<string, Exercise>,
  legacySessionCreator?: (exercise: Exercise) => ActiveExerciseSession
): ActiveExerciseSession[] {
  let routine: Routine;
  let exercisesById: Record<string, Exercise>;
  let history: readonly WorkoutSession[] | undefined;
  let beforeTimestamp: number | undefined;
  let remoteExercisePerformanceHeads: Record<string, ExercisePerformanceHead> | undefined;
  let createBaseSession: (exercise: Exercise) => ActiveExerciseSession;

  if ('routine' in routineOrOptions && 'createBaseExerciseSession' in routineOrOptions) {
    routine = routineOrOptions.routine;
    exercisesById = routineOrOptions.exercisesById;
    history = routineOrOptions.history;
    beforeTimestamp = routineOrOptions.beforeTimestamp;
    remoteExercisePerformanceHeads = routineOrOptions.remoteExercisePerformanceHeads;
    createBaseSession = routineOrOptions.createBaseExerciseSession;
  } else {
    routine = routineOrOptions;
    exercisesById = legacyExercisesById || {};
    createBaseSession = legacySessionCreator!;
  }

  // Canonical exercise ordering from Routine V2 / fallback
  const exerciseIds = getRoutineExerciseIds(routine);

  return exerciseIds
    .map((id) => exercisesById[id])
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .map((exercise) => {
      const baseSession = createBaseSession(exercise);

      // Active hydration is exercise-centric; routine identity never hides a physical performance.
      if (history || remoteExercisePerformanceHeads) {
        const head = resolveExercisePreviousPerformance({
          history: history ?? [], exerciseId: exercise.id,
          remoteHead: remoteExercisePerformanceHeads?.[exercise.id], beforeTimestamp
        });
        const previousSets = head ? clonePreviousPerformanceSets(head.sets) : null;

        if (previousSets && previousSets.length > 0) {
          const usesAddedWeight = baseSession.exercise.loading?.loadMode === 'added_weight'
            ? (baseSession.usesAddedWeight ?? previousSets.some((s) => s.weightKg > 0))
            : baseSession.usesAddedWeight;
          return {
            ...baseSession,
            usesAddedWeight,
            sets: previousSets
          };
        }
      }

      // Priority 2: RoutineTemplateV2 fallback
      const templateSets = hydrateSetsFromRoutineTemplate(routine, exercise.id);
      if (templateSets && templateSets.length > 0) {
        const usesAddedWeight = baseSession.exercise.loading?.loadMode === 'added_weight'
          ? (baseSession.usesAddedWeight ?? templateSets.some((s) => s.weightKg > 0))
          : baseSession.usesAddedWeight;
        return {
          ...baseSession,
          usesAddedWeight,
          sets: templateSets
        };
      }

      // Priority 3: Canonical default
      return { ...baseSession, sets: [{
        setIndex: 1, weightKg: 0, reps: 8, completed: false, setType: 'warmup', isWarmup: true
      }] };
    });
}
