import type { AuthUser } from '@light-weight/domain';
import type { AuthStatus } from '../../lib/auth-session-state.js';
import type { UserProfile } from '../../lib/storage.js';

/**
 * Local profile data is always restored first. A confirmed online session alone
 * may overlay account identity fields from the canonical server user. This keeps
 * imports/offline edits local and never treats them as remote account mutations.
 */
export function resolveEffectiveProfile(
  localProfile: UserProfile,
  authUser: AuthUser | null,
  authStatus: AuthStatus
): UserProfile {
  if (authStatus !== 'authenticated' || !authUser) return localProfile;

  return {
    ...localProfile,
    displayName: authUser.displayName,
    username: authUser.username,
    gender: authUser.gender,
    birthDate: authUser.birthDate,
    avatarUrl: authUser.avatarUrl
  };
}
