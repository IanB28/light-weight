import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Settings } from 'lucide-react';
import { syncWithCloud, subscribeToSyncStatus, SyncStatus } from '../lib/sync.js';
import { Badge, IconButton } from './ui/index.js';

export interface ViewHeaderProps {
  title: string;
  subtitle?: string;
  greeting?: React.ReactNode;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
  rightExtra?: React.ReactNode;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  subtitle,
  greeting,
  isWorkoutActive,
  activeWorkoutDuration,
  onNavigateToWorkout,
  onOpenSettings,
  rightExtra
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => subscribeToSyncStatus(setSyncStatus), []);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  const isOffline = !isOnline || syncStatus.state === 'offline';

  const syncLabel = isOffline
    ? 'Sin conexión. Tus cambios se guardarán localmente.'
    : syncStatus.state === 'syncing'
    ? 'Sincronizando datos'
    : syncStatus.state === 'error'
        ? 'No pudimos sincronizar tus datos'
        : syncStatus.state === 'synced'
          ? 'Datos sincronizados'
          : 'Sincronizar datos';

  return (
    <header className="relative px-1 pb-1 pt-2">
      <div className="min-w-0 pr-[5.5rem]">
        <h1 className="break-words text-[clamp(1.75rem,9vw,2.15rem)] font-extrabold leading-none tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-xs text-xs font-medium leading-relaxed text-text-muted">{subtitle}</p>}
      </div>

      <div className="absolute right-0 top-1 flex items-center gap-2">
        <IconButton variant="secondary" size="sm" aria-label={syncLabel} title={syncLabel} onClick={() => syncWithCloud()}>
          {syncStatus.state === 'syncing' ? <RefreshCw className="size-4 animate-spin" /> : isOffline || syncStatus.state === 'error' ? <CloudOff className="size-4" /> : <Cloud className="size-4 text-accent" />}
        </IconButton>
        {onOpenSettings && <IconButton variant="secondary" size="sm" aria-label="Abrir ajustes" title="Ajustes y personalización" onClick={onOpenSettings}><Settings className="size-4" /></IconButton>}
      </div>

      {(rightExtra || (isWorkoutActive && onNavigateToWorkout) || isOffline || syncStatus.state === 'error') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rightExtra}
          {isWorkoutActive && onNavigateToWorkout && (
            <button type="button" onClick={onNavigateToWorkout} className="focus-visible:ring-accent inline-flex min-h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 text-xs font-bold text-accent focus-visible:outline-none focus-visible:ring-2">
              <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
              <span>Sesión activa</span>
              <span className="font-mono">{activeWorkoutDuration}</span>
            </button>
          )}
          {isOffline && <Badge className="border-amber-500/25 text-amber-400">Sin conexión · guardado local</Badge>}
          {syncStatus.state === 'error' && <Badge className="border-danger/30 text-danger">Error de sincronización</Badge>}
        </div>
      )}
      {greeting && <div className="pt-4">{greeting}</div>}
    </header>
  );
};
