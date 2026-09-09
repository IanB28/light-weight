import React, { useState, useEffect } from 'react';
import { BottomNav, TabType } from './components/BottomNav.js';
import { RestTimerBar } from './components/RestTimerBar.js';
import { BackupModal } from './components/BackupModal.js';
import { HomeView } from './views/HomeView.js';
import { WorkoutView, ActiveExerciseSession } from './views/WorkoutView.js';
import { StatsView } from './views/StatsView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView } from './views/LibraryView.js';
import { CATALOG_EXERCISES } from './lib/exercises.js';
import { Routine, Exercise, WorkoutSession, MuscleGroup, getPreviousPerformance } from '@light-weight/domain';
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
import { syncWithCloud, pullFromCloud, fetchUserFromCloud } from './lib/sync.js';
import { initTheme } from './lib/theme.js';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [exercises, setExercises] = useState<Exercise[]>(CATALOG_EXERCISES);
  const [routines, setRoutines] = useState<Routine[]>(getStoredRoutines());
  const [history, setHistory] = useState<WorkoutSession[]>(getStoredHistory());
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(getStoredWeeklySchedule());
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>(getStoredBodyweight());
  const [targetWeight, setTargetWeight] = useState<number | null>(getStoredTargetWeight());
  const [userInfo, setUserInfo] = useState<UserInfo>(getStoredUserInfo());
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Workout Session State
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [workoutSeconds, setWorkoutSeconds] = useState(0);
  const [activeRoutineName, setActiveRoutineName] = useState<string>('Entrenamiento Libre');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [workoutStartTime, setWorkoutStartTime] = useState<string>('');

  // Rest Timer State
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);

  // Background hydration from Neon PostgreSQL on initial load
  useEffect(() => {
    pullFromCloud().then((success) => {
      if (success) {
        setHistory(getStoredHistory());
        setRoutines(getStoredRoutines());
        setUserInfo(getStoredUserInfo());
      }
    });

    fetchUserFromCloud().then((u) => {
      if (u) {
        setUserInfo(u);
      }
    });
  }, []);

  // Restore Active Session from localStorage on mount if exists
  useEffect(() => {
    initTheme();
    const saved = getStoredActiveWorkout();
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
    let interval: any;
    if (isWorkoutActive) {
      interval = setInterval(() => {
        setWorkoutSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkoutActive]);

  // Rest Timer Countdown Interval
  useEffect(() => {
    let interval: any;
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
      const firstEx = matching.length > 0 ? matching[0] : exercises[0];
      setExerciseSessions([createExerciseSession(firstEx)]);
    } else {
      setExerciseSessions([createExerciseSession(exercises[0])]);
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
    setExerciseSessions((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) return item;
        return {
          ...item,
          sets: item.sets.map((s) => {
            if (s.setIndex !== setIndex) return s;
            return { ...s, [field]: value };
          })
        };
      })
    );
  };

  // Handler: Add Set
  const handleAddSet = (exerciseId: string) => {
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
              isWarmup: false,
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
    const completedSetsRecord: Record<string, any[]> = {};
    for (const exSession of exerciseSessions) {
      completedSetsRecord[exSession.exercise.id] = exSession.sets;
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
    setRestSecondsLeft(0);
    setCurrentTab('stats');

    // Auto-sincronización con PostgreSQL en segundo plano
    syncWithCloud();
  };

  // Handler: Cancel Workout
  const handleCancelWorkout = () => {
    if (confirm('¿Deseas descartar el entrenamiento actual?')) {
      releaseWakeLock();
      clearActiveWorkout();
      setIsWorkoutActive(false);
      setRestSecondsLeft(0);
      setCurrentTab('home');
    }
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
    <div className="min-h-screen bg-transparent text-zinc-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-accent selection:text-accent-fg">
      {/* Background Atmospheric Glow Orbs (Midnight Blue & Oceanic depth) */}
      <div className="fixed top-0 right-0 w-[30rem] h-[30rem] bg-blue-600/[0.12] rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-12 -left-20 w-[34rem] h-[34rem] bg-indigo-500/[0.10] rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed top-1/3 left-1/4 w-[28rem] h-[28rem] bg-cyan-500/[0.06] rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed top-3/4 right-10 w-[24rem] h-[24rem] bg-accent/[0.04] rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-3 pb-8">
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
            onNavigateToStats={() => setCurrentTab('stats')}
            onNavigateToPlan={() => setCurrentTab('plan')}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsBackupModalOpen(true)}
            onDataRestored={handleDataRestored}
          />
        )}

        {currentTab === 'workout' && (
          <WorkoutView
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
          />
        )}

        {currentTab === 'stats' && (
          <StatsView
            history={history}
            exercises={exercises}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsBackupModalOpen(true)}
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
              syncWithCloud();
            }}
            onDataRestored={handleDataRestored}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsBackupModalOpen(true)}
          />
        )}

        {currentTab === 'exercises' && (
          <LibraryView
            exercises={exercises}
            isWorkoutActive={isWorkoutActive}
            activeWorkoutDuration={formatDuration(workoutSeconds)}
            onNavigateToWorkout={() => setCurrentTab('workout')}
            onOpenSettings={() => setIsBackupModalOpen(true)}
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
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataRestored={handleDataRestored}
      />
    </div>
  );
}

export default App;
