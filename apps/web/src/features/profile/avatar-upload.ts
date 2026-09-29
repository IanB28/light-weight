import type { AuthUser } from '@light-weight/domain';
import { apiEndpoint } from '../../lib/api-base.js';
import { requestJson } from '../../lib/api-errors.js';
import { validateNormalizedAvatarBlob } from './avatar-normalization.js';

/** Keep the byte check at the request boundary even if a caller bypasses normalization. */
export async function requestAvatarUpload(avatar: Blob, endpoint = apiEndpoint('/api/auth/avatar')): Promise<{ user: AuthUser }> {
  await validateNormalizedAvatarBlob(avatar);
  return requestJson<{ user: AuthUser }>(endpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: avatar
  }, 20_000);
}
