import React, { useState, useEffect } from 'react';
import { BottomNav, TabType } from './components/BottomNav.js';
import { RestTimerBar } from './components/RestTimerBar.js';
import { SettingsSheet } from './components/SettingsSheet.js';
import { HomeView } from './views/HomeView.js';
import { WorkoutView, ActiveExerciseSession } from './views/WorkoutView.js';
import { StatsView } from './views/StatsView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView } from './views/LibraryView.js';
import { loadExerciseCatalog } from './lib/exercises.js';
import { Routine, Exercise, WorkoutSession, MuscleGroup, LoggedSet, getPreviousPerformance } from '@light-weight/domain';
import {
  getStoredHistory,
  saveCompletedWorkout,
  getStoredActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  getStoredRoutines,
  saveStoredRoutines,
  calculateAllPersonalRecords,
  getStoredWeeklySchedule,
  saveStoredWeeklySchedule,
  getStoredBodyweight,
  saveBodyweightEntry,
  getStoredTargetWeight,
  saveStoredTargetWeight,
  WeeklySchedule,
  BodyweightEntry,
  getStoredUserInfo,
  UserInfo
} from './lib/storage.js';
import { requestWakeLock, releaseWakeLock } from './lib/wakelock.js';
import { fetchUserFromCloud, pullFromCloud, syncWithCloud } from './lib/sync.js';
import { initTheme } from './lib/theme.js';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [routines, setRoutines] = useState<Routine[]>(getStoredRoutines());
  const [history, setHistory] = useState<WorkoutSession[]>(getStoredHistory());
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(getStoredWeeklySchedule());
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>(getStoredBodyweight());
  const [targetWeight, setTargetWeight] = useState<number | null>(getStoredTargetWeight());
  const [userInfo, setUserInfo] = useState<UserInfo>(getStoredUserInfo());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Workout Session State
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [workoutSeconds, setWorkoutSeconds] = useState(0);
  const [activeRoutineName, setActiveRoutineName] = useState<string>('Entrenamiento Libre');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [workoutStartTime, setWorkoutStartTime] = useState<string>('');

  // Rest Timer State
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);

  // Hydrate in the background without delaying or replacing the local-first render.
  useEffect(() => {
    let active = true;

    void pullFromCloud().then((success) => {
      if (!active || !success) return;
      setHistory(getStoredHistory());
      setRoutines(getStoredRoutines());
      setUserInfo(getStoredUserInfo());
    });

    void fetchUserFromCloud().then((remoteUser) => {
      if (active && remoteUser) setUserInfo(remoteUser);
    });

    return () => {
      active = false;
    };
  }, []);

  // The catalog is split out of the initial bundle and loaded once on demand.
  useEffect(() => {
    let active = true;
    loadExerciseCatalog()
      .then((catalog) => {
        if (!active) return;
        setExercises(catalog);
        setCatalogStatus('ready');
      })
      .catch(() => { if (active) setCatalogStatus('error'); });
    return () => { active = false; };
  }, []);

  // Restore Active Session from localStorage on mount if exists
  useEffect(() => {
    initTheme();
    const saved = getStoredActiveWorkout<{
      isWorkoutActive: boolean;
      workoutSeconds?: number;
      activeRoutineName?: string;
      exerciseSessions?: ActiveExerciseSession[];
      workoutStartTime?: string;
    }>();
    if (saved && saved.isWorkoutActive) {
      setIsWorkoutActive(true);
      setWorkoutSeconds(saved.workoutSeconds || 0);
      setActiveRoutineName(saved.activeRoutineName || 'Entrenamiento Libre');
      setExerciseSessions(saved.exerciseSessions || []);
      setWorkoutStartTime(saved.workoutStartTime || new Date().toISOString());
      requestWakeLock();
    }
  }, []);

  // Save active workout to localStorage whenever it changes
  useEffect(() => {
    if (isWorkoutActive) {
      saveActiveWorkout({
        isWorkoutActive,
        workoutSeconds,
        activeRoutineName,
        exerciseSessions,
        workoutStartTime
      });
    }
  }, [isWorkoutActive, workoutSeconds, activeRoutineName, exerciseSessions, workoutStartTime]);

  // Workout Timer Interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isWorkoutActive) {
      interval = setInterval(() => {
        setWorkoutSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkoutActive]);

  // Rest Timer Countdown Interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (restSecondsLeft > 0) {
      interval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate([150, 80, 150]);
              } catch {}
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [restSecondsLeft]);

  // Format Elapsed Workout Time
  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Helper to create an ActiveExerciseSession with previous record lookup
  const createExerciseSession = (ex: Exercise): ActiveExerciseSession => {
    const prev = getPreviousPerformance(history, ex.id);
    const prs = calculateAllPersonalRecords(history);
    const bestRecord = prs[ex.id] ? `${prs[ex.id].weightKg} kg × ${prs[ex.id].reps}` : undefined;

    const defaultWeight =
      ex.category === 'barbell'
        ? 60
        : ex.category === 'dumbbell'
        ? 22
        : ex.category === 'bodyweight'
        ? 0
        : 45;

    const initialSets = [
      { setIndex: 1, weightKg: defaultWeight, reps: 8, completed: false, isWarmup: false, rir: 2 },
      { setIndex: 2, weightKg: defaultWeight, reps: 8, completed: false, isWarmup: false, rir: 2 },
      { setIndex: 3, weightKg: defaultWeight, reps: 8, completed: false, isWarmup: false, rir: 1 }
    ];

    return {
      exercise: ex,
      previousRecord: prev ? prev.summary : undefined,
      bestRecord,
      bestEst1Rm: prs[ex.id]?.est1Rm,
      targetRepRange: [6, 12],
      sets: initialSets
    };
  };

  // Handler: Iniciar Entrenamiento (Libre, por Enfoque o desde Rutina)
  const handleStartWorkout = (
    routineId?: string,
    sessionName?: string,
    prefilterMuscles?: MuscleGroup[]
  ) => {
    requestWakeLock();
    setWorkoutStartTime(new Date().toISOString());
    setWorkoutSeconds(0);
    setIsWorkoutActive(true);

    if (routineId) {
      const selected = routines.find((r) => r.id === routineId);
      if (selected) {
        setActiveRoutineName(selected.name);
        const routineExs = exercises.filter((ex) => selected.exerciseIds.includes(ex.id));
        const initialExerciseSessions = routineExs.map(createExerciseSession);
        setExerciseSessions(initialExerciseSessions);
        setCurrentTab('workout');
        return;
      }
    }

    // Libre o con Enfoque (Upper, Lower, Push, Pull, Quads, Glutes)
    const title = sessionName || 'Entrenamiento Libre';
    setActiveRoutineName(title);

    if (prefilterMuscles && prefilterMuscles.length > 0) {
      const matching = exercises.filter((ex) => prefilterMuscles.includes(ex.primaryMuscle));
      const firstEx = matching[0];
      setExerciseSessions(firstEx ? [createExerciseSession(firstEx)] : []);
    } else {
      setExerciseSessions([]);
    }

    setCurrentTab('workout');
  };

  const handleUpdateWeeklySchedule = (schedule: WeeklySchedule) => {
    setWeeklySchedule(schedule);
    saveStoredWeeklySchedule(schedule);
  };

  const handleSaveBodyweight = (weightKg: number, dateStr?: string) => {
    const updated = saveBodyweightEntry(weightKg, dateStr);
    setBodyweightEntries(updated);
    syncWithCloud();
  };

  const handleSaveTargetWeight = (targetKg: number) => {
    setTargetWeight(targetKg);
    saveStoredTargetWeight(targetKg);
    syncWithCloud();
  };

  // Handler: Agregar Ejercicio a la sesión activa
  const handleAddExerciseToWorkout = (exercise: Exercise) => {
    if (!isWorkoutActive) {
      requestWakeLock();
      setWorkoutStartTime(new Date().toISOString());
      setWorkoutSeconds(0);
      setActiveRoutineName('Entrenamiento Libre');
      setIsWorkoutActive(true);
    }
    setExerciseSessions((prev) => {
      if (prev.some((item) => item.exercise.id === exercise.id)) return prev;
      return [...prev, createExerciseSession(exercise)];
    });
  };

  // Handler: Quitar Ejercicio de la sesión activa
  const handleRemoveExerciseFromWorkout = (exerciseId: string) => {
    setExerciseSessions((prev) => prev.filter((item) => item.exercise.id !== exerciseId));
  };

  // Handler: Crear Ejercicio Personalizado
  const handleCreateCustomExercise = (name: string, primaryMuscle: MuscleGroup) => {
    const newEx: Exercise = {
      id: `ex-custom-${Date.now()}`,
      name,
      category: 'other',
      primaryMuscle,
      isCustom: true
    };
    setExercises((prev) => [newEx, ...prev]);
    if (isWorkoutActive) {
      handleAddExerciseToWorkout(newEx);
    }
  };

  // Handler: Toggle Set Check (trigger rest timer)
  const handleToggleSet = (exerciseId: string, setIndex: number) => {
    setExerciseSessions((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) return item;
        return {
          ...item,
          sets: item.sets.map((s) => {
            if (s.setIndex !== setIndex) return s;
            if (!s.completed && (!Number.isFinite(s.weightKg) || s.weightKg < 0 || !Number.isFinite(s.reps) || s.reps <= 0)) return s;
            return { ...s, completed: !s.completed };
          })
        };
      })
    );
  };

  // Handler: Update Set Weight / Reps / RIR
  const handleUpdateSet = (
    exerciseId: string,
    setIndex: number,
    field: 'weightKg' | 'reps' | 'rir',
    value: number
  ) => {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const normalizedValue = field === 'weightKg'
      ? Math.max(0, finiteValue)
      : field === 'reps'
        ? Math.max(0, Math.round(finiteValue))
        : Math.min(5, Math.max(0, Math.round(finiteValue)));

    setExerciseSessions((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) return item;
        return {
          ...item,
          sets: item.sets.map((s) => {
            if (s.setIndex !== setIndex) return s;
            return { ...s, [field]: normalizedValue };
          })
        };
      })
    );
  };

  // Handler: Add Set
  const handleAddSet = (exerciseId: string, isWarmup = false) => {
    setExerciseSessions((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) return item;
        const lastSet = item.sets[item.sets.length - 1];
        const newSetIndex = item.sets.length + 1;
        return {
          ...item,
          sets: [
            ...item.sets,
            {
              setIndex: newSetIndex,
              weightKg: lastSet ? lastSet.weightKg : 50,
              reps: lastSet ? lastSet.reps : 8,
              completed: false,
              isWarmup,
              rir: lastSet ? lastSet.rir : 2
            }
          ]
        };
      })
    );
  };

  // Handler: Remove Last Set
  const handleRemoveSet = (exerciseId: string) => {
    setExerciseSessions((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) return item;
        if (item.sets.length <= 1) return item;
        return {
          ...item,
          sets: item.sets.slice(0, -1)
        };
      })
    );
  };

  // Rest Timer Controls
  const handleStartRestTimer = (seconds: number) => {
    setRestTotalSeconds(seconds);
    setRestSecondsLeft(seconds);
  };

  const handleAddRestSeconds = (delta: number) => {
    setRestSecondsLeft((prev) => Math.max(0, prev + delta));
  };

  const handleDismissRestTimer = () => {
    setRestSecondsLeft(0);
  };

  // Handler: Finish and Save Workout
  const handleFinishWorkout = () => {
    const completedSetsRecord: Record<string, LoggedSet[]> = {};
    for (const exSession of exerciseSessions) {
      completedSetsRecord[exSession.exercise.id] = exSession.sets.map((set) => ({
        ...set,
        completed: set.completed && Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0
      }));
    }

    const sessionUuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

    const newSession: WorkoutSession = {
      id: sessionUuid,
      userId: '00000000-0000-0000-0000-000000000001',
      routineName: activeRoutineName,
      startedAt: workoutStartTime || new Date(Date.now() - workoutSeconds * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      sets: completedSetsRecord
    };

    const updatedHistory = saveCompletedWorkout(newSession);
    setHistory(updatedHistory);

    releaseWakeLock();
    clearActiveWorkout();
    setIsWorkoutActive(false);
    setExerciseSessions([]);
    setWorkoutSeconds(0);
    setWorkoutStartTime('');
    setActiveRoutineName('Entrenamiento Libre');
    setRestSecondsLeft(0);
    setCurrentTab('stats');

    // Auto-sincronización con PostgreSQL en segundo plano
    syncWithCloud();
  };

  // Handler: Cancel Workout
  const handleCancelWorkout = () => {
    releaseWakeLock();
    clearActiveWorkout();
    setIsWorkoutActive(false);
    setExerciseSessions([]);
    setWorkoutSeconds(0);
    setWorkoutStartTime('');
    setActiveRoutineName('Entrenamiento Libre');
    setRestSecondsLeft(0);
    setCurrentTab('home');
  };

  const handleDataRestored = () => {
    setHistory(getStoredHistory());
    setRoutines(getStoredRoutines());
    setWeeklySchedule(getStoredWeeklySchedule());
    setBodyweightEntries(getStoredBodyweight());
    setTargetWeight(getStoredTargetWeight());
    setUserInfo(getStoredUserInfo());
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-transparent font-sans text-text-primary selection:bg-accent selection:text-accent-fg">
      {/* Atmospheric Background Ambient Lights (Apple/visionOS Depth) */}
      <div
        className="fixed -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[26rem] rounded-full blur-[160px] pointer-events-none -z-10 transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-1)' }}
      />
      <div
        className="fixed top-[28%] -left-28 w-[32rem] h-[32rem] rounded-full blur-[170px] pointer-events-none -z-10 transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-2)' }}
      />
      <div
        className="fixed top-[52%] -right-24 w-[32rem] h-[32rem] rounded-full blur-[170px] pointer-events-none -z-10 transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-3)' }}
      />
      <div
        className="fixed top-[22%] left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full blur-[160px] pointer-events-none -z-10 transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-brand, rgba(34, 197, 94, 0.08))' }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto px-page pt-3 pb-page-safe">
        {currentTab === 'home' && (
          <HomeView
            userName={userInfo.name}
            history={history}
            routines={routines}
            weeklySchedule={weeklySchedule}
            onUpdateWeeklySchedule={handleUpdateWeeklySchedule}
            bodyweightEntries={bodyweightEntries}
            targetWeight={targetWeight}
            onSaveBodyweight={handleSaveBodyweight}
            onSaveTargetWeight={handleSaveTargetWeight}
            onStartWorkout={handleStartWorkout}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {currentTab === 'workout' && (
          <WorkoutView
            isWorkoutActive={isWorkoutActive}
            routines={routines}
            routineName={activeRoutineName}
            sessionDuration={formatDuration(workoutSeconds)}
            exerciseSessions={exerciseSessions}
            availableExercises={exercises}
            onToggleSet={handleToggleSet}
            onUpdateSet={handleUpdateSet}
            onAddSet={handleAddSet}
            onRemoveSet={handleRemoveSet}
            onAddExercise={handleAddExerciseToWorkout}
            onRemoveExercise={handleRemoveExerciseFromWorkout}
            onCreateCustomExercise={handleCreateCustomExercise}
            onFinishWorkout={handleFinishWorkout}
            onCancelWorkout={handleCancelWorkout}
            onStartRestTimer={handleStartRestTimer}
            onStartRoutine={handleStartWorkout}
          />
        )}

        {currentTab === 'stats' && (
          <StatsView
            history={history}
            exercises={exercises}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {currentTab === 'plan' && (
          <PlanView
            routines={routines}
            exercises={exercises}
            weeklySchedule={weeklySchedule}
            onUpdateWeeklySchedule={handleUpdateWeeklySchedule}
            onSelectAndStartRoutine={handleStartWorkout}
            onSaveRoutine={(newRoutine) => {
              const updated = [...routines, newRoutine];
              setRoutines(updated);
              saveStoredRoutines(updated);
              syncWithCloud();
            }}
            onDeleteRoutine={(routineId) => {
              const updated = routines.filter((r) => r.id !== routineId);
              setRoutines(updated);
              saveStoredRoutines(updated);
              const updatedSchedule = Object.fromEntries(
                Object.entries(weeklySchedule).map(([day, assignedId]) => [day, assignedId === routineId ? null : assignedId])
              ) as WeeklySchedule;
              setWeeklySchedule(updatedSchedule);
              saveStoredWeeklySchedule(updatedSchedule);
              syncWithCloud();
            }}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {currentTab === 'exercises' && (
          <LibraryView
            exercises={exercises}
            catalogStatus={catalogStatus}
            onRetryCatalog={() => {
              setCatalogStatus('loading');
              loadExerciseCatalog().then((catalog) => {
                setExercises(catalog);
                setCatalogStatus('ready');
              }).catch(() => setCatalogStatus('error'));
            }}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onAddExerciseToActiveWorkout={handleAddExerciseToWorkout}
            onStartWorkoutWithExercise={(ex) => {
              handleStartWorkout();
              setExerciseSessions([createExerciseSession(ex)]);
            }}
          />
        )}
      </main>

      {/* Temporizador de Descanso Flotante */}
      <RestTimerBar
        secondsLeft={restSecondsLeft}
        totalSeconds={restTotalSeconds}
        onAddSeconds={handleAddRestSeconds}
        onDismiss={handleDismissRestTimer}
      />

      {/* Barra de Navegación Inferior (Thumb Zone) */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isWorkoutActive={isWorkoutActive}
      />

      {/* Modal de Configuración y Respaldo / Temas */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDataRestored={handleDataRestored}
      />
    </div>
  );
}

export default App;
