import { useCallback, useEffect } from 'react';
import { pullThenDrainRoutineOutbox, syncWithCloud } from './sync.js';
import type { OperationResult } from './api-errors.js';

/** Keeps cloud transport details outside application composition. */
export function useCloudSync(onHydrated: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    void pullThenDrainRoutineOutbox().then((result) => {
      if (mounted && result.ok) onHydrated();
    });
    return () => { mounted = false; };
  }, [enabled, onHydrated]);

  useEffect(() => {
    if (!enabled) return;
    const syncOnline = () => { void pullThenDrainRoutineOutbox().then((result) => { if (result.ok) onHydrated(); }); };
    window.addEventListener('online', syncOnline);
    return () => window.removeEventListener('online', syncOnline);
  }, [enabled, onHydrated]);

  return useCallback((): Promise<OperationResult<{ syncedCount: number }>> => enabled
    ? syncWithCloud()
    : Promise.resolve({ ok: false, error: { code: 'auth_required', retryable: false } }), [enabled]);
}
