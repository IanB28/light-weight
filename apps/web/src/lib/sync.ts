import { Routine, WorkoutSession } from '@light-weight/domain';
import {
  getStoredBodyweight, getStoredHistory, getStoredRoutines, saveStoredHistory,
  saveStoredBodyweight, saveStoredProfile, saveStoredRoutines, saveStoredUserInfo, UserInfo,
  getStoredDeletedRoutineIds, removeStoredDeletedRoutineIds
} from './storage.js';
import { ApiError, mapApiError, OperationResult, requestJson } from './api-errors.js';
import { apiEndpoint } from './api-base.js';
import { excludePendingRoutineTombstones } from './routine-tombstones.js';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncedAt?: Date;
  error?: ApiError;
  syncedSessionsCount?: number;
}

interface PullResponse {
  user?: (Partial<UserInfo> & { displayName?: string }) | null;
  profile?: { gender?: string } | null;
  routines?: Array<Partial<Routine>>;
  history?: WorkoutSession[];
  bodyweightLogs?: Array<{ weightKg?: unknown; loggedAt?: unknown }>;
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

export function pullFromCloud(): Promise<OperationResult<PullResponse>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (pullInFlight) return pullInFlight;
  notify({ state: 'syncing' });

  pullInFlight = (async () => {
    try {
      const data = await requestJson<PullResponse>(apiEndpoint('/api/sync/pull'));
      if (data.user?.id && (data.user.name || data.user.displayName)) {
        saveStoredUserInfo({ id: data.user.id, name: data.user.displayName || data.user.name || '', email: data.user.email || '' });
        saveStoredProfile({
          displayName: data.user.displayName || data.user.name,
          ...(typeof (data.user as { username?: unknown }).username === 'string' ? { username: (data.user as { username: string }).username } : {}),
          ...(typeof (data.user as { birthDate?: unknown }).birthDate === 'string' ? { birthDate: (data.user as { birthDate: string }).birthDate } : {}),
          ...((data.user as { gender?: unknown }).gender === 'male' || (data.user as { gender?: unknown }).gender === 'female' ? { gender: (data.user as { gender: 'male' | 'female' }).gender } : {}),
          ...(typeof (data.user as { avatarUrl?: unknown }).avatarUrl === 'string' ? { avatarUrl: (data.user as { avatarUrl: string }).avatarUrl } : {})
        });
      } else if (data.profile?.gender === 'male' || data.profile?.gender === 'female') saveStoredProfile({ gender: data.profile.gender });

      if (Array.isArray(data.routines) && data.routines.length > 0) {
        const local = getStoredRoutines();
        const existing = new Set(local.map((routine) => routine.id));
        const incoming = excludePendingRoutineTombstones(
          data.routines.filter((routine): routine is Routine => Boolean(routine.id && routine.name && Array.isArray(routine.exerciseIds))),
          getStoredDeletedRoutineIds()
        );
        // Pull never overwrites local edits, but immutable share attribution is
        // server-authored metadata and can safely repair an older local copy.
        const incomingById = new Map(incoming.map((routine) => [routine.id, routine]));
        const attributedLocal = local.map((routine) => {
          const remote = incomingById.get(routine.id);
          return !routine.origin && remote?.origin ? { ...routine, origin: remote.origin } : routine;
        });
        saveStoredRoutines([...attributedLocal, ...incoming.filter((routine) => !existing.has(routine.id))]);
      }
      if (Array.isArray(data.history) && data.history.length > 0) {
        const local = getStoredHistory();
        const existing = new Set(local.map((session) => session.id));
        saveStoredHistory([...data.history.filter((session) => !existing.has(session.id)), ...local]);
      }
      if (Array.isArray(data.bodyweightLogs) && data.bodyweightLogs.length > 0) {
        const incoming = data.bodyweightLogs.flatMap((entry) => {
          const timestamp = typeof entry.loggedAt === 'string' ? new Date(entry.loggedAt).getTime() : Number.NaN;
          const weightKg = typeof entry.weightKg === 'number' ? entry.weightKg : Number.NaN;
          if (!Number.isFinite(timestamp) || !Number.isFinite(weightKg) || weightKg <= 0) return [];
          return [{ date: new Date(timestamp).toISOString().slice(0, 10), timestamp, weightKg }];
        });
        const byDate = new Map([...incoming, ...getStoredBodyweight()].map((entry) => [entry.date, entry]));
        saveStoredBodyweight([...byDate.values()].sort((a, b) => a.timestamp - b.timestamp));
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

export function syncWithCloud(): Promise<OperationResult<{ syncedCount: number }>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (syncInFlight) return syncInFlight;
  notify({ state: 'syncing' });

  syncInFlight = (async () => {
    try {
      const payload = {
        sessions: getStoredHistory(),
        routines: getStoredRoutines(),
        deletedRoutineIds: getStoredDeletedRoutineIds(),
        bodyweightLogs: getStoredBodyweight().map((entry) => ({ weightKg: entry.weightKg, loggedAt: new Date(entry.timestamp).toISOString() }))
      };
      const data = await requestJson<{ syncedCount?: number; deletedRoutineIds?: string[] }>(apiEndpoint('/api/sync'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }, 10000);
      const syncedCount = data.syncedCount || 0;
      if (Array.isArray(data.deletedRoutineIds)) removeStoredDeletedRoutineIds(data.deletedRoutineIds);
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

if (typeof window !== 'undefined') window.addEventListener('offline', () => notify({ state: 'offline', error: { code: 'network', retryable: true } }));
