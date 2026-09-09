import React, { useState, useEffect } from 'react';
import { Settings, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { syncWithCloud, subscribeToSyncStatus, SyncStatus } from '../lib/sync.js';

export interface ViewHeaderProps {
  title: string;
  subtitle: React.ReactNode;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
  rightExtra?: React.ReactNode;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  subtitle,
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings,
  rightExtra
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });

  useEffect(() => {
    return subscribeToSyncStatus(setSyncStatus);
  }, []);

  return (
    <div className="flex items-start justify-between pt-1 pb-1 px-0.5">
      <div className="min-w-0 pr-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans truncate">
          {title}
        </h1>
        <div className="text-xs text-zinc-400 font-medium mt-0.5 truncate">
          {subtitle}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 shrink-0">
        {rightExtra}

        {isWorkoutActive && onNavigateToWorkout && (
          <button
            type="button"
            onClick={onNavigateToWorkout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-semibold active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono">{activeWorkoutDuration}</span>
          </button>
        )}

        {/* Indicador de Sincronización en la Nube (Neon PostgreSQL) */}
        <button
          type="button"
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
          className="glass-subcard flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs hover:border-white/20 active:scale-95 transition-all cursor-pointer"
        >
          {syncStatus.state === 'syncing' ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span className="font-mono text-[10px] text-sky-400">Sincronizando</span>
            </>
          ) : syncStatus.state === 'synced' ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-accent" />
              <span className="font-mono text-[10px] text-accent font-medium">Neon OK</span>
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

        {/* Botón de Ajustes y Personalización */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="glass-subcard w-9 h-9 rounded-full flex items-center justify-center hover:border-white/20 active:scale-95 transition-all cursor-pointer"
            title="Ajustes y Personalización"
          >
            <Settings className="w-4 h-4 text-zinc-300" />
          </button>
        )}
      </div>
    </div>
  );
};
