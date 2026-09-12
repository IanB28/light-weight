export type ApiErrorCode = 'network' | 'aborted' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation' | 'rate_limited' | 'server' | 'unknown';

export interface ApiError {
  code: ApiErrorCode;
  status?: number;
  retryable: boolean;
}

export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

class HttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

export function mapApiError(error: unknown): ApiError {
  if (error instanceof HttpError) {
    return mapHttpStatus(error.status);
  }
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

export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new HttpError(response.status);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}
