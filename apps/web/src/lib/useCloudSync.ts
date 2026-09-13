import { useCallback, useEffect } from 'react';
import { pullFromCloud, syncWithCloud } from './sync.js';

/** Keeps cloud transport details outside application composition. */
export function useCloudSync(onHydrated: () => void) {
  useEffect(() => {
    let mounted = true;
    void pullFromCloud().then((result) => {
      if (mounted && result.ok) onHydrated();
    });
    return () => { mounted = false; };
  }, [onHydrated]);

  return useCallback(() => syncWithCloud(), []);
}
