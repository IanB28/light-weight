import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  normalizeLoggedSet,
  normalizeRirValue,
  resolveExerciseLoadingProfile,
  resolvePlateBaseWeightKg,
  isPlateLoadedMachine,
  resolveMachineBaseResistance,
  type Exercise,
  type LoggedSet,
  type MuscleGroup,
  type Routine,
  type WorkoutSession,
  type WorkoutSetType,
  type MachineProfile,
  type BaseResistanceStatus,
  type MachineSnapshot,
  type MachineBaseSelection,
  normalizeMachineBaseSelection
} from '@light-weight/domain';
import {
  clearActiveWorkout,
  getStoredActiveWorkout,
  saveActiveWorkout,
  saveCompletedWorkout
} from '../../lib/storage.js';
import {
  getLastUsedMachineProfileId,
  getMachineProfileById,
  setLastUsedMachineProfileId
} from '../../lib/machine-profiles.js';
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
  bodyweightEntries?: import('@light-weight/domain').BodyweightEntry[];
}

export interface WorkoutFinishResult {
  session: WorkoutSession;
  history: WorkoutSession[];
}

const FALLBACK_USER_ID = 'local-anonymous';

export function normalizeActiveExerciseSession(session: ActiveExerciseSession): ActiveExerciseSession {
  const legacySession = session as ActiveExerciseSession & { weightInputMode?: WeightInputMode };
  const { weightInputMode: _legacyWeightInputMode, ...restoredSession } = legacySession;
  const loading = resolveExerciseLoadingProfile(restoredSession.exercise).profile;
  const isPlateMachine = isPlateLoadedMachine(loading);
  const normalized = {
    ...restoredSession,
    exercise: { ...restoredSession.exercise, loading },
    skipped: restoredSession.skipped === true,
    sets: restoredSession.sets.map((set) => normalizeLoggedSet(set))
  };

  let machineProfileId = normalized.machineProfileId;
  let machineProfileLabel = normalized.machineProfileLabel;
  let machineBaseResistanceKg = normalized.machineBaseResistanceKg;
  let machineBaseResistanceStatus = normalized.machineBaseResistanceStatus;

  if (isPlateMachine && !machineBaseResistanceStatus) {
    const lastUsedId = getLastUsedMachineProfileId(normalized.exercise.id);
    const lastUsedProfile = lastUsedId ? getMachineProfileById(lastUsedId) : undefined;
    if (lastUsedProfile) {
      const resolved = resolveMachineBaseResistance(loading, lastUsedProfile);
      machineProfileId = lastUsedProfile.id;
      machineProfileLabel = lastUsedProfile.label;
      machineBaseResistanceKg = resolved.weightKg ?? undefined;
      machineBaseResistanceStatus = resolved.status;
    } else {
      // First use / uncalibrated - status is unknown, weight is undefined (NOT 20 lb auto-injected!)
      const resolved = resolveMachineBaseResistance(loading, undefined);
      machineBaseResistanceStatus = resolved.status;
      machineBaseResistanceKg = undefined;
    }
  }

  return loading.loadMode === 'added_weight'
    ? {
        ...normalized,
        usesAddedWeight: normalized.usesAddedWeight
          ?? normalized.sets.some((set) => set.weightKg > 0)
      }
    : {
        ...normalized,
        plateBaseWeightKg: isPlateMachine
          ? machineBaseResistanceKg
          : (normalized.plateBaseWeightKg ?? resolvePlateBaseWeightKg(loading, 20)),
        machineProfileId,
        machineProfileLabel,
        machineBaseResistanceKg,
        machineBaseResistanceStatus
      };
}

function createWorkoutId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
}

export function buildRoutineExerciseSessions(
  routine: Routine,
  exercisesById: Record<string, Exercise>,
  sessionCreator: (exercise: Exercise) => ActiveExerciseSession
): ActiveExerciseSession[] {
  return routine.exerciseIds
    .map((id) => exercisesById[id])
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .map(sessionCreator);
}

export function skipExerciseInSessions(sessions: ActiveExerciseSession[], exerciseId: string): ActiveExerciseSession[] {
  return sessions.map((session) => {
    if (session.exercise.id !== exerciseId) return session;
    const hasCompletedSets = session.sets.some(
      (set) => set.completed && Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0
    );
    if (hasCompletedSets) {
      // Once one valid set has been completed, the exercise is performed and CANNOT be skipped
      return session;
    }
    return { ...session, skipped: true };
  });
}

