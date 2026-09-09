import React from 'react';
import { X, Calendar, Clock, Flame, Dumbbell } from 'lucide-react';
import { WorkoutSession, calculateSessionTotalVolume, Exercise } from '@light-weight/domain';

interface WorkoutDetailModalProps {
  session: WorkoutSession | null;
  onClose: () => void;
  exercisesById: Record<string, Exercise>;
}

export const WorkoutDetailModal: React.FC<WorkoutDetailModalProps> = ({
  session,
  onClose,
  exercisesById
}) => {
  if (!session) return null;

  const totalVolume = calculateSessionTotalVolume(session);
  const totalSets = Object.values(session.sets).reduce(
    (acc, sets) => acc + sets.filter((s) => s.completed).length,
    0
  );

  const durationMin = session.endedAt
    ? Math.max(
        1,
        Math.round(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000
        )
      )
    : 45;

  const formattedDate = new Date(session.startedAt).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#121416]/92 backdrop-blur-2xl border border-white/[0.12] rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-black/90 animate-in slide-in-from-bottom-6 duration-200">
        {/* iOS Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mt-2.5 mb-0.5 sm:hidden" />

        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white tracking-tight">
              {session.routineName || 'Entrenamiento Libre'}
            </h3>
            <span className="text-[11px] text-zinc-400 font-mono capitalize">
              {formattedDate}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.93] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Summary Metric Chips */}
        <div className="grid grid-cols-3 gap-2 p-4 bg-white/[0.02] border-b border-white/[0.04] text-center font-mono">
          <div className="p-2 rounded-2xl bg-black/40 border border-white/[0.04]">
            <span className="text-[10px] text-zinc-500 block uppercase">Tonelaje</span>
            <span className="text-sm font-extrabold text-emerald-400">
              {totalVolume.toLocaleString()} kg
            </span>
          </div>

          <div className="p-2 rounded-2xl bg-black/40 border border-white/[0.04]">
            <span className="text-[10px] text-zinc-500 block uppercase">Series</span>
            <span className="text-sm font-extrabold text-white">{totalSets}</span>
          </div>

          <div className="p-2 rounded-2xl bg-black/40 border border-white/[0.04]">
            <span className="text-[10px] text-zinc-500 block uppercase">Duración</span>
            <span className="text-sm font-extrabold text-white">{durationMin} min</span>
          </div>
        </div>

        {/* Exercise Breakdown */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Object.entries(session.sets).map(([exId, sets]) => {
            const exercise = exercisesById[exId] || {
              id: exId,
              name: 'Ejercicio',
              category: 'other',
              primaryMuscle: 'chest'
            };
            const completedSets = sets.filter((s) => s.completed && !s.isWarmup);

            return (
              <div
                key={exId}
                className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.04] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{exercise.name}</h4>
                    <span className="text-[10px] font-mono capitalize text-zinc-400">
                      {exercise.primaryMuscle}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-zinc-400">
                    {completedSets.length} series
                  </span>
                </div>

                {/* Sets Table */}
                <div className="space-y-1">
                  {sets.map((s, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-mono ${
                        s.completed
                          ? 'bg-white/[0.03] text-zinc-200'
                          : 'opacity-40 text-zinc-500'
                      }`}
                    >
                      <span className="text-zinc-500 text-[11px]">S{idx + 1}</span>
                      <span className="font-bold">
                        {s.weightKg} kg × {s.reps} reps
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {s.rir !== undefined ? `RIR ${s.rir}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
