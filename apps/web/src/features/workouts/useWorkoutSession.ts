import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  normalizeLoggedSet,
  resolveExerciseLoadingProfile,
  resolvePlateBaseWeightKg,
  type Exercise,
  type LoggedSet,
  type MuscleGroup,
  type Routine,
  type WorkoutSession,
  type WorkoutSetType
} from '@light-weight/domain';
import {
  clearActiveWorkout,
  getStoredActiveWorkout,
  saveActiveWorkout,
  saveCompletedWorkout
} from '../../lib/storage.js';
import { requestWakeLock, releaseWakeLock } from '../../lib/wakelock.js';
import type { AppPreferences, WeightInputMode } from '../../lib/preferences.js';
import { formatDisplayWeight, getDefaultPlateLoadedWeightKg } from '../../lib/weight-units.js';
import {
  buildWorkoutHistoryIndex,
  type WorkoutHistoryIndex
} from '../../lib/workout-history-index.js';
import { formatElapsedDuration, workoutElapsedSeconds, workoutStartFromLegacySeconds } from './workout-time.js';
import type { ActiveExerciseSession } from './types.js';
import { resolveInitialWeightKg } from './initial-weight.js';

interface StoredActiveWorkout {
  isWorkoutActive: boolean;
  workoutSeconds?: number;
  activeRoutineName?: string;
  exerciseSessions?: ActiveExerciseSession[];
  workoutStartTime?: string;
}

export interface UseWorkoutSessionOptions {
  exercises: Exercise[];
  routines: Routine[];
  history: WorkoutSession[];
  historyIndex?: WorkoutHistoryIndex;
  preferences: AppPreferences;
  userId?: string;
}

export interface WorkoutFinishResult {
  session: WorkoutSession;
  history: WorkoutSession[];
}

const FALLBACK_USER_ID = 'local-anonymous';

function normalizeActiveExerciseSession(session: ActiveExerciseSession): ActiveExerciseSession {
  const legacySession = session as ActiveExerciseSession & { weightInputMode?: WeightInputMode };
  const { weightInputMode: _legacyWeightInputMode, ...restoredSession } = legacySession;
  const loading = resolveExerciseLoadingProfile(restoredSession.exercise).profile;
  const normalized = {
    ...restoredSession,
    exercise: { ...restoredSession.exercise, loading },
    sets: restoredSession.sets.map((set) => normalizeLoggedSet(set))
  };
  return loading.loadMode === 'added_weight'
    ? {
        ...normalized,
        usesAddedWeight: normalized.usesAddedWeight
          ?? normalized.sets.some((set) => set.weightKg > 0)
      }
    : {
        ...normalized,
        plateBaseWeightKg: normalized.plateBaseWeightKg ?? loading.plateBase?.weightKg
      };
}

function createWorkoutId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
}