export function resumeExerciseInSessions(sessions: ActiveExerciseSession[], exerciseId: string): ActiveExerciseSession[] {
  return sessions.map((session) => (
    session.exercise.id === exerciseId
      ? { ...session, skipped: false }
      : session
  ));
}

export function updateSetRirInSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  setIndex: number,
  rir: number | undefined
): ActiveExerciseSession[] {
  const normalized = normalizeRirValue(rir);
  return sessions.map((session) => (
    session.exercise.id !== exerciseId || session.skipped ? session : {
      ...session,
      sets: session.sets.map((set) => set.setIndex === setIndex ? { ...set, rir: normalized } : set)
    }
  ));
}

export function updateSetInSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  setIndex: number,
  field: 'weightKg' | 'reps' | 'rir',
  value: number
): ActiveExerciseSession[] {
  if (field === 'rir') {
    return updateSetRirInSessions(sessions, exerciseId, setIndex, value);
  }
  const finite = Number.isFinite(value) ? value : 0;
  const normalized = field === 'weightKg'
    ? Math.max(0, finite)
    : Math.max(0, Math.round(finite));
  return sessions.map((session) => {
    if (session.exercise.id !== exerciseId || session.skipped) return session;
    const isPlateMachine = isPlateLoadedMachine(session.exercise.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE);
    return {
      ...session,
      sets: session.sets.map((set) => {
        if (set.setIndex !== setIndex) return set;
        // When user enters weight via keyboard: if set has no snapshot at all, it receives current session context
        const hasSnapshot = Boolean(set.machineProfileId || set.machineBaseResistanceStatus);
        const machineContext = field === 'weightKg' && !hasSnapshot && isPlateMachine ? {
          machineProfileId: session.machineProfileId,
          machineProfileLabel: session.machineProfileLabel,
          machineBaseResistanceKg: session.machineBaseResistanceKg,
          machineBaseResistanceStatus: session.machineBaseResistanceStatus ?? 'unknown',
          machineBaseSourceLabel: session.machineBaseSourceLabel,
          machineBaseSourceUrl: session.machineBaseSourceUrl,
          machineManufacturer: session.machineManufacturer,
          machineModel: session.machineModel
        } : {};
        return {
          ...set,
          ...machineContext,
          [field]: normalized
        };
      })
    };
  });
}

export function applyPlateWeightInSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  setIndex: number,
  weightKg: number,
  includeBarWeight: boolean,
  baseWeightKg: number,
  machineSnapshot?: MachineSnapshot
): ActiveExerciseSession[] {
  return sessions.map((session) => {
    if (session.exercise.id !== exerciseId || session.skipped) return session;
    return {
      ...session,
      includeBarWeight,
      plateBaseWeightKg: baseWeightKg,
      sets: session.sets.map((set) => {
        if (set.setIndex !== setIndex) return set;
        return {
          ...set,
          weightKg: Math.max(0, Number.isFinite(weightKg) ? weightKg : 0),
          ...(machineSnapshot ? {
            machineProfileId: machineSnapshot.machineProfileId,
            machineProfileLabel: machineSnapshot.machineProfileLabel,
            machineBaseResistanceKg: machineSnapshot.machineBaseResistanceKg,
            machineBaseResistanceStatus: machineSnapshot.machineBaseResistanceStatus,
            machineBaseSourceLabel: machineSnapshot.machineBaseSourceLabel,
            machineBaseSourceUrl: machineSnapshot.machineBaseSourceUrl,
            machineManufacturer: machineSnapshot.machineManufacturer,
            machineModel: machineSnapshot.machineModel
          } : {})
        };
      })
    };
  });
}

