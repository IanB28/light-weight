import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './api-error.js';

export function configuredOrigins(): Set<string> {
  const configured = (process.env.WEB_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured);
}

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (origin && !configuredOrigins().has(origin)) return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED'));
  next();
}

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

function pruneAttempts(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size > 5_000) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (!oldest) break;
    attempts.delete(oldest);
  }
}

/** Single-instance abuse guard. A distributed store remains deployment work. */
export function authRateLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  if (attempts.size >= 5_000) pruneAttempts(now);
  const key = `${req.ip}:${String((req.body as { email?: unknown })?.email || '').trim().toLowerCase()}`;
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  if (current.count >= 10) return next(new ApiError(429, 'RATE_LIMITED'));
  current.count += 1;
  next();
}

const avatarUploads = new Map<string, Attempt>();

/** A narrow per-user/IP guard for binary avatar writes. */
export function avatarUploadRateLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  const key = `${req.auth?.userId || req.ip}:avatar`;
  const current = avatarUploads.get(key);
  if (!current || current.resetAt <= now) {
    avatarUploads.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  if (current.count >= 12) return next(new ApiError(429, 'RATE_LIMITED'));
  current.count += 1;
  next();
}
