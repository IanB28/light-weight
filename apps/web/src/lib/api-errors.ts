import { ApiBaseConfigurationError } from './api-base.js';

export type ApiErrorCode =
  | 'network' | 'aborted' | 'api_unconfigured' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'validation' | 'rate_limited' | 'server' | 'unknown'
  | 'auth_required' | 'invalid_credentials' | 'email_already_exists'
  | 'username_already_exists' | 'password_too_weak' | 'invalid_email'
  | 'invalid_username' | 'user_not_found' | 'friend_request_exists'
  | 'already_friends' | 'cannot_friend_self' | 'not_friends'
  | 'routine_not_owned' | 'routine_share_not_found' | 'csrf_invalid'
  | 'cannot_share_with_self' | 'friend_request_not_found'
  | 'origin_not_allowed' | 'invalid_birth_date' | 'routine_has_custom_exercises'
  | 'routine_share_dismissed' | 'account_linking_required' | 'google_auth_failed';

export interface ApiError { code: ApiErrorCode; status?: number; retryable: boolean }
export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export class HttpError extends Error {
  constructor(readonly status: number, readonly serverCode?: string) { super(`HTTP ${status}`); }
}

const SERVER_CODES: Record<string, ApiErrorCode> = {
  AUTH_REQUIRED: 'auth_required', INVALID_CREDENTIALS: 'invalid_credentials',
  EMAIL_ALREADY_EXISTS: 'email_already_exists', USERNAME_ALREADY_EXISTS: 'username_already_exists',
  PASSWORD_TOO_WEAK: 'password_too_weak', INVALID_EMAIL: 'invalid_email',
  INVALID_USERNAME: 'invalid_username', USER_NOT_FOUND: 'user_not_found',
  FRIEND_REQUEST_EXISTS: 'friend_request_exists', ALREADY_FRIENDS: 'already_friends',
  CANNOT_FRIEND_SELF: 'cannot_friend_self', NOT_FRIENDS: 'not_friends',
  ROUTINE_NOT_OWNED: 'routine_not_owned', ROUTINE_SHARE_NOT_FOUND: 'routine_share_not_found',
  ROUTINE_HAS_CUSTOM_EXERCISES: 'routine_has_custom_exercises',
  ROUTINE_SHARE_DISMISSED: 'routine_share_dismissed',
  CANNOT_SHARE_WITH_SELF: 'cannot_share_with_self', FRIEND_REQUEST_NOT_FOUND: 'friend_request_not_found',
  ORIGIN_NOT_ALLOWED: 'origin_not_allowed', INVALID_BIRTH_DATE: 'invalid_birth_date',
  ACCOUNT_LINKING_REQUIRED: 'account_linking_required',
  GOOGLE_AUTH_FAILED: 'google_auth_failed',
  UNVERIFIED_EMAIL: 'google_auth_failed',
  CSRF_INVALID: 'csrf_invalid', RATE_LIMITED: 'rate_limited', FORBIDDEN: 'forbidden'
};

export function mapApiError(error: unknown): ApiError {
  if (error instanceof HttpError) {
    const code = error.serverCode ? SERVER_CODES[error.serverCode] : undefined;
    return code ? { code, status: error.status, retryable: error.status >= 500 || error.status === 429 } : mapHttpStatus(error.status);
  }
  if (error instanceof ApiBaseConfigurationError) return { code: 'api_unconfigured', retryable: false };
  if (error instanceof DOMException && error.name === 'AbortError') return { code: 'aborted', retryable: true };
  if (error instanceof TypeError) return { code: 'network', retryable: true };
  return { code: 'unknown', retryable: true };
}

export function mapHttpStatus(status: number): ApiError {
  if (status === 401) return { code: 'unauthorized', status, retryable: false };
  if (status === 403) return { code: 'forbidden', status, retryable: false };
  if (status === 404) return { code: 'not_found', status, retryable: false };
  if (status === 409) return { code: 'conflict', status, retryable: false };
  if (status === 400 || status === 422) return { code: 'validation', status, retryable: false };
  if (status === 429) return { code: 'rate_limited', status, retryable: true };
  if (status >= 500) return { code: 'server', status, retryable: true };
  return { code: 'unknown', status, retryable: false };
}

function cookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

let inMemoryCsrfToken: string | undefined;
export function setCsrfToken(token?: string) { inMemoryCsrfToken = token; }

export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = inMemoryCsrfToken || cookieValue('lw_csrf');
    if (csrfToken) headers.set('X-CSRF-Token', decodeURIComponent(csrfToken));
  }
  try {
    const response = await fetch(url, { ...init, headers, credentials: 'include', signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      throw new HttpError(response.status, typeof body?.error === 'string' ? body.error : undefined);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}