export function toggleSetInSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  setIndex: number
): { sessions: ActiveExerciseSession[]; completed: boolean } {
  let completed = false;
  const nextSessions = sessions.map((session) => {
    if (session.exercise.id !== exerciseId || session.skipped) return session;
    const isPlateMachine = isPlateLoadedMachine(session.exercise.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE);
    return {
      ...session,
      sets: session.sets.map((set) => {
        if (set.setIndex !== setIndex) return set;
        const valid = Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0;
        if (!set.completed && !valid) return set;
        const hasExistingSnapshot = Boolean(
          set.machineProfileId ||
          set.machineBaseResistanceStatus
        );
        const effectiveBaseKg = hasExistingSnapshot
          ? set.machineBaseResistanceKg
          : (isPlateMachine ? session.machineBaseResistanceKg : undefined);
        if (!set.completed && effectiveBaseKg !== undefined && set.weightKg < effectiveBaseKg) {
          return set;
        }
        const effectiveStatus = hasExistingSnapshot
          ? set.machineBaseResistanceStatus
          : (isPlateMachine
              ? (session.machineBaseResistanceStatus ?? 'unknown')
              : undefined);
        if (!set.completed && isPlateMachine && effectiveStatus === 'unknown' && !hasExistingSnapshot) {
          return set;
        }
        completed = !set.completed;
        if (!completed) {
          return {
            ...set,
            completed: false
          };
        }
        // Invariant: If set already has a snapshot -> preserve it; if set has no snapshot and completes -> snapshot current applicable context.
        return {
          ...set,
          completed: true,
          machineProfileId: hasExistingSnapshot ? set.machineProfileId : (isPlateMachine ? session.machineProfileId : undefined),
          machineProfileLabel: hasExistingSnapshot ? set.machineProfileLabel : (isPlateMachine ? session.machineProfileLabel : undefined),
          machineBaseResistanceKg: hasExistingSnapshot ? set.machineBaseResistanceKg : (isPlateMachine ? session.machineBaseResistanceKg : undefined),
          machineBaseResistanceStatus: hasExistingSnapshot ? set.machineBaseResistanceStatus : (isPlateMachine ? (session.machineBaseResistanceStatus ?? 'unknown') : undefined),
          machineBaseSourceLabel: hasExistingSnapshot ? set.machineBaseSourceLabel : (isPlateMachine ? session.machineBaseSourceLabel : undefined),
          machineBaseSourceUrl: hasExistingSnapshot ? set.machineBaseSourceUrl : (isPlateMachine ? session.machineBaseSourceUrl : undefined),
          machineManufacturer: hasExistingSnapshot ? set.machineManufacturer : (isPlateMachine ? session.machineManufacturer : undefined),
          machineModel: hasExistingSnapshot ? set.machineModel : (isPlateMachine ? session.machineModel : undefined)
        };
      })
    };
  });
  return { sessions: nextSessions, completed };
}

export function addSetToSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  setType: WorkoutSetType = 'working'
): ActiveExerciseSession[] {
  return sessions.map((session) => {
    if (session.exercise.id !== exerciseId || session.skipped) return session;
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
        rir: undefined,
        machineProfileId: undefined,
        machineProfileLabel: undefined,
        machineBaseResistanceKg: undefined,
        machineBaseResistanceStatus: undefined,
        machineBaseSourceLabel: undefined,
        machineBaseSourceUrl: undefined,
        machineManufacturer: undefined,
        machineModel: undefined
      }]
    };
  });
}

export function removeSetFromSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string
): ActiveExerciseSession[] {
  return sessions.map((session) => (
    session.exercise.id !== exerciseId || session.skipped || session.sets.length <= 1
      ? session
      : { ...session, sets: session.sets.slice(0, -1) }
  ));
}

export function updateMachineProfileInSessions(
  sessions: ActiveExerciseSession[],
  exerciseId: string,
  selection: MachineBaseSelection | MachineProfile | undefined
): ActiveExerciseSession[] {
  return sessions.map((session) => {
    if (session.exercise.id !== exerciseId || session.skipped) return session;

    const normalized = normalizeMachineBaseSelection(
      selection,
      session.exercise.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE
    );

    return {
      ...session,
      machineProfileId: normalized.profile?.id,
      machineProfileLabel: normalized.profile?.label,
      machineBaseResistanceKg: normalized.weightKg,
      machineBaseResistanceStatus: normalized.status,
      machineBaseSourceLabel: normalized.sourceLabel,
      machineBaseSourceUrl: normalized.sourceUrl,
      machineManufacturer: normalized.manufacturer,
      machineModel: normalized.model,
      plateBaseWeightKg: normalized.weightKg,
      // Invariant 3: SESSION PROFILE != SET SNAPSHOT. Untouched sets remain untouched.
      sets: session.sets
    };
  });
}

