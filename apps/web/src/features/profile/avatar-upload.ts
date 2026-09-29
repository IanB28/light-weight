import type { AuthUser } from '@light-weight/domain';
import { apiEndpoint } from '../../lib/api-base.js';
import { requestJson } from '../../lib/api-errors.js';
import { AvatarNormalizationError, validateNormalizedAvatarBlob, type NormalizedAvatar } from './avatar-normalization.js';

/** Keep the byte check at the request boundary even if a caller bypasses normalization. */
export async function requestAvatarUpload(avatar: NormalizedAvatar, endpoint = apiEndpoint('/api/auth/avatar')): Promise<{ user: AuthUser }> {
  const validated = await validateNormalizedAvatarBlob(avatar.blob);
  if (avatar.mimeType !== validated.mimeType || avatar.extension !== validated.extension) {
    throw new AvatarNormalizationError('normalization_failed');
  }
  return requestJson<{ user: AuthUser }>(endpoint, {
    method: 'PUT', headers: { 'Content-Type': validated.mimeType }, body: validated.blob
  }, 20_000);
}
