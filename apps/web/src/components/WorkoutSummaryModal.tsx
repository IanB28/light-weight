import React from 'react';
import { Trophy, Clock, Dumbbell, Flame, Check, Sparkles } from 'lucide-react';
import { Exercise } from '@light-weight/domain';

export interface CompletedWorkoutSummary {
  routineName: string;
  durationFormatted: string;
  totalVolumeKg: number;
  totalCompletedSets: number;
  newRecords: Array<{
    exerciseName: string;
    weightKg: number;
    reps: number;
    estimatedOneRm: number;
  }>;
}

interface WorkoutSummaryModalProps {
  isOpen: boolean;
  summary: CompletedWorkoutSummary | null;
  onConfirmSave: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  isOpen,
  summary,
  onConfirmSave,
}) => {
  if (!isOpen || !summary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-2xl animate-fade-in">
      <div className="relative w-full max-w-sm dark-glass-card border border-white/[0.08] rounded-[28px] shadow-2xl overflow-hidden p-6 text-center space-y-5 animate-scale-up">
        {/* Glow behind trophy */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-36 bg-accent/20 rounded-full blur-2xl pointer-events-none" />

        {/* Trophy Icon */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-accent flex items-center justify-center text-accent-fg shadow-lg shadow-accent/30">
          <Trophy className="w-8 h-8 stroke-[2.2]" />
        </div>

        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-accent font-mono">
            SESIÓN COMPLETADA
          </span>
          <h3 className="text-xl font-black text-white tracking-tight mt-0.5">
            {summary.routineName || 'Entrenamiento Libre'}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Tus datos han sido registrados con éxito.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl glass-subcard border border-white/[0.06]">
          <div>
            <div className="flex items-center justify-center gap-1 text-zinc-500 text-[10px] uppercase font-bold">
              <Clock className="w-3 h-3" />
              <span>Tiempo</span>
            </div>
            <p className="text-sm font-extrabold text-white font-mono mt-1">
              {summary.durationFormatted}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-zinc-500 text-[10px] uppercase font-bold">
              <Dumbbell className="w-3 h-3" />
              <span>Volumen</span>
            </div>
            <p className="text-sm font-extrabold text-accent font-mono mt-1">
              {summary.totalVolumeKg} <span className="text-[10px] font-normal">kg</span>
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-zinc-500 text-[10px] uppercase font-bold">
              <Flame className="w-3 h-3" />
              <span>Series</span>
            </div>
            <p className="text-sm font-extrabold text-white font-mono mt-1">
              {summary.totalCompletedSets}
            </p>
          </div>
        </div>

        {/* New Personal Records (if any) */}
        {summary.newRecords.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>¡Nuevos Récords Personales (PR)!</span>
            </div>
            <div className="space-y-1">
              {summary.newRecords.map((rec, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                  <span className="font-semibold text-white">{rec.exerciseName}</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {rec.weightKg} kg × {rec.reps} (1RM: ~{rec.estimatedOneRm} kg)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save and Finish Button */}
        <button
          onClick={onConfirmSave}
          className="w-full py-3.5 bg-accent hover:brightness-110 active:scale-[0.98] text-accent-fg font-extrabold text-sm rounded-2xl transition-all shadow-lg shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          Guardar y Cerrar
        </button>
      </div>
    </div>
  );
};
