import type { AuthStatus } from '../../lib/auth-session-state.js';
import type { AuthUser } from '@light-weight/domain';

export type AppAuthScreenTarget = 'loading' | 'auth_screen' | 'onboarding' | 'main_app';

export interface ResolveAuthScreenTargetInput {
  status: AuthStatus;
  isAuthenticated: boolean;
  user: AuthUser | null;
}

export function resolveAuthScreenTarget({
  status,
  isAuthenticated,
  user
}: ResolveAuthScreenTargetInput): AppAuthScreenTarget {
  if (status === 'loading') return 'loading';
  if (!isAuthenticated || !user) return 'auth_screen';
  if (!user.username || user.username.trim() === '') return 'onboarding';
  return 'main_app';
}
