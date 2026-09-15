import type { AuthUser } from '@light-weight/domain';
import type { ApiError } from './api-errors.js';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'offline' | 'error';

/**
 * Only an explicit unauthenticated response can discard a known identity.
 * Connectivity and server failures retain scope so local data is never treated
 * as another account's cache.
 */
export function resolveSessionRefreshFailure(
  previousUser: AuthUser | null,
  error: ApiError
): { user: AuthUser | null; status: AuthStatus; error: ApiError | null } {
  if (error.code === 'unauthorized' || error.code === 'auth_required') {
    return { user: null, status: 'anonymous', error: null };
  }
  if (error.code === 'network' || error.code === 'aborted') {
    return { user: previousUser, status: previousUser ? 'offline' : 'anonymous', error };
  }
  return { user: previousUser, status: 'error', error };
}
