import React, { useState } from 'react';
import { X, Check, Info, Maximize2, Link2, Plus, ArrowDown, Trash2 } from 'lucide-react';
import { Exercise, LoggedSet } from '@light-weight/domain';
import { AddExerciseModal } from '../components/AddExerciseModal.js';

export interface ActiveExerciseSession {
  exercise: Exercise;
  previousRecord?: string;
  bestRecord?: string;
  targetRepRange: [number, number];
  sets: (LoggedSet & { rir?: number })[];
}

interface WorkoutViewProps {
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
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string) => void;
  onAddExercise: (exercise: Exercise) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onCreateCustomExercise: (name: string, muscle: any) => void;
  onFinishWorkout: () => void;
  onCancelWorkout: () => void;
  onStartRestTimer: (seconds: number) => void;
}

export const WorkoutView: React.FC<WorkoutViewProps> = ({
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
  onStartRestTimer
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

  return (
    <div className="space-y-4 pb-36">
      {/* openGym Workout Header */}
      <div className="flex items-center justify-between pt-1 sticky top-0 bg-black/90 backdrop-blur-md z-20 py-2 border-b border-white/[0.06]">
        <button
          onClick={onCancelWorkout}
          className="w-9 h-9 rounded-full bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-colors active:scale-95"
          title="Descartar sesión"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center">
          <h2 className="text-base font-extrabold text-white tracking-tight">{routineName}</h2>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {sessionDuration} • <span className="text-emerald-400">{completedSetsCount}/{totalSetsCount} sets</span> • <span className="text-zinc-300 font-bold">{totalVolumeKg} kg</span>
          </p>
        </div>

        <button
          onClick={onFinishWorkout}
          className="px-3 py-1.5 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center gap-1 hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
          title="Terminar entrenamiento"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Fin</span>
        </button>
      </div>

      {/* Lista de Ejercicios */}
      {exerciseSessions.length === 0 ? (
        <div className="p-8 text-center space-y-4 bg-[#121416] rounded-3xl border border-white/[0.06]">
          <p className="text-sm text-zinc-400">
            Aún no has agregado ejercicios a este entrenamiento.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-500 text-black font-bold text-xs rounded-xl hover:bg-emerald-400 transition-all active:scale-95"
          >
            + Agregar Primer Ejercicio
          </button>
        </div>
      ) : (
        exerciseSessions.map((session, exIndex) => {
          const { exercise, sets, previousRecord, bestRecord } = session;

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

              {/* Título del Ejercicio y Badges */}
              <div className="space-y-1.5">
                <h3 className="text-xl font-extrabold text-white tracking-tight">{exercise.name}</h3>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 capitalize">
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
                  <p className="text-xs text-zinc-400 leading-relaxed pt-1">
                    <span className="font-semibold text-zinc-300">Anterior:</span> {previousRecord}
                  </p>
                )}
              </div>

              {/* openGym Table: WEIGHT (KG) | REPS | RIR | CHECK */}
              <div className="p-3.5 rounded-3xl bg-[#141618] border border-white/[0.06] shadow-xl space-y-2">
                <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-1 text-center pb-1">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">PESO (KG)</span>
                  <span className="col-span-3">REPS</span>
                  <span className="col-span-2">RIR</span>
                  <span className="col-span-2 text-right pr-2">✓</span>
                </div>

                {sets.map((set) => (
                  <div
                    key={set.setIndex}
                    className={`grid grid-cols-12 gap-1 items-center p-1.5 rounded-2xl transition-all ${
                      set.completed ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-black/30'
                    }`}
                  >
                    {/* Set Circle Badge */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                          set.completed
                            ? 'bg-emerald-500 text-black'
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
                        className="w-5 h-8 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 flex items-center justify-center"
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
                        className="font-mono font-bold text-white text-base tabular-nums w-12 text-center bg-zinc-900/80 border border-white/[0.08] rounded-lg py-0.5 focus:outline-none focus:border-emerald-500"
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
                        className="w-5 h-8 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 flex items-center justify-center"
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
                        className="w-4 h-8 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 flex items-center justify-center"
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
                        className="font-mono font-bold text-white text-base tabular-nums w-9 text-center bg-zinc-900/80 border border-white/[0.08] rounded-lg py-0.5 focus:outline-none focus:border-emerald-500"
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
                        className="w-4 h-8 text-zinc-500 hover:text-white font-bold text-sm active:scale-75 flex items-center justify-center"
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
                        className="w-3.5 h-8 text-zinc-500 hover:text-white text-xs active:scale-75 flex items-center justify-center"
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
                        className="w-3.5 h-8 text-zinc-500 hover:text-white text-xs active:scale-75 flex items-center justify-center"
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
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 active:scale-75 ${
                          set.completed
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
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
                    onClick={() => onAddSet(exercise.id)}
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors py-1"
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
                  onClick={() => onAddSet(exercise.id)}
                  className="w-full py-2.5 rounded-2xl bg-zinc-900/90 border border-white/[0.06] text-xs font-bold text-emerald-400 hover:bg-zinc-800 transition-all active:scale-98 flex items-center justify-center gap-1.5 mt-1"
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
      <div className="pt-4">
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="w-full py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm hover:bg-emerald-500/20 transition-all active:scale-98 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          Agregar Ejercicio a la Sesión
        </button>
      </div>

      {/* Modal para Buscar / Agregar Ejercicio */}
      <AddExerciseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableExercises={availableExercises}
        onSelectExercise={onAddExercise}
        onCreateCustomExercise={onCreateCustomExercise}
      />
    </div>
  );
};
