import type { UserProfile } from '../../lib/storage.js';

/**
 * Applies only the local profile portion of a validated backup through the
 * canonical store. It deliberately has no remote/API dependency: importing a
 * backup is not an authenticated account-profile mutation.
 */
export function restoreProfileFromBackup(
  value: unknown,
  persist: (profile: Partial<UserProfile>) => UserProfile
): UserProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return persist(value as Partial<UserProfile>);
}
