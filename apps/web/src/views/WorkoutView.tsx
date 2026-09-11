import React, { useState } from 'react';
import { X, Check, Plus, Trash2, Eye, Dumbbell } from 'lucide-react';
import { Exercise, LoggedSet, estimateOneRm, Routine } from '@light-weight/domain';
import { AddExerciseModal } from '../components/AddExerciseModal.js';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { WorkoutSummaryModal, CompletedWorkoutSummary } from '../components/WorkoutSummaryModal.js';
import { AppCard, Button, EmptyState, Modal } from '../components/ui/index.js';

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
  onCreateCustomExercise: (name: string, muscle: any) => void;
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
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0
  );
  const totalSetsCount = exerciseSessions.reduce((acc, ex) => acc + ex.sets.length, 0);

  const totalVolumeKg = exerciseSessions.reduce((total, ex) => {
    return (
      total +
      ex.sets
        .filter((s) => s.completed && !s.isWarmup)
        .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    );
  }, 0);

  const handleFinishClick = () => {
    if (completedSetsCount === 0) return;
    const newRecords: CompletedWorkoutSummary['newRecords'] = [];
    exerciseSessions.forEach((sess) => {
      const completed = sess.sets.filter((s) => s.completed && s.weightKg > 0 && s.reps > 0);
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
      {(isWorkoutActive || exerciseSessions.length > 0) && <div className="flex items-center justify-between sticky top-0 dark-glass-card z-20 py-2.5 px-3 rounded-2xl border border-white/[0.08] shadow-lg shadow-black/40">
        <button
          type="button"
          onClick={() => setShowDiscardConfirm(true)}
          aria-label="Descartar sesión"
          className="w-9 h-9 rounded-full glass-subcard flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-[0.92] cursor-pointer"
          title="Descartar sesión"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center">
          <h2 className="text-base font-extrabold text-white tracking-tight">{routineName}</h2>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {sessionDuration} • <span className="text-accent">{completedSetsCount}/{totalSetsCount} sets</span> • <span className="text-zinc-300 font-bold">{totalVolumeKg} kg</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleFinishClick}
          disabled={completedSetsCount === 0}
          className="px-4 py-1.5 rounded-full bg-accent text-accent-fg font-bold text-xs flex items-center gap-1 hover:brightness-110 transition-all active:scale-[0.92] shadow-md shadow-accent/20 cursor-pointer disabled:pointer-events-none disabled:opacity-40"
          title="Terminar entrenamiento"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Fin</span>
        </button>
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
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold text-zinc-300">
                  Ejercicio {exIndex + 1} de {exerciseSessions.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRemoveExercise(exercise.id)}
                    className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                    title="Eliminar este ejercicio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Título del Ejercicio con Miniatura y Badges */}
              <div className="flex items-start gap-3">
                {/* Thumbnail con preview de GIF */}
                <div
                  onClick={() => setSelectedMediaExercise(exercise)}
                  className="relative w-14 h-14 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-500 overflow-hidden shrink-0 cursor-pointer group shadow-md shadow-black/60"
                  title="Ver demostración técnica en GIF"
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={exercise.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <Dumbbell className="w-6 h-6 text-zinc-400 stroke-[1.8]" />
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-4 h-4 text-accent" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-extrabold text-white tracking-tight leading-tight truncate">
                      {exercise.name}
                    </h3>
                    <button
                      onClick={() => setSelectedMediaExercise(exercise)}
                      className="text-zinc-500 hover:text-accent p-1 transition-colors"
                      title="Ver técnica"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30 capitalize">
                      {exercise.primaryMuscle}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-800/80 text-zinc-300 border border-white/[0.06] capitalize">
                      {exercise.category}
                    </span>
                    {bestRecord && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        PR: {bestRecord}
                      </span>
                    )}
                  </div>

                  {/* Last time summary */}
                  {previousRecord && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-mono pt-0.5">
                      <span className="font-semibold text-zinc-300">Anterior:</span> {previousRecord}
                    </p>
                  )}
                </div>
              </div>

              {/* openGym Table: WEIGHT (KG) | REPS | RIR | CHECK */}
              <div className="p-3.5 dark-glass-card rounded-[28px] border border-white/[0.08] shadow-xl space-y-2">
                <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-1 text-center pb-1">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">PESO (KG)</span>
                  <span className="col-span-3">REPS</span>
                  <span className="col-span-2">RIR</span>
                  <span className="col-span-2 flex justify-end pr-2"><Check className="w-3.5 h-3.5 text-accent" /></span>
                </div>

                {sets.map((set) => (
                  <div
                    key={set.setIndex}
                    className={`grid grid-cols-12 gap-1 items-center p-1.5 rounded-2xl transition-all ${
                      set.completed ? 'bg-accent/15 border border-accent/25' : 'glass-subcard'
                    }`}
                  >
                    {/* Set Circle Badge */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                          set.completed
                            ? 'bg-accent text-accent-fg'
                            : 'bg-zinc-800 text-zinc-400'
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
                        className="hidden min-[390px]:flex w-7 h-10 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 items-center justify-center"
                      >
                        —
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
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
                        className="font-mono font-bold text-white text-base tabular-nums w-full min-[390px]:w-12 h-10 text-center bg-zinc-900/80 border border-white/[0.08] rounded-lg py-0.5 focus:outline-none focus:border-accent"
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
                        className="hidden min-[390px]:flex w-7 h-10 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 items-center justify-center"
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
                        className="hidden min-[390px]:flex w-6 h-10 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 items-center justify-center"
                      >
                        —
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
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
                        className="font-mono font-bold text-white text-base tabular-nums w-full min-[390px]:w-9 h-10 text-center bg-zinc-900/80 border border-white/[0.08] rounded-lg py-0.5 focus:outline-none focus:border-accent"
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
                        className="hidden min-[390px]:flex w-6 h-10 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 items-center justify-center"
                      >
                        +
                      </button>
                    </div>

                    {/* RIR Controls (- 2 +) */}
                    <div className="col-span-2 flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'rir',
                            Math.max(0, (set.rir ?? 2) - 1)
                          )
                        }
                        aria-label={`Reducir RIR de la serie ${set.setIndex}`}
                        className="w-6 h-10 text-zinc-500 hover:text-white text-xs active:scale-75 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-zinc-300 text-xs tabular-nums w-4 text-center">
                        {set.rir !== undefined ? set.rir : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'rir',
                            Math.min(5, (set.rir ?? 2) + 1)
                          )
                        }
                        aria-label={`Aumentar RIR de la serie ${set.setIndex}`}
                        className="w-6 h-10 text-zinc-500 hover:text-white text-xs active:scale-75 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>

                    {/* openGym Circle Checkmark (dispara descanso) */}
                    <div className="col-span-2 flex items-center justify-end pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSet(exercise.id, set.setIndex);
                          if (!set.completed) onStartRestTimer(90);
                        }}
                        aria-label={`${set.completed ? 'Marcar pendiente' : 'Completar'} serie ${set.setIndex}`}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 active:scale-75 ${
                          set.completed
                            ? 'bg-accent text-accent-fg shadow-lg shadow-accent/30'
                            : 'border-2 border-zinc-700 text-transparent hover:border-zinc-500 bg-zinc-900/50'
                        }`}
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Botones de Acción de Serie */}
                <div className="pt-2 flex items-center justify-between text-xs font-semibold text-zinc-400">
                  <button
                    type="button"
                    onClick={() => onAddSet(exercise.id, true)}
                    className="flex items-center gap-1 text-accent hover:brightness-125 transition-colors py-1"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    + Serie de Calentamiento
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveSet(exercise.id)}
                    className="text-zinc-500 hover:text-red-400 transition-colors py-1"
                  >
                    — Quitar última serie
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onAddSet(exercise.id, false)}
                  className="w-full py-2.5 rounded-2xl glass-subcard border border-white/[0.08] text-xs font-bold text-accent hover:border-accent/40 transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-1.5 mt-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  Agregar Serie Efectiva
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Botón flotante para Agregar otro Ejercicio a la sesión activa */}
      {exerciseSessions.length > 0 && <div className="pt-4">
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="w-full py-3.5 rounded-2xl bg-accent/15 backdrop-blur-xl border border-accent/30 text-accent font-bold text-sm hover:bg-accent/25 transition-all duration-150 active:scale-[0.98] shadow-lg shadow-accent/10 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          Agregar Ejercicio a la Sesión
        </button>
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
