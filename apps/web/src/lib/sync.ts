import {
  getStoredHistory,
  saveStoredHistory,
  getStoredBodyweight,
  getStoredRoutines,
  saveStoredRoutines,
  saveStoredUserInfo,
  UserInfo
} from './storage.js';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncedAt?: Date;
  errorMessage?: string;
  syncedSessionsCount?: number;
}

type SyncListener = (status: SyncStatus) => void;
const listeners: Set<SyncListener> = new Set();

let currentStatus: SyncStatus = {
  state: typeof navigator !== 'undefined' && navigator.onLine ? 'idle' : 'offline',
};

function notify(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((fn) => fn(currentStatus));
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export async function checkCloudHealth(): Promise<{ ok: boolean; database?: string; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false, message: `Status ${res.status}` };
    const data = await res.json();
    return { ok: data.status === 'ok', database: data.database, message: data.dbDetails };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Sin respuesta del servidor' };
  }
}

export async function pullFromCloud(userId = '00000000-0000-0000-0000-000000000001'): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notify({ state: 'offline', errorMessage: 'Sin conexión a internet' });
    return false;
  }

  notify({ state: 'syncing' });

  try {
    const res = await fetch(`${API_BASE}/api/sync/pull?userId=${userId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Error en servidor: ${res.statusText}`);
    const data = await res.json();

    // Si la nube retorna datos del usuario de la base de datos
    if (data.user && data.user.name) {
      saveStoredUserInfo({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email
      });
    }

    // Si la nube tiene rutinas, combinar con las locales
    if (data.routines && Array.isArray(data.routines) && data.routines.length > 0) {
      const currentRoutines = getStoredRoutines();
      const existingIds = new Set(currentRoutines.map((r) => r.id));
      const incoming = data.routines.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description || undefined,
        exerciseIds: r.exerciseIds || [],
      }));
      const merged = [...currentRoutines, ...incoming.filter((r: any) => !existingIds.has(r.id))];
      saveStoredRoutines(merged);
    }

    // Si la nube tiene historial, combinar con el local
    if (data.history && Array.isArray(data.history) && data.history.length > 0) {
      const currentHistory = getStoredHistory();
      const existingIds = new Set(currentHistory.map((s) => s.id));
      const incomingSessions = data.history.map((s: any) => ({
        id: s.id,
        userId: s.userId,
        routineId: s.routineId,
        routineName: s.routineName,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        notes: s.notes,
        sets: s.sets || {},
      }));
      const mergedHistory = [...incomingSessions.filter((s: any) => !existingIds.has(s.id)), ...currentHistory];
      saveStoredHistory(mergedHistory);
    }

    notify({
      state: 'synced',
      lastSyncedAt: new Date(),
      syncedSessionsCount: data.history?.length || 0,
    });
    return true;
  } catch (error: any) {
    console.warn('[Pull Sync Error]', error);
    notify({
      state: 'error',
      errorMessage: error.message || 'Fallo al descargar datos',
    });
    return false;
  }
}

export async function syncWithCloud(userId = '00000000-0000-0000-0000-000000000001'): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notify({ state: 'offline', errorMessage: 'Sin conexión a internet' });
    return false;
  }

  notify({ state: 'syncing' });

  try {
    const history = getStoredHistory();
    const bodyweight = getStoredBodyweight();
    const routines = getStoredRoutines();

    const payload = {
      userId,
      sessions: history,
      routines,
      bodyweightLogs: bodyweight.map((b) => ({
        weightKg: b.weightKg,
        loggedAt: new Date(b.timestamp).toISOString(),
      })),
    };

    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Error en servidor: ${res.statusText}`);
    }

    const data = await res.json();

    notify({
      state: 'synced',
      lastSyncedAt: new Date(),
      syncedSessionsCount: data.syncedCount,
    });
    return true;
  } catch (error: any) {
    console.warn('[Sync Error]', error);
    notify({
      state: 'error',
      errorMessage: error.message || 'Fallo de sincronización',
    });
    return false;
  }
}

export async function fetchUserFromCloud(userId = '00000000-0000-0000-0000-000000000001'): Promise<UserInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sync/user?userId=${userId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.user && data.user.name) {
      return saveStoredUserInfo({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email
      });
    }
    return null;
  } catch {
    return null;
  }
}

// Auto-sincronización al recuperar conectividad
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncWithCloud();
  });
  window.addEventListener('offline', () => {
    notify({ state: 'offline' });
  });
}
