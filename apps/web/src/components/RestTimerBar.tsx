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
    <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40">
      <div className="relative overflow-hidden rounded-2xl bg-[#121214]/95 border border-sky-500/30 p-3.5 shadow-2xl shadow-black/80 backdrop-blur-xl">
        {/* Progress Background Bar */}
        <div
          className="absolute inset-y-0 left-0 bg-sky-500/10 transition-all duration-1000 ease-linear pointer-events-none"
          style={{ width: `${percentage}%` }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Timer className="w-4 h-4 animate-spin [animation-duration:8s]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-sky-400 font-semibold">Descanso</p>
              <p className="text-xl font-bold text-zinc-100 font-mono tabular-nums leading-none">
                {formattedTime}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onAddSeconds(-15)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 text-xs font-semibold flex items-center gap-0.5 border border-white/[0.06]"
            >
              <Minus className="w-3 h-3" />
              15s
            </button>
            <button
              onClick={() => onAddSeconds(30)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 text-xs font-semibold flex items-center gap-0.5 border border-white/[0.06]"
            >
              <Plus className="w-3 h-3" />
              30s
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 hover:text-red-400 active:scale-95 text-zinc-400 transition-colors"
              title="Saltar descanso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
