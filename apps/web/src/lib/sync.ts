import { HistoricalPersonalRecord, Routine, WorkoutSession, type ExercisePerformanceHead } from '@light-weight/domain';
import {
  getStoredBodyweight, getStoredHistory, getStoredRoutines, saveStoredHistory,
  saveStoredBodyweight, saveStoredProfile, saveStoredRoutines, saveStoredUserInfo, UserInfo,
  getStoredDeletedRoutineIds, removeStoredDeletedRoutineIds, normalizeStoredRoutines,
  getStoredPendingRoutineUpsertIds, addStoredPendingRoutineUpserts, removeStoredPendingRoutineUpserts,
  isInitialRoutineCloudReconciliationComplete, completeInitialRoutineCloudReconciliation,
  getStoredWeeklySchedule, saveStoredWeeklySchedule, type WeeklySchedule,
  getStoredHistoricalPersonalRecords, saveStoredHistoricalPersonalRecords, normalizeStoredHistoricalPersonalRecords,
  saveStoredExercisePerformanceHeads
} from './storage.js';
import { ApiError, mapApiError, OperationResult, requestJson } from './api-errors.js';
import { apiEndpoint } from './api-base.js';
import { excludePendingRoutineTombstones } from './routine-tombstones.js';
import { hasLocalRoutineChanges, mergePulledRoutines, serializeRoutineForSync } from './routine-sync.js';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncedAt?: Date;
  error?: ApiError;
  syncedSessionsCount?: number;
}

/** Historical prefill reads an as-of projection; it never mutates local or cloud state. */
export async function fetchExercisePerformancesBefore(
  beforeTimestamp: number, exerciseIds: readonly string[], signal?: AbortSignal
): Promise<Record<string, ExercisePerformanceHead>> {
  if (!exerciseIds.length) return {};
  const params = new URLSearchParams({
    before: new Date(beforeTimestamp).toISOString(),
    exerciseIds: [...new Set(exerciseIds)].join(',')
  });
  const response = await requestJson<{ latestExercisePerformances: Record<string, ExercisePerformanceHead> }>(
    apiEndpoint(`/api/sync/exercise-performances?${params}`), { signal }, 12_000
  );
  return response.latestExercisePerformances ?? {};
}

interface PullResponse {
  user?: (Partial<UserInfo> & { displayName?: string }) | null;
  profile?: { gender?: string } | null;
  routines?: Array<Partial<Routine>>;
  history?: WorkoutSession[];
  latestExercisePerformances?: Record<string, ExercisePerformanceHead>;
  bodyweightLogs?: Array<{ weightKg?: unknown; loggedAt?: unknown }>;
  historicalPersonalRecords?: HistoricalPersonalRecord[];
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

export function pullFromCloud(endpoint?: string): Promise<OperationResult<PullResponse>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (pullInFlight) return pullInFlight;
  notify({ state: 'syncing' });

