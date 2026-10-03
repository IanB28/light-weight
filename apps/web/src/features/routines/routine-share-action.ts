import { mapApiError } from '../../lib/api-errors.js';
import { routineSharesApi } from '../../lib/social-api.js';
import { syncWithCloud } from '../../lib/sync.js';

/** One dispatcher per share sheet: a failed sync never creates a server snapshot. */
export function createShareAction(
  sync: typeof syncWithCloud = syncWithCloud,
  send: typeof routineSharesApi.share = routineSharesApi.share
) {
  let busy = false;
  return async (routineId: string, recipientId: string) => {
    if (busy) return { kind: 'busy' } as const;
    busy = true;
    try {
      const synced = await sync();
      if (!synced.ok) return { kind: 'error', error: synced.error } as const;
      await send(routineId, recipientId);
      return { kind: 'sent' } as const;
    } catch (cause) {
      return { kind: 'error', error: mapApiError(cause) } as const;
    } finally {
      busy = false;
    }
  };
}
