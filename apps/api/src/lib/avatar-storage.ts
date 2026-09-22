import { del, put } from '@vercel/blob';

export interface StoredAvatar {
  url: string;
}

/**
 * Small server-only boundary around Vercel Blob. Keeping it injectable makes
 * the upload route testable without a live Blob store and keeps credentials
 * out of browser code.
 */
export interface AvatarStorage {
  put(pathname: string, bytes: Uint8Array): Promise<StoredAvatar>;
  delete(url: string): Promise<void>;
  isOwnedAvatarUrl(url: string, userId: string): boolean;
}

export const AVATAR_PATH_PREFIX = 'avatars/';

export function isOwnedAvatarPath(url: string, userId: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname.endsWith('.blob.vercel-storage.com')
      && parsed.pathname.startsWith(`/${AVATAR_PATH_PREFIX}${userId}/`)
      && parsed.pathname.endsWith('.webp');
  } catch {
    return false;
  }
}

export const vercelBlobAvatarStorage: AvatarStorage = {
  async put(pathname, bytes) {
    const blob = await put(pathname, Buffer.from(bytes), {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false
    });
    return { url: blob.url };
  },
  async delete(url) {
    await del(url);
  },
  isOwnedAvatarUrl: isOwnedAvatarPath
};
