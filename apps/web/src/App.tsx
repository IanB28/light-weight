import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { BottomNav, TabType } from './components/BottomNav.js';
import { RestTimerBar } from './components/RestTimerBar.js';
import { HomeView } from './views/HomeView.js';
import { WorkoutView, ActiveExerciseSession } from './views/WorkoutView.js';
import { StatsView } from './views/StatsView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView } from './views/LibraryView.js';
import { INITIAL_EXERCISES } from './mockData.js';
import { Routine, Exercise, WorkoutSession, MuscleGroup, getPreviousPerformance } from '@light-weight/domain';
import {
  getStoredHistory,
  saveCompletedWorkout,
  getStoredActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  getStoredRoutines,
  calculateAllPersonalRecords
} from './lib/storage.js';
import { requestWakeLock, releaseWakeLock } from './lib/wakelock.js';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [exercises, setExercises] = useState<Exercise[]>(INITIAL_EXERCISES);
  const [routines, setRoutines] = useState<Routine[]>(getStoredRoutines());
  const [history, setHistory] = useState<WorkoutSession[]>(getStoredHistory());

  // Workout Session State
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [workoutSeconds, setWorkoutSeconds] = useState(0);
  const [activeRoutineName, setActiveRoutineName] = useState<string>('Entrenamiento Libre');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [workoutStartTime, setWorkoutStartTime] = useState<string>('');

  // Rest Timer State
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);

  // Restore Active Session from localStorage on mount if exists
  useEffect(() => {
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

  // Handler: Iniciar Entrenamiento (Libre o desde Rutina)
  const handleStartWorkout = (routineId?: string) => {
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

    // Libre / Ad-hoc: Arranca con los 2 primeros ejercicios sugeridos o vacío para añadir al gusto
    setActiveRoutineName('Entrenamiento Libre');
    setExerciseSessions([createExerciseSession(exercises[0])]);
    setCurrentTab('workout');
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

    const newSession: WorkoutSession = {
      id: `sess-${Date.now()}`,
      userId: 'user-operator',
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

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Header Fijo */}
      <Header
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={formatDuration(workoutSeconds)}
        onNavigateToWorkout={() => setCurrentTab('workout')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-4 pb-8">
        {currentTab === 'home' && (
          <HomeView
            todayRoutine={routines[0]}
            history={history}
            onStartWorkout={handleStartWorkout}
            onNavigateToStats={() => setCurrentTab('stats')}
            onNavigateToPlan={() => setCurrentTab('plan')}
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

        {currentTab === 'stats' && <StatsView history={history} exercises={exercises} />}

        {currentTab === 'plan' && (
          <PlanView
            routines={routines}
            exercises={exercises}
            onSelectAndStartRoutine={handleStartWorkout}
          />
        )}

        {currentTab === 'exercises' && (
          <LibraryView
            exercises={exercises}
            isWorkoutActive={isWorkoutActive}
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
    </div>
  );
}

export default App;
