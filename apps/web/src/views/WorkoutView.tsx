import React, { useState } from 'react';
import { X, Check, Plus, Trash2, Eye, Dumbbell } from 'lucide-react';
import { Exercise, LoggedSet, estimateOneRm, MuscleGroup, Routine } from '@light-weight/domain';
import { AddExerciseModal } from '../components/AddExerciseModal.js';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { WorkoutSummaryModal, CompletedWorkoutSummary } from '../components/WorkoutSummaryModal.js';
import { AppCard, Button, EmptyState, IconButton, Modal } from '../components/ui/index.js';

export interface ActiveExerciseSession {
  exercise: Exercise;
  previousRecord?: string;
  bestRecord?: string;
  bestEst1Rm?: number;
  targetRepRange: [number, number];
  sets: (LoggedSet & { rir?: number })[];
}

interface WorkoutViewProps {
  isWorkoutActive: boolean;
  routines: Routine[];
  routineName: string;
  sessionDuration: string;
  exerciseSessions: ActiveExerciseSession[];
  availableExercises: Exercise[];
  onToggleSet: (exerciseId: string, setIndex: number) => void;
  onUpdateSet: (
    exerciseId: string,
    setIndex: number,
    field: 'weightKg' | 'reps' | 'rir',
    value: number
  ) => void;
  onAddSet: (exerciseId: string, isWarmup?: boolean) => void;
  onRemoveSet: (exerciseId: string) => void;
  onAddExercise: (exercise: Exercise) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onCreateCustomExercise: (name: string, muscle: MuscleGroup) => void;
  onFinishWorkout: () => void;
  onCancelWorkout: () => void;
  onStartRestTimer: (seconds: number) => void;
  onStartRoutine: (routineId: string) => void;
}

const getDefaultMuscleFilter = (routineName: string): string => {
  const lower = routineName.toLowerCase();
  if (lower.includes('push') || lower.includes('empuje')) return 'chest';
  if (lower.includes('pull') || lower.includes('jalón') || lower.includes('jalon')) return 'back';
  if (lower.includes('quad') || lower.includes('cuádricep') || lower.includes('cuadricep')) return 'quadriceps';
  if (lower.includes('glute') || lower.includes('glúteo')) return 'glutes';
  if (lower.includes('lower') || lower.includes('pierna')) return 'quadriceps';
  if (lower.includes('upper') || lower.includes('superior')) return 'chest';
  return 'all';
};

const isValidWorkoutSet = (set: LoggedSet): boolean => (
  Number.isFinite(set.weightKg) &&
  set.weightKg >= 0 &&
  Number.isFinite(set.reps) &&
  set.reps > 0
);

