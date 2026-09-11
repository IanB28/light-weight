import React from 'react';
import { Timer, Plus, Minus, X } from 'lucide-react';

interface RestTimerBarProps {
  secondsLeft: number;
  totalSeconds: number;
  onAddSeconds: (delta: number) => void;
  onDismiss: () => void;
}

export const RestTimerBar: React.FC<RestTimerBarProps> = ({
  secondsLeft,
  totalSeconds,
  onAddSeconds,
  onDismiss
}) => {
  if (secondsLeft <= 0) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const percentage = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));

  return (
    <div className="bottom-above-nav fixed left-3 right-3 z-40 mx-auto max-w-md motion-safe:animate-in motion-safe:slide-in-from-bottom-5 motion-safe:duration-200">
      <div className="relative overflow-hidden rounded-3xl bg-black/65 border border-sky-400/25 p-3.5 shadow-2xl shadow-sky-500/15 backdrop-blur-2xl ring-1 ring-white/10 transition-all">
        {/* Progress Background Bar with smooth linear fade */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-500/15 to-sky-400/25 transition-all duration-1000 ease-linear pointer-events-none"
          style={{ width: `${percentage}%` }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-sm shadow-sky-500/20">
              <Timer className="w-5 h-5 motion-safe:animate-spin [animation-duration:8s]" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-sky-400">
                Descanso
              </p>
              <p className="text-xl font-extrabold text-white font-mono tabular-nums leading-none tracking-tight">
                {formattedTime}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            <button
              onClick={() => onAddSeconds(-15)}
              aria-label="Restar 15 segundos al descanso"
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.93] text-zinc-300 text-xs font-bold flex items-center gap-0.5 border border-white/[0.08] transition-all cursor-pointer"
              title="Restar 15 segundos"
            >
              <Minus className="w-3 h-3 stroke-[2.5]" />
              15s
            </button>
            <button
              onClick={() => onAddSeconds(30)}
              aria-label="Sumar 30 segundos al descanso"
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.93] text-zinc-300 text-xs font-bold flex items-center gap-0.5 border border-white/[0.08] transition-all cursor-pointer"
              title="Sumar 30 segundos"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              30s
            </button>
            <button
              onClick={onDismiss}
              aria-label="Saltar descanso"
              className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 active:scale-[0.93] text-zinc-400 hover:text-rose-400 flex items-center justify-center border border-white/[0.08] transition-all cursor-pointer ml-0.5"
              title="Saltar descanso"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
