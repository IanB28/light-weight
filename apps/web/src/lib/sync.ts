import { Routine, WorkoutSession } from '@light-weight/domain';
import {
  getStoredBodyweight, getStoredHistory, getStoredRoutines, saveStoredHistory,
  saveStoredProfile, saveStoredRoutines, saveStoredUserInfo, UserInfo
} from './storage.js';
import { ApiError, mapApiError, OperationResult, requestJson } from './api-errors.js';

const API_BASE = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://localhost:4000';
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncedAt?: Date;
  error?: ApiError;
  syncedSessionsCount?: number;
}

interface PullResponse {
  user?: Partial<UserInfo> | null;
  profile?: { gender?: string } | null;
  routines?: Array<Partial<Routine>>;
  history?: WorkoutSession[];
}

type SyncListener = (status: SyncStatus) => void;
const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = { state: typeof navigator !== 'undefined' && navigator.onLine ? 'idle' : 'offline' };
let syncInFlight: Promise<OperationResult<{ syncedCount: number }>> | null = null;
let pullInFlight: Promise<OperationResult<PullResponse>> | null = null;

function notify(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

const offlineResult = <T,>(): OperationResult<T> => {
  const error: ApiError = { code: 'network', retryable: true };
  notify({ state: 'offline', error });
  return { ok: false, error };
};

export function pullFromCloud(userId = DEFAULT_USER_ID): Promise<OperationResult<PullResponse>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (pullInFlight) return pullInFlight;
  notify({ state: 'syncing' });

  pullInFlight = (async () => {
    try {
      const data = await requestJson<PullResponse>(`${API_BASE}/api/sync/pull?userId=${encodeURIComponent(userId)}`);
      if (data.user?.id && data.user.name) saveStoredUserInfo({ id: data.user.id, name: data.user.name, email: data.user.email || '' });
      if (data.profile?.gender === 'male' || data.profile?.gender === 'female') saveStoredProfile({ gender: data.profile.gender });

      if (Array.isArray(data.routines) && data.routines.length > 0) {
        const local = getStoredRoutines();
        const existing = new Set(local.map((routine) => routine.id));
        const incoming = data.routines.filter((routine): routine is Routine => Boolean(routine.id && routine.name && Array.isArray(routine.exerciseIds)));
        saveStoredRoutines([...local, ...incoming.filter((routine) => !existing.has(routine.id))]);
      }
      if (Array.isArray(data.history) && data.history.length > 0) {
        const local = getStoredHistory();
        const existing = new Set(local.map((session) => session.id));
        saveStoredHistory([...data.history.filter((session) => !existing.has(session.id)), ...local]);
      }

      notify({ state: 'synced', lastSyncedAt: new Date(), syncedSessionsCount: data.history?.length || 0 });
      return { ok: true, data };
    } catch (cause) {
      const error = mapApiError(cause);
      notify({ state: error.code === 'network' ? 'offline' : 'error', error });
      return { ok: false, error };
    } finally {
      pullInFlight = null;
    }
  })();
  return pullInFlight;
}

export function syncWithCloud(userId = DEFAULT_USER_ID): Promise<OperationResult<{ syncedCount: number }>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (syncInFlight) return syncInFlight;
  notify({ state: 'syncing' });

  syncInFlight = (async () => {
    try {
      const payload = {
        userId,
        sessions: getStoredHistory(),
        routines: getStoredRoutines(),
        bodyweightLogs: getStoredBodyweight().map((entry) => ({ weightKg: entry.weightKg, loggedAt: new Date(entry.timestamp).toISOString() }))
      };
      const data = await requestJson<{ syncedCount?: number }>(`${API_BASE}/api/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }, 10000);
      const syncedCount = data.syncedCount || 0;
      notify({ state: 'synced', lastSyncedAt: new Date(), syncedSessionsCount: syncedCount });
      return { ok: true, data: { syncedCount } };
    } catch (cause) {
      const error = mapApiError(cause);
      notify({ state: error.code === 'network' ? 'offline' : 'error', error });
      return { ok: false, error };
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void syncWithCloud(); });
  window.addEventListener('offline', () => notify({ state: 'offline', error: { code: 'network', retryable: true } }));
}
