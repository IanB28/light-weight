import type { AuthUser } from '@light-weight/domain';
import type { ApiErrorCode, OperationResult } from '../../lib/api-errors.js';
import type { AuthStatus } from '../../lib/auth-session-state.js';
import type { UserProfile } from '../../lib/storage.js';

export type RemoteProfilePatch = Partial<Pick<
  AuthUser,
  'displayName' | 'username' | 'birthDate' | 'gender' | 'avatarUrl'
>>;

interface SaveProfileUpdateOptions {
  currentProfile: UserProfile;
  patch: Partial<UserProfile>;
  authStatus: AuthStatus;
  authUser: AuthUser | null;
  updateRemote: (patch: RemoteProfilePatch) => Promise<OperationResult<AuthUser>>;
  persistLocal: (profile: UserProfile) => UserProfile;
  translateError: (code: ApiErrorCode) => string;
  onSaved?: () => void;
}

/**
 * Keeps authenticated profile fields server-authoritative. Rejected remote values
 * never reach local storage; successful values are replaced by the canonical user
 * returned by the API before they are cached locally.
 */
export async function saveProfileUpdate({
  currentProfile,
  patch,
  authStatus,
  authUser,
  updateRemote,
  persistLocal,
  translateError,
  onSaved
}: SaveProfileUpdateOptions): Promise<string | undefined> {
  const candidate: UserProfile = { ...currentProfile, ...patch };

  if (authStatus === 'authenticated' && authUser) {
    const result = await updateRemote({
      displayName: patch.displayName ?? authUser.displayName,
      username: patch.username ?? authUser.username,
      gender: patch.gender !== undefined ? patch.gender : authUser.gender,
      birthDate: patch.birthDate !== undefined ? patch.birthDate : authUser.birthDate,
      avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : authUser.avatarUrl
    });

    if (!result.ok) return translateError(result.error.code);

    persistLocal({
      ...candidate,
      displayName: result.data.displayName,
      username: result.data.username,
      birthDate: result.data.birthDate,
      gender: result.data.gender,
      avatarUrl: result.data.avatarUrl
    });
    onSaved?.();
    return undefined;
  }

  persistLocal(candidate);
  onSaved?.();
  return undefined;
}

export async function submitProfileDraft(
  onSave: (profile: UserProfile) => void | string | Promise<void | string>,
  profile: UserProfile
): Promise<{ error: string | null; shouldClose: boolean }> {
  const error = await onSave(profile);
  return error
    ? { error, shouldClose: false }
    : { error: null, shouldClose: true };
}