export function useWorkoutSession({
  exercises,
  routines,
  history,
  historyIndex: suppliedHistoryIndex,
  preferences,
  userId = FALLBACK_USER_ID
}: UseWorkoutSessionOptions) {
  const historyIndex = useMemo(
    () => suppliedHistoryIndex || buildWorkoutHistoryIndex(history),
    [history, suppliedHistoryIndex]
  );
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [activeRoutineName, setActiveRoutineName] = useState('Entrenamiento Libre');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const priorWeightInputMode = useRef(preferences.weightInputMode);
  const activeSnapshotRef = useRef<StoredActiveWorkout | null>(null);

  const createExerciseSession = (exercise: Exercise): ActiveExerciseSession => {
    const loading = resolveExerciseLoadingProfile(exercise).profile;
    const previous = historyIndex.latestPerformanceByExercise[exercise.id];
    const previousTopSet = previous?.sets.reduce<LoggedSet | null>(
      (best, set) => !best || set.weightKg > best.weightKg ? set : best,
      null
    );
    const personalRecord = historyIndex.personalRecordsByExercise[exercise.id];
    const startsWithPlates = loading.supportsPlates && (
      !loading.supportsKeyboard || preferences.weightInputMode === 'plates'
    );
    const semanticDefaultWeight = startsWithPlates
      ? getDefaultPlateLoadedWeightKg(
          preferences.units,
          resolvePlateBaseWeightKg(loading, preferences.defaultBarWeightKg),
          preferences.availablePlatesKg,
          loading
        )
      : loading.loadMode === 'added_weight'
        ? 0
        : loading.mechanism === 'dumbbell'
          ? 0
          : 0;
    // Preserve a user's own valid last load; zero is the conservative semantic fallback.
    const defaultWeight = resolveInitialWeightKg(previousTopSet?.weightKg, semanticDefaultWeight);
    const initialSets = [
      { setIndex: 1, weightKg: defaultWeight, reps: 8, completed: false, setType: 'working' as const, isWarmup: false, rir: 2 },
      { setIndex: 2, weightKg: defaultWeight, reps: 8, completed: false, setType: 'working' as const, isWarmup: false, rir: 2 },
      { setIndex: 3, weightKg: defaultWeight, reps: 8, completed: false, setType: 'working' as const, isWarmup: false, rir: 1 }
    ];

    return {
      exercise: { ...exercise, loading },
      previousRecord: previousTopSet ? `${formatDisplayWeight(previousTopSet.weightKg, preferences.units)} × ${previousTopSet.reps}` : undefined,
      bestRecord: personalRecord ? `${formatDisplayWeight(personalRecord.weightKg, preferences.units)} × ${personalRecord.reps}` : undefined,
      bestEst1Rm: personalRecord?.est1Rm,
      targetRepRange: [6, 12],
      includeBarWeight: loading.includeBarWeight,
      plateBaseWeightKg: resolvePlateBaseWeightKg(loading, preferences.defaultBarWeightKg),
      sets: initialSets
    };
  };

  useEffect(() => {
    const saved = getStoredActiveWorkout<StoredActiveWorkout>();
    if (!saved?.isWorkoutActive) return;
    const startedAt = saved.workoutStartTime && Number.isFinite(Date.parse(saved.workoutStartTime))
      ? saved.workoutStartTime
      : workoutStartFromLegacySeconds(saved.workoutSeconds || 0);
    setIsWorkoutActive(true);
    setActiveRoutineName(saved.activeRoutineName || 'Entrenamiento Libre');
    setExerciseSessions((saved.exerciseSessions || []).map(normalizeActiveExerciseSession));
    setWorkoutStartedAt(startedAt);
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (priorWeightInputMode.current === preferences.weightInputMode) return;
    priorWeightInputMode.current = preferences.weightInputMode;
    setExerciseSessions((current) => current.map((session) => {
      if (!session.weightInputModeOverride) return session;
      const { weightInputModeOverride: _override, ...withoutOverride } = session;
      return withoutOverride;
    }));
  }, [preferences.weightInputMode]);

  useEffect(() => {
    if (!isWorkoutActive) return;
    const refresh = () => setNowMs(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(interval);
  }, [isWorkoutActive, workoutStartedAt]);

  useEffect(() => {
    if (!isWorkoutActive) return;
    void requestWakeLock();
    const restoreWakeLock = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };
    document.addEventListener('visibilitychange', restoreWakeLock);
    return () => {
      document.removeEventListener('visibilitychange', restoreWakeLock);
      void releaseWakeLock();
    };
  }, [isWorkoutActive]);

  useEffect(() => {
    if (!isWorkoutActive || !workoutStartedAt) {
      activeSnapshotRef.current = null;
      return;
    }
    const snapshot: StoredActiveWorkout = {
      isWorkoutActive: true,
      activeRoutineName,
      exerciseSessions,
      workoutStartTime: workoutStartedAt
    };
    activeSnapshotRef.current = snapshot;
    saveActiveWorkout(snapshot);
  }, [activeRoutineName, exerciseSessions, isWorkoutActive, workoutStartedAt]);

  useEffect(() => {
    const checkpoint = () => {
      if (activeSnapshotRef.current) saveActiveWorkout(activeSnapshotRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') checkpoint();
    };
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const elapsedSeconds = isWorkoutActive ? workoutElapsedSeconds(workoutStartedAt, nowMs) : 0;

  const start = (routineId?: string, sessionName?: string, prefilterMuscles?: MuscleGroup[]) => {
    const startedAt = new Date().toISOString();
    setWorkoutStartedAt(startedAt);
    setNowMs(Date.now());
    setIsWorkoutActive(true);
    const routine = routineId ? routines.find((item) => item.id === routineId) : undefined;
    if (routine) {
      setActiveRoutineName(routine.name);
      setExerciseSessions(exercises.filter((exercise) => routine.exerciseIds.includes(exercise.id)).map(createExerciseSession));
      return;
    }
    setActiveRoutineName(sessionName || 'Entrenamiento Libre');
    const initialExercise = prefilterMuscles?.length
      ? exercises.find((exercise) => prefilterMuscles.includes(exercise.primaryMuscle))
      : undefined;
    setExerciseSessions(initialExercise ? [createExerciseSession(initialExercise)] : []);
  };

  const addExercise = (exercise: Exercise) => {
    if (!isWorkoutActive) {
      setWorkoutStartedAt(new Date().toISOString());
      setNowMs(Date.now());
      setActiveRoutineName('Entrenamiento Libre');
      setIsWorkoutActive(true);
    }
    setExerciseSessions((current) => current.some((item) => item.exercise.id === exercise.id)
      ? current
      : [...current, createExerciseSession(exercise)]);
  };

  const startWithExercise = (exercise: Exercise) => {
    const startedAt = new Date().toISOString();
    setWorkoutStartedAt(startedAt);
    setNowMs(Date.now());
    setActiveRoutineName('Entrenamiento Libre');
    setExerciseSessions([createExerciseSession(exercise)]);
    setIsWorkoutActive(true);
  };

  const removeExercise = (exerciseId: string) => {
    setExerciseSessions((current) => current.filter((item) => item.exercise.id !== exerciseId));
  };

  const updateSet = (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'rir', value: number) => {
    const finite = Number.isFinite(value) ? value : 0;
    const normalized = field === 'weightKg'
      ? Math.max(0, finite)
      : field === 'reps'
        ? Math.max(0, Math.round(finite))
        : Math.min(5, Math.max(0, Math.round(finite)));
    setExerciseSessions((current) => current.map((session) => session.exercise.id !== exerciseId ? session : {
      ...session,
      sets: session.sets.map((set) => set.setIndex === setIndex ? { ...set, [field]: normalized } : set)
    }));
  };

  const toggleSet = (exerciseId: string, setIndex: number) => {
    let completed = false;
    setExerciseSessions((current) => current.map((session) => session.exercise.id !== exerciseId ? session : {
      ...session,
      sets: session.sets.map((set) => {
        if (set.setIndex !== setIndex) return set;
        const valid = Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0;
        if (!set.completed && !valid) return set;
        completed = !set.completed;
        return { ...set, completed };
      })
    }));
    return completed;
  };

  const addSet = (exerciseId: string, setType: WorkoutSetType = 'working') => {
    setExerciseSessions((current) => current.map((session) => {
      if (session.exercise.id !== exerciseId) return session;
      const lastSet = session.sets[session.sets.length - 1];
      return {
        ...session,
        sets: [...session.sets, {
          setIndex: session.sets.length + 1,
          weightKg: lastSet?.weightKg ?? 50,
          reps: lastSet?.reps ?? 8,
          completed: false,
          setType,
          isWarmup: setType === 'warmup',
          rir: lastSet?.rir ?? 2
        }]
      };
    }));
  };

  const removeSet = (exerciseId: string) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id !== exerciseId || session.sets.length <= 1
        ? session
        : { ...session, sets: session.sets.slice(0, -1) }
    )));
  };

  const updateWeightInputMode = (exerciseId: string, weightInputModeOverride: WeightInputMode) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId ? { ...session, weightInputModeOverride } : session
    )));
  };

  const toggleAddedWeight = (exerciseId: string, enabled: boolean) => {
    setExerciseSessions((current) => current.map((session) => session.exercise.id !== exerciseId ? session : {
      ...session,
      usesAddedWeight: enabled,
      sets: enabled ? session.sets : session.sets.map((set) => ({ ...set, weightKg: 0 }))
    }));
  };

  const updateBarInclusion = (exerciseId: string, includeBarWeight: boolean) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId ? { ...session, includeBarWeight } : session
    )));
  };

  const updatePlateBaseWeight = (exerciseId: string, plateBaseWeightKg: number) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId ? { ...session, plateBaseWeightKg } : session
    )));
  };

  const finish = (): WorkoutFinishResult | null => {
    if (!isWorkoutActive) return null;
    const sets: Record<string, LoggedSet[]> = {};
    for (const session of exerciseSessions) {
      sets[session.exercise.id] = session.sets.map((set) => normalizeLoggedSet({
        ...set,
        completed: set.completed && Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0
      }));
    }
    const session: WorkoutSession = {
      id: createWorkoutId(),
      userId,
      routineName: activeRoutineName,
      startedAt: workoutStartedAt || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      sets
    };
    const updatedHistory = saveCompletedWorkout(session);
    clearActiveWorkout();
    setIsWorkoutActive(false);
    setExerciseSessions([]);
    setWorkoutStartedAt(null);
    setActiveRoutineName('Entrenamiento Libre');
    return { session, history: updatedHistory };
  };

  const cancel = () => {
    clearActiveWorkout();
    setIsWorkoutActive(false);
    setExerciseSessions([]);
    setWorkoutStartedAt(null);
    setActiveRoutineName('Entrenamiento Libre');
  };

  const createCustomExercise = (name: string, primaryMuscle: MuscleGroup): Exercise => ({
    id: `ex-custom-${Date.now()}`,
    name,
    category: 'other',
    primaryMuscle,
    isCustom: true,
    loading: { ...DEFAULT_EXERCISE_LOADING_PROFILE }
  });

  return {
    isWorkoutActive,
    activeRoutineName,
    exerciseSessions,
    workoutStartedAt,
    elapsedSeconds,
    duration: formatElapsedDuration(elapsedSeconds),
    start,
    startWithExercise,
    addExercise,
    removeExercise,
    updateSet,
    toggleSet,
    addSet,
    removeSet,
    updateWeightInputMode,
    toggleAddedWeight,
    updateBarInclusion,
    updatePlateBaseWeight,
    finish,
    cancel,
    createCustomExercise
  };
}
