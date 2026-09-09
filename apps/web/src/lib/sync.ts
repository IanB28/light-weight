import { getStoredHistory, getStoredBodyweight } from './storage.js';

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
  state: navigator.onLine ? 'idle' : 'offline',
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

export async function syncWithCloud(userId = '00000000-0000-0000-0000-000000000001'): Promise<boolean> {
  if (!navigator.onLine) {
    notify({ state: 'offline', errorMessage: 'Sin conexión a internet' });
    return false;
  }

  notify({ state: 'syncing' });

  try {
    const history = getStoredHistory();
    const bodyweight = getStoredBodyweight();

    const payload = {
      userId,
      sessions: history,
      bodyweightLogs: bodyweight.map((b) => ({
        weightKg: b.weightKg,
        loggedAt: new Date(b.timestamp).toISOString(),
      })),
    };

    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

// Auto-sincronización al recuperar conectividad
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncWithCloud();
  });
  window.addEventListener('offline', () => {
    notify({ state: 'offline' });
  });
}
