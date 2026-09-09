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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-[#121416] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              {session.routineName || 'Entrenamiento Libre'}
            </h3>
            <span className="text-[11px] text-zinc-400 font-mono capitalize">
              {formattedDate}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metrics Banner */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 border-b border-white/[0.04] text-center">
          <div>
            <span className="text-[10px] text-zinc-500 font-mono block">Duración</span>
            <span className="text-sm font-bold text-white font-mono">{durationMin} min</span>
          </div>
          <div className="border-x border-white/[0.06]">
            <span className="text-[10px] text-zinc-500 font-mono block">Tonelaje</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">
              {totalVolume.toLocaleString()} kg
            </span>
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 font-mono block">Series</span>
            <span className="text-sm font-bold text-white font-mono">{totalSets} sets</span>
          </div>
        </div>

        {/* Exercises & Sets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Object.entries(session.sets).map(([exId, sets]) => {
            const exercise = exercisesById[exId];
            const completedSets = sets.filter((s) => s.completed);

            return (
              <div
                key={exId}
                className="p-3.5 rounded-2xl bg-[#181A1D] border border-white/[0.04] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">
                      {exercise ? exercise.name : exId}
                    </h4>
                  </div>
                  <span className="text-[10px] text-zinc-400 capitalize font-mono">
                    {exercise?.primaryMuscle || ''}
                  </span>
                </div>

                <div className="space-y-1">
                  {completedSets.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-black/40 text-xs font-mono"
                    >
                      <span className="text-zinc-500">Serie {s.setIndex}</span>
                      <span className="text-zinc-200 font-bold">
                        {s.weightKg} kg × {s.reps} reps
                      </span>
                      <span className="text-emerald-400 text-[11px]">
                        {s.weightKg * s.reps} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {session.notes && (
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.04] text-xs text-zinc-400">
              <span className="font-bold text-zinc-300 block mb-0.5">Notas:</span>
              {session.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
