import type { AuthUser, UserGender } from '@light-weight/domain';

export const CACHED_AUTH_USER_KEY = 'lightweight_cached_auth_user_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeAuthUser(data: unknown): AuthUser | null {
  if (!isRecord(data)) {
    return null;
  }

  const { id, email, username, displayName, birthDate, gender, avatarUrl, createdAt, updatedAt } = data;

  if (typeof id !== 'string' || id.trim().length === 0) return null;
  if (typeof email !== 'string' || email.trim().length === 0) return null;
  if (typeof username !== 'string') return null;
  if (typeof displayName !== 'string') return null;

  const validGender: UserGender | undefined =
    gender === 'male' || gender === 'female' ? gender : undefined;

  const sanitized: AuthUser = {
    id: id.trim(),
    email: email.trim(),
    username: username.trim(),
    displayName: displayName.trim(),
    createdAt: typeof createdAt === 'string' && createdAt.length > 0 ? createdAt : new Date().toISOString(),
    updatedAt: typeof updatedAt === 'string' && updatedAt.length > 0 ? updatedAt : new Date().toISOString()
  };

  if (typeof birthDate === 'string' && birthDate.trim().length > 0) {
    sanitized.birthDate = birthDate.trim();
  }
  if (validGender) {
    sanitized.gender = validGender;
  }
  if (typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) {
    sanitized.avatarUrl = avatarUrl.trim();
  }

  return sanitized;
}

export function getCachedAuthUser(): AuthUser | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    const raw = window.localStorage.getItem(CACHED_AUTH_USER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeAuthUser(parsed);
    if (!sanitized) {
      // Corrupted or invalid payload: clean up storage
      window.localStorage.removeItem(CACHED_AUTH_USER_KEY);
      return null;
    }
    return sanitized;
  } catch {
    return null;
  }
}

export function setCachedAuthUser(user: AuthUser): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    const sanitized = sanitizeAuthUser(user);
    if (!sanitized) {
      return;
    }
    window.localStorage.setItem(CACHED_AUTH_USER_KEY, JSON.stringify(sanitized));
  } catch {
    // QuotaExceededError or security restrictions: fail silently
  }
}

export function clearCachedAuthUser(): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.removeItem(CACHED_AUTH_USER_KEY);
  } catch {
    // Fail silently
  }
}