export function serializeWorkoutSets(exerciseSessions: ActiveExerciseSession[]): Record<string, LoggedSet[]> {
  const sets: Record<string, LoggedSet[]> = {};
  for (const session of exerciseSessions) {
    if (session.skipped) {
      continue;
    }
    sets[session.exercise.id] = session.sets.map((set) => normalizeLoggedSet({
      ...set,
      completed: set.completed && Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0
    }));
  }
  return sets;
}

export function createDefaultExerciseSession(
  exercise: Exercise,
  options?: {
    historyIndex?: WorkoutHistoryIndex;
    preferences?: AppPreferences;
  }
): ActiveExerciseSession {
  const loading = resolveExerciseLoadingProfile(exercise).profile;
  const historyIndex = options?.historyIndex;
  const preferences = options?.preferences;
  const previous = historyIndex?.latestPerformanceByExercise[exercise.id];
  const previousTopSet = previous?.sets.reduce<LoggedSet | null>(
    (best, set) => !best || set.weightKg > best.weightKg ? set : best,
    null
  );
  const personalRecord = historyIndex?.personalRecordsByExercise[exercise.id];
  const startsWithPlates = loading.supportsPlates && (
    !loading.supportsKeyboard || preferences?.weightInputMode === 'plates'
  );

  const isPlateMachine = isPlateLoadedMachine(loading);
  let machineProfileId: string | undefined;
  let machineProfileLabel: string | undefined;
  let machineBaseResistanceKg: number | undefined;
  let machineBaseResistanceStatus: BaseResistanceStatus | undefined;
  let machineBaseSourceLabel: string | undefined;
  let machineBaseSourceUrl: string | undefined;
  let machineManufacturer: string | undefined;
  let machineModel: string | undefined;

  if (isPlateMachine) {
    const lastUsedId = getLastUsedMachineProfileId(exercise.id);
    const lastUsedProfile = lastUsedId ? getMachineProfileById(lastUsedId) : undefined;
    if (lastUsedProfile) {
      const resolved = resolveMachineBaseResistance(loading, lastUsedProfile);
      machineProfileId = lastUsedProfile.id;
      machineProfileLabel = lastUsedProfile.label;
      machineBaseResistanceKg = resolved.weightKg ?? undefined;
      machineBaseResistanceStatus = resolved.status;
      machineBaseSourceLabel = lastUsedProfile.sourceLabel;
      machineBaseSourceUrl = lastUsedProfile.sourceUrl;
      machineManufacturer = lastUsedProfile.manufacturer;
      machineModel = lastUsedProfile.model;
    } else {
      // First use on machine: session context is unknown tare, NOT 0 kg and NOT 20 lb auto-injected!
      const resolved = resolveMachineBaseResistance(loading, undefined);
      machineBaseResistanceStatus = resolved.status; // 'unknown'
      machineBaseResistanceKg = undefined;
    }
  }

  const effectiveBaseKg = isPlateMachine
    ? (machineBaseResistanceKg ?? 0)
    : resolvePlateBaseWeightKg(loading, preferences?.defaultBarWeightKg ?? 20);

  const semanticDefaultWeight = startsWithPlates && preferences
    ? getDefaultPlateLoadedWeightKg(
        preferences.units,
        effectiveBaseKg,
        preferences.availablePlatesKg,
        loading
      )
    : 0;
  // Preserve a user's own valid last load; zero is the conservative semantic fallback.
  let defaultWeight = resolveInitialWeightKg(previousTopSet?.weightKg, semanticDefaultWeight);
  if (isPlateMachine && machineBaseResistanceStatus === 'unknown') {
    defaultWeight = 0;
  }

  const initialSets = [
    {
      setIndex: 1,
      weightKg: defaultWeight,
      reps: 8,
      completed: false,
      setType: 'working' as const,
      isWarmup: false,
      rir: undefined,
      machineProfileId: undefined,
      machineProfileLabel: undefined,
      machineBaseResistanceKg: undefined,
      machineBaseResistanceStatus: undefined,
      machineBaseSourceLabel: undefined,
      machineBaseSourceUrl: undefined,
      machineManufacturer: undefined,
      machineModel: undefined
    },
    {
      setIndex: 2,
      weightKg: defaultWeight,
      reps: 8,
      completed: false,
      setType: 'working' as const,
      isWarmup: false,
      rir: undefined,
      machineProfileId: undefined,
      machineProfileLabel: undefined,
      machineBaseResistanceKg: undefined,
      machineBaseResistanceStatus: undefined,
      machineBaseSourceLabel: undefined,
      machineBaseSourceUrl: undefined,
      machineManufacturer: undefined,
      machineModel: undefined
    },
    {
      setIndex: 3,
      weightKg: defaultWeight,
      reps: 8,
      completed: false,
      setType: 'working' as const,
      isWarmup: false,
      rir: undefined,
      machineProfileId: undefined,
      machineProfileLabel: undefined,
      machineBaseResistanceKg: undefined,
      machineBaseResistanceStatus: undefined,
      machineBaseSourceLabel: undefined,
      machineBaseSourceUrl: undefined,
      machineManufacturer: undefined,
      machineModel: undefined
    }
  ];

  const isAssisted = loading.loadMode === 'assisted';
  const isAddedWeight = loading.loadMode === 'added_weight';
  const units = preferences?.units ?? 'metric';

  let prevRecordText: string | undefined;
  if (previousTopSet) {
    if (isAssisted) {
      prevRecordText = `-${formatDisplayWeight(previousTopSet.weightKg, units)} × ${previousTopSet.reps}`;
    } else if (isAddedWeight && previousTopSet.weightKg === 0) {
      prevRecordText = `BW × ${previousTopSet.reps}`;
    } else if (isAddedWeight) {
      prevRecordText = `+${formatDisplayWeight(previousTopSet.weightKg, units)} × ${previousTopSet.reps}`;
    } else {
      prevRecordText = `${formatDisplayWeight(previousTopSet.weightKg, units)} × ${previousTopSet.reps}`;
    }
  }

  let bestRecordText: string | undefined;
  if (personalRecord) {
    if (isAssisted) {
      bestRecordText = `-${formatDisplayWeight(personalRecord.weightKg, units)} × ${personalRecord.reps}`;
    } else if (isAddedWeight && personalRecord.weightKg === 0) {
      bestRecordText = `BW × ${personalRecord.reps}`;
    } else if (isAddedWeight) {
      bestRecordText = `+${formatDisplayWeight(personalRecord.weightKg, units)} × ${personalRecord.reps}`;
    } else {
      bestRecordText = `${formatDisplayWeight(personalRecord.weightKg, units)} × ${personalRecord.reps}`;
    }
  }

  return {
    exercise: { ...exercise, loading },
    previousRecord: prevRecordText,
    bestRecord: bestRecordText,
    bestEst1Rm: personalRecord?.est1Rm,
    targetRepRange: [6, 12],
    includeBarWeight: loading.includeBarWeight,
    plateBaseWeightKg: isPlateMachine
      ? machineBaseResistanceKg
      : resolvePlateBaseWeightKg(loading, preferences?.defaultBarWeightKg ?? 20),
    machineProfileId,
    machineProfileLabel,
    machineBaseResistanceKg,
    machineBaseResistanceStatus,
    machineBaseSourceLabel,
    machineBaseSourceUrl,
    machineManufacturer,
    machineModel,
    skipped: false,
    sets: initialSets
  };
}