  pullInFlight = (async () => {
    try {
      const data = await requestJson<PullResponse>(endpoint ?? apiEndpoint('/api/sync/pull'));
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

      if (Array.isArray(data.routines)) {
        const local = getStoredRoutines();
        const incoming = normalizeStoredRoutines(excludePendingRoutineTombstones(
          data.routines.filter((routine): routine is Routine => Boolean(routine.id && routine.name && Array.isArray(routine.exerciseIds))),
          getStoredDeletedRoutineIds()
        ));
        if (!isInitialRoutineCloudReconciliationComplete()) {
          const remoteById = new Map(incoming.map((routine) => [routine.id, routine]));
          addStoredPendingRoutineUpserts(local.filter((routine) => {
            const remote = remoteById.get(routine.id);
            return remote && hasLocalRoutineChanges(routine, remote);
          }).map((routine) => routine.id));
          removeStoredPendingRoutineUpserts(local.filter((routine) => {
            const remote = remoteById.get(routine.id);
            return remote && !hasLocalRoutineChanges(routine, remote);
          }).map((routine) => routine.id));
        }
        const merged = mergePulledRoutines(local, incoming, {
          cloudAuthoritative: true,
          pendingUpsertIds: new Set(getStoredPendingRoutineUpsertIds())
        });
        saveStoredRoutines(merged);
        const kept = new Set(merged.map((routine) => routine.id));
        const removed = new Set(local.filter((routine) => !kept.has(routine.id)).map((routine) => routine.id));
        if (removed.size) {
          const schedule = getStoredWeeklySchedule();
          saveStoredWeeklySchedule(Object.fromEntries(Object.entries(schedule).map(([day, id]) =>
            [day, id && removed.has(id) ? null : id])) as WeeklySchedule);
        }
        completeInitialRoutineCloudReconciliation();
      }
      if (Array.isArray(data.history) && data.history.length > 0) {
        const local = getStoredHistory();
        const existing = new Set(local.map((session) => session.id));
        saveStoredHistory([...data.history.filter((session) => !existing.has(session.id)), ...local]);
      }
      if (data.latestExercisePerformances && typeof data.latestExercisePerformances === 'object') {
        saveStoredExercisePerformanceHeads(data.latestExercisePerformances);
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
      if (Array.isArray(data.historicalPersonalRecords) && data.historicalPersonalRecords.length > 0) {
        const local = getStoredHistoricalPersonalRecords();
        const existingIds = new Set(local.map((r) => r.id));
        const incoming = normalizeStoredHistoricalPersonalRecords(data.historicalPersonalRecords);
        const merged = [...incoming.filter((r) => !existingIds.has(r.id)), ...local].sort((left, right) => {
          const chronological = Date.parse(right.performedDate) - Date.parse(left.performedDate);
          return chronological !== 0 ? chronological : right.recordedAt.localeCompare(left.recordedAt);
        });
        saveStoredHistoricalPersonalRecords(merged);
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

export function syncWithCloud(endpoint?: string): Promise<OperationResult<{ syncedCount: number }>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(offlineResult());
  if (syncInFlight) return syncInFlight;
  notify({ state: 'syncing' });

  syncInFlight = (async () => {
    try {
      // Block 17 will replace this full-history push with a cursor/outbox
      // protocol. Keep it stable for now so retries remain idempotent.
      const storedRoutines = getStoredRoutines();
      const pendingIds = new Set(getStoredPendingRoutineUpsertIds());
      const submittedRoutines = storedRoutines.filter((routine) => pendingIds.has(routine.id))
        .map(serializeRoutineForSync);
      const submittedById = new Map(submittedRoutines.map((routine) => [routine.id, JSON.stringify(routine)]));
      const payload = {
        sessions: getStoredHistory(),
        routines: submittedRoutines,
        deletedRoutineIds: getStoredDeletedRoutineIds(),
        bodyweightLogs: getStoredBodyweight().map((entry) => ({ weightKg: entry.weightKg, loggedAt: new Date(entry.timestamp).toISOString() })),
        historicalPersonalRecords: getStoredHistoricalPersonalRecords()
      };
      const data = await requestJson<{ syncedCount?: number; deletedRoutineIds?: string[] }>(endpoint ?? apiEndpoint('/api/sync'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      // Sync may process a full local history. Its allowance intentionally
      // exceeds the API's 30s serverless limit without changing other calls.
      }, 35_000);
      const syncedCount = data.syncedCount || 0;
      if (Array.isArray(data.deletedRoutineIds)) removeStoredDeletedRoutineIds(data.deletedRoutineIds);
      removeStoredPendingRoutineUpserts(getStoredRoutines().filter((routine) => {
        const snapshot = submittedById.get(routine.id);
        return snapshot !== undefined && snapshot === JSON.stringify(serializeRoutineForSync(routine));
      }).map((routine) => routine.id));
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
