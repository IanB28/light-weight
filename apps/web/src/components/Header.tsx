import React from 'react';
import { Dumbbell, ShieldCheck, Flame } from 'lucide-react';

interface HeaderProps {
  isWorkoutActive: boolean;
  activeWorkoutDuration: string;
  onNavigateToWorkout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isWorkoutActive,
  activeWorkoutDuration,
  onNavigateToWorkout
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-white/[0.08]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
          <Dumbbell className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-bold tracking-tight text-zinc-100">light-weight</h1>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              F&amp;F
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium">Gym Tracker Privado</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isWorkoutActive && (
          <button
            onClick={onNavigateToWorkout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 text-xs font-semibold animate-pulse active:scale-95 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="tabular-nums font-mono">{activeWorkoutDuration}</span>
          </button>
        )}

        <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">Operador</span>
        </div>
      </div>
    </header>
  );
};