export function useWorkoutSession({
  exercises,
  routines,
  history,
  historyIndex: suppliedHistoryIndex,
  preferences,
  userId = FALLBACK_USER_ID,
  bodyweightEntries
}: UseWorkoutSessionOptions) {
  const exercisesById = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises]
  );
  const historyIndex = useMemo(
    () => suppliedHistoryIndex || buildWorkoutHistoryIndex(history, { exercisesById, bodyweightEntries }),
    [bodyweightEntries, exercisesById, history, suppliedHistoryIndex]
  );
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [activeRoutineName, setActiveRoutineName] = useState('Entrenamiento Libre');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const priorWeightInputMode = useRef(preferences.weightInputMode);
  const activeSnapshotRef = useRef<StoredActiveWorkout | null>(null);

  const createExerciseSession = (exercise: Exercise): ActiveExerciseSession => (
    createDefaultExerciseSession(exercise, { historyIndex, preferences })
  );

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
      setExerciseSessions(
        buildRoutineExerciseSessions(routine, exercisesById, createExerciseSession)
      );
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

  const skipExercise = (exerciseId: string) => {
    setExerciseSessions((current) => skipExerciseInSessions(current, exerciseId));
  };

  const resumeExercise = (exerciseId: string) => {
    setExerciseSessions((current) => resumeExerciseInSessions(current, exerciseId));
  };

  const updateSet = (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'rir', value: number) => {
    setExerciseSessions((current) => updateSetInSessions(current, exerciseId, setIndex, field, value));
  };

  const updateSetRir = (exerciseId: string, setIndex: number, rir: number | undefined) => {
    setExerciseSessions((current) => updateSetRirInSessions(current, exerciseId, setIndex, rir));
  };

  const toggleSet = (exerciseId: string, setIndex: number) => {
    let completed = false;
    setExerciseSessions((current) => {
      const res = toggleSetInSessions(current, exerciseId, setIndex);
      completed = res.completed;
      return res.sessions;
    });
    return completed;
  };

  const addSet = (exerciseId: string, setType: WorkoutSetType = 'working') => {
    setExerciseSessions((current) => addSetToSessions(current, exerciseId, setType));
  };

  const removeSet = (exerciseId: string) => {
    setExerciseSessions((current) => removeSetFromSessions(current, exerciseId));
  };

  const updateWeightInputMode = (exerciseId: string, weightInputModeOverride: WeightInputMode) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId && !session.skipped ? { ...session, weightInputModeOverride } : session
    )));
  };

  const toggleAddedWeight = (exerciseId: string, enabled: boolean) => {
    setExerciseSessions((current) => {
      if (current.some((s) => s.exercise.id === exerciseId && s.skipped)) return current;
      return current.map((session) => {
        if (session.exercise.id !== exerciseId) return session;
        return {
          ...session,
          usesAddedWeight: enabled,
          sets: enabled ? session.sets : session.sets.map((set) => ({ ...set, weightKg: 0 }))
        };
      });
    });
  };

  const updateBarInclusion = (exerciseId: string, includeBarWeight: boolean) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId && !session.skipped ? { ...session, includeBarWeight } : session
    )));
  };

  const updatePlateBaseWeight = (exerciseId: string, plateBaseWeightKg: number) => {
    setExerciseSessions((current) => current.map((session) => (
      session.exercise.id === exerciseId && !session.skipped ? { ...session, plateBaseWeightKg } : session
    )));
  };

  const updateMachineProfile = (
    exerciseId: string,
    selection: MachineBaseSelection | MachineProfile | undefined
  ) => {
    const profileId = selection && 'profile' in selection
      ? selection.profile?.id
      : (selection && 'id' in selection ? selection.id : undefined);

    if (profileId) {
      setLastUsedMachineProfileId(exerciseId, profileId);
    } else {
      setLastUsedMachineProfileId(exerciseId, null);
    }
    setExerciseSessions((current) => updateMachineProfileInSessions(current, exerciseId, selection));
  };

  const applyPlateWeight = (
    exerciseId: string,
    setIndex: number,
    weightKg: number,
    includeBarWeight: boolean,
    baseWeightKg: number,
    machineSnapshot?: MachineSnapshot
  ) => {
    setExerciseSessions((current) =>
      applyPlateWeightInSessions(
        current,
        exerciseId,
        setIndex,
        weightKg,
        includeBarWeight,
        baseWeightKg,
        machineSnapshot
      )
    );
  };

  const finish = (): WorkoutFinishResult | null => {
    if (!isWorkoutActive) return null;
    const sets = serializeWorkoutSets(exerciseSessions);
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
    skipExercise,
    resumeExercise,
    updateSet,
    updateSetRir,
    toggleSet,
    addSet,
    removeSet,
    updateWeightInputMode,
    toggleAddedWeight,
    updateBarInclusion,
    updatePlateBaseWeight,
    updateMachineProfile,
    applyPlateWeight,
    finish,
    cancel,
    createCustomExercise
  };
}
