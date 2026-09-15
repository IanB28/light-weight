import React, { useEffect, useState } from 'react';
import { RefreshCw, Settings } from 'lucide-react';
import { subscribeToSyncStatus, SyncStatus } from '../lib/sync.js';
import { Badge, IconButton } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';

export interface ViewHeaderProps {
  title: string;
  leading?: React.ReactNode;
  subtitle?: string;
  greeting?: React.ReactNode;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  leading,
  subtitle,
  greeting,
  isWorkoutActive,
  activeWorkoutDuration,
  onNavigateToWorkout,
  onOpenSettings
}) => {
  const { t } = useI18n();
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

  return (
    <header className="relative px-1 pb-1 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-[clamp(1.5rem,6.5vw,1.95rem)] font-extrabold leading-tight tracking-tight text-text-primary">
            {leading}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <p className="mt-1.5 max-w-xs text-xs font-medium leading-relaxed text-text-muted">{subtitle}</p>}
        </div>

        {onOpenSettings && (
          <div className="shrink-0 pt-0.5">
            <IconButton
              variant="secondary"
              size="sm"
              aria-label={t('header.openSettings')}
              title={t('header.settingsTitle')}
              onClick={onOpenSettings}
              className="size-10 min-h-10"
            >
              <Settings className="size-4" />
            </IconButton>
          </div>
        )}
      </div>

      {((isWorkoutActive && onNavigateToWorkout) || isOffline || syncStatus.state === 'error' || syncStatus.state === 'syncing') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isWorkoutActive && onNavigateToWorkout && (
            <button type="button" onClick={onNavigateToWorkout} className="focus-visible:ring-accent inline-flex min-h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 text-xs font-bold text-accent focus-visible:outline-none focus-visible:ring-2">
              <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
              <span>{t('header.activeSession')}</span>
              <span className="font-mono">{activeWorkoutDuration}</span>
            </button>
          )}
          {syncStatus.state === 'syncing' && <Badge><RefreshCw aria-hidden="true" className="mr-1.5 size-3 motion-safe:animate-spin" />{t('header.syncing')}</Badge>}
          {isOffline
            ? <Badge className="border-amber-500/25 text-amber-400">{t('header.offline')}</Badge>
            : syncStatus.state === 'error' && <Badge className="border-danger/30 text-danger">{t('header.syncError')}</Badge>}
        </div>
      )}
      {greeting && <div className="pt-4">{greeting}</div>}
    </header>
  );
};
