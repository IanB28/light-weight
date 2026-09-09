import React, { useEffect, useState } from 'react';
import { Dumbbell, ShieldCheck, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { syncWithCloud, subscribeToSyncStatus, SyncStatus } from '../lib/sync.js';

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });

  useEffect(() => {
    return subscribeToSyncStatus(setSyncStatus);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-2xl border-b border-white/[0.08] transition-colors duration-200">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
          <Dumbbell className="w-4 h-4 stroke-[2.2]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
              light-weight
            </h1>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              F&amp;F
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium tracking-tight mt-0.5">
            Gym Tracker Privado
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isWorkoutActive && (
          <button
            onClick={onNavigateToWorkout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs font-mono font-bold shadow-lg shadow-emerald-500/15 active:scale-[0.96] transition-transform duration-100 ease-out cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="tabular-nums">{activeWorkoutDuration}</span>
          </button>
        )}

        {/* Indicador de Sincronización en la Nube (Neon PostgreSQL) */}
        <button
          onClick={() => syncWithCloud()}
          title={
            syncStatus.state === 'syncing'
              ? 'Sincronizando con PostgreSQL...'
              : syncStatus.state === 'synced'
              ? `Sincronizado con Neon DB (${syncStatus.syncedSessionsCount ?? 0} sesiones)`
              : syncStatus.state === 'offline'
              ? 'Modo Offline (guardando en local)'
              : 'Toca para sincronizar con la nube'
          }
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] text-xs backdrop-blur-md active:scale-[0.94] transition-all cursor-pointer"
        >
          {syncStatus.state === 'syncing' ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span className="font-mono text-[10px] text-sky-400">Sincronizando</span>
            </>
          ) : syncStatus.state === 'synced' ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[10px] text-emerald-400">Neon OK</span>
            </>
          ) : syncStatus.state === 'offline' ? (
            <>
              <CloudOff className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono text-[10px] text-zinc-500">Offline</span>
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-mono text-[10px] text-zinc-400">Nube</span>
            </>
          )}
        </button>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-xs backdrop-blur-md">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono text-[11px] text-zinc-400">Operador</span>
        </div>
      </div>
    </header>
  );
};