export const WorkoutView: React.FC<WorkoutViewProps> = ({
  isWorkoutActive,
  routines,
  routineName,
  sessionDuration,
  exerciseSessions,
  availableExercises,
  onToggleSet,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onAddExercise,
  onRemoveExercise,
  onCreateCustomExercise,
  onFinishWorkout,
  onCancelWorkout,
  onStartRestTimer,
  onStartRoutine
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);
  const [summaryData, setSummaryData] = useState<CompletedWorkoutSummary | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const completedSetsCount = exerciseSessions.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed && isValidWorkoutSet(s)).length,
    0
  );
  const totalSetsCount = exerciseSessions.reduce((acc, ex) => acc + ex.sets.length, 0);

  const totalVolumeKg = exerciseSessions.reduce((total, ex) => {
    return (
      total +
      ex.sets
        .filter((s) => s.completed && !s.isWarmup)
        .reduce((sum, s) => {
          const volume = s.weightKg * s.reps;
          return sum + (Number.isFinite(volume) && volume > 0 ? volume : 0);
        }, 0)
    );
  }, 0);

  const handleFinishClick = () => {
    if (completedSetsCount === 0) return;
    const newRecords: CompletedWorkoutSummary['newRecords'] = [];
    exerciseSessions.forEach((sess) => {
      const completed = sess.sets.filter((s) => s.completed && s.weightKg > 0 && isValidWorkoutSet(s));
      const bestSet = completed.reduce<LoggedSet | null>((best, set) => {
        if (!best) return set;
        return estimateOneRm(set.weightKg, set.reps).average > estimateOneRm(best.weightKg, best.reps).average ? set : best;
      }, null);
      if (bestSet) {
        const est = estimateOneRm(bestSet.weightKg, bestSet.reps).average;
        if (est > (sess.bestEst1Rm || 0)) {
        newRecords.push({
          exerciseName: sess.exercise.name,
          weightKg: bestSet.weightKg,
          reps: bestSet.reps,
          estimatedOneRm: Math.round(est * 10) / 10,
        });
        }
      }
    });

    setSummaryData({
      routineName,
      durationFormatted: sessionDuration,
      totalVolumeKg,
      totalCompletedSets: completedSetsCount,
      newRecords: newRecords.slice(0, 3),
    });
  };

  return (
    <div className="space-y-4 pb-36">
      {/* openGym Workout Header */}
      {(isWorkoutActive || exerciseSessions.length > 0) && <div className="glass-surface sticky top-0 z-20 flex items-center justify-between rounded-ui-lg border border-border-subtle px-3 py-2.5 shadow-card">
        <IconButton
          variant="ghost"
          onClick={() => setShowDiscardConfirm(true)}
          aria-label="Descartar sesión"
          title="Descartar sesión"
        >
          <X className="size-4" />
        </IconButton>

        <div className="text-center">
          <h2 className="text-base font-extrabold tracking-tight text-text-primary">{routineName}</h2>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {sessionDuration} • <span className="text-accent">{completedSetsCount}/{totalSetsCount} sets</span> • <span className="font-bold text-text-secondary">{totalVolumeKg} kg</span>
          </p>
        </div>

        <Button
          size="md"
          onClick={handleFinishClick}
          disabled={completedSetsCount === 0}
          className="rounded-full px-3 text-xs"
          title="Terminar entrenamiento"
        >
          <Check className="size-4 stroke-[3]" />
          <span>Fin</span>
        </Button>
      </div>}

      {/* Lista de Ejercicios */}
      {exerciseSessions.length === 0 ? (
        <AppCard className="space-y-4">
          <EmptyState
            icon={<Dumbbell className="size-5" />}
            title="¿Qué vas a entrenar hoy?"
            description={isWorkoutActive ? 'Aún no has agregado ejercicios a este entrenamiento.' : 'Crea una sesión libre o empieza desde una rutina.'}
            actionLabel="Agregar ejercicio"
            onAction={() => setIsAddModalOpen(true)}
          />
          {routines.length > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Usar una rutina</p>
              {routines.slice(0, 3).map((routine) => (
                <button key={routine.id} type="button" onClick={() => onStartRoutine(routine.id)} className="flex min-h-11 w-full items-center justify-between rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-sm font-bold text-text-primary hover:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span className="truncate">{routine.name}</span><span className="text-xs font-medium text-text-muted">{routine.exerciseIds.length} ejercicios</span>
                </button>
              ))}
            </div>
          )}
        </AppCard>
      ) : (
        exerciseSessions.map((session, exIndex) => {
          const { exercise, sets, previousRecord, bestRecord } = session;
          const imgUrl = getExerciseImgUrl(exercise);

          return (
            <div key={exercise.id} className="space-y-3 pt-2">
              {/* Indicador de Ejercicio N / Total con botón de Eliminar ejercicio */}
              <div className="flex min-h-11 items-center justify-between text-xs text-text-muted">
                <span className="font-semibold text-text-secondary">
                  Ejercicio {exIndex + 1} de {exerciseSessions.length}
                </span>
                <div className="flex items-center">
                  <IconButton
                    variant="ghost"
                    onClick={() => onRemoveExercise(exercise.id)}
                    aria-label={`Eliminar ${exercise.name} del entrenamiento`}
                    className="text-text-muted hover:text-danger"
                    title="Eliminar este ejercicio"
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>

              {/* Título del Ejercicio con Miniatura y Badges */}
              <div className="flex items-start gap-3">
                {/* Thumbnail con preview de GIF */}
                <button
                  type="button"
                  onClick={() => setSelectedMediaExercise(exercise)}
                  aria-label={`Ver técnica de ${exercise.name}`}
                  className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Ver demostración técnica en GIF"
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={exercise.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <Dumbbell className="size-6 text-text-muted stroke-[1.8]" />
                  )}
                  <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye className="size-4 text-accent" />
                  </div>
                </button>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="truncate text-lg font-extrabold leading-tight tracking-tight text-text-primary">
                      {exercise.name}
                    </h3>
                    <IconButton
                      variant="ghost"
                      onClick={() => setSelectedMediaExercise(exercise)}
                      aria-label={`Ver técnica de ${exercise.name}`}
                      className="text-text-muted hover:text-accent"
                      title="Ver técnica"
                    >
                      <Eye className="size-4" />
                    </IconButton>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold capitalize text-accent">
                      {exercise.primaryMuscle}
                    </span>
                    <span className="rounded-full border border-border-subtle bg-surface-input px-2.5 py-0.5 text-xs font-semibold capitalize text-text-secondary">
                      {exercise.category}
                    </span>
                    {bestRecord && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                        PR: {bestRecord}
                      </span>
                    )}
                  </div>

                  {/* Last time summary */}
                  {previousRecord && (
                    <p className="pt-0.5 font-mono text-[11px] leading-relaxed text-text-muted">
                      <span className="font-semibold text-text-secondary">Anterior:</span> {previousRecord}
                    </p>
                  )}
                </div>
              </div>

              {/* openGym Table: WEIGHT (KG) | REPS | RIR | CHECK */}
              <div className="glass-surface space-y-2 rounded-ui-xl border border-border-subtle p-3.5 shadow-card">
                <div className="grid grid-cols-12 gap-1 px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">PESO (KG)</span>
                  <span className="col-span-3">REPS</span>
                  <span className="col-span-2">RIR</span>
                  <span className="col-span-2 flex justify-end pr-2"><Check className="w-3.5 h-3.5 text-accent" /></span>
                </div>

                {sets.map((set) => {
                  const canComplete = isValidWorkoutSet(set);
                  return (
                  <div
                    key={set.setIndex}
                    className={`grid grid-cols-12 items-center gap-1 rounded-2xl p-1.5 transition-[background-color,border-color] ${
                      set.completed ? 'bg-accent/15 border border-accent/25' : 'glass-subcard'
                    }`}
                  >
                    {/* Set Circle Badge */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                          set.completed
                            ? 'bg-accent text-accent-fg'
                            : 'bg-surface-active text-text-muted'
                        }`}
                      >
                        {set.setIndex}
                      </span>
                    </div>

                    {/* Weight Controls con Input directo (- 82.5 +) */}
                    <div className="col-span-4 flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'weightKg',
                            Math.max(0, Math.round((set.weightKg - 2.5) * 10) / 10)
                          )
                        }
                        aria-label={`Reducir peso de la serie ${set.setIndex}`}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        —
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={set.weightKg === 0 ? '' : set.weightKg}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'weightKg',
                            isNaN(val) ? 0 : val
                          );
                        }}
                        aria-label={`Peso en kilogramos de la serie ${set.setIndex}`}
                        className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-12"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'weightKg',
                            Math.round((set.weightKg + 2.5) * 10) / 10
                          )
                        }
                        aria-label={`Aumentar peso de la serie ${set.setIndex}`}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        +
                      </button>
                    </div>

                    {/* Reps Controls con Input directo (- 8 +) */}
                    <div className="col-span-3 flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            Math.max(1, set.reps - 1)
                          )
                        }
                        aria-label={`Reducir repeticiones de la serie ${set.setIndex}`}
                        className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        —
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={set.reps === 0 ? '' : set.reps}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            isNaN(val) ? 0 : val
                          );
                        }}
                        aria-label={`Repeticiones de la serie ${set.setIndex}`}
                        className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-9"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            set.reps + 1
                          )
                        }
                        aria-label={`Aumentar repeticiones de la serie ${set.setIndex}`}
                        className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        +
                      </button>
                    </div>

                    {/* A single full-height control avoids overlapping tap targets on narrow screens. */}
                    <div className="col-span-2 flex items-center justify-center">
                      <select
                        value={set.rir ?? 2}
                        onChange={(event) => onUpdateSet(exercise.id, set.setIndex, 'rir', Number(event.target.value))}
                        aria-label={`RIR de la serie ${set.setIndex}`}
                        className="h-11 w-full min-w-0 rounded-ui-md border border-border-subtle bg-surface-input px-0 text-center font-mono text-xs font-bold text-text-secondary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                      >
                        {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>

                    {/* openGym Circle Checkmark (dispara descanso) */}
                    <div className="col-span-2 flex items-center justify-end pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSet(exercise.id, set.setIndex);
                          if (!set.completed && canComplete) onStartRestTimer(90);
                        }}
                        disabled={!set.completed && !canComplete}
                        aria-label={`${set.completed ? 'Marcar pendiente' : 'Completar'} serie ${set.setIndex}`}
                        title={!canComplete ? 'Introduce al menos una repetición válida' : undefined}
                        aria-pressed={set.completed}
                        className={`flex size-11 items-center justify-center rounded-full transition-[transform,background-color,border-color] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 ${
                          set.completed
                            ? 'border-2 border-accent bg-accent text-accent-fg shadow-accent'
                            : 'border-2 border-border-active bg-surface-input text-transparent hover:border-accent'
                        }`}
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                      </button>
                    </div>
                  </div>
                  );
                })}

                {/* Botones de Acción de Serie */}
                <div className="flex flex-col gap-1 pt-2 text-xs font-semibold min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => onAddSet(exercise.id, true)}
                    className="justify-start px-2 text-accent"
                  >
                    <Plus className="size-3.5 stroke-[3]" />
                    + Serie de Calentamiento
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => onRemoveSet(exercise.id)}
                    disabled={sets.length <= 1}
                    className="justify-start px-2 text-text-muted hover:text-danger"
                  >
                    — Quitar última serie
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => onAddSet(exercise.id, false)}
                  className="mt-1 w-full text-accent hover:border-accent/40"
                >
                  <Plus className="size-4 stroke-[3]" />
                  Agregar Serie Efectiva
                </Button>
              </div>
            </div>
          );
        })
      )}

      {/* Botón flotante para Agregar otro Ejercicio a la sesión activa */}
      {exerciseSessions.length > 0 && <div className="pt-4">
        <Button
          variant="secondary"
          onClick={() => setIsAddModalOpen(true)}
          className="w-full border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"
        >
          <Plus className="size-5 stroke-[2.5]" />
          Agregar Ejercicio a la Sesión
        </Button>
      </div>}

      {/* Modal para Buscar / Agregar Ejercicio */}
      <AddExerciseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableExercises={availableExercises}
        onSelectExercise={onAddExercise}
        onCreateCustomExercise={onCreateCustomExercise}
        initialMuscleFilter={getDefaultMuscleFilter(routineName)}
      />

      {/* Modal de Demostración Visual de Técnica en GIF */}
      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />

      {/* Modal de Resumen y Celebración de Entrenamiento */}
      <WorkoutSummaryModal
        isOpen={Boolean(summaryData)}
        summary={summaryData}
        onConfirmSave={() => {
          setSummaryData(null);
          onFinishWorkout();
        }}
      />

      <Modal open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)} title="¿Descartar entrenamiento?" description="Los cambios de esta sesión no se podrán recuperar.">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>Continuar</Button>
          <Button variant="danger" onClick={() => { setShowDiscardConfirm(false); onCancelWorkout(); }}>Descartar</Button>
        </div>
      </Modal>
    </div>
  );
};
