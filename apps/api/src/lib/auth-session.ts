import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import type { AuthUser } from '@light-weight/domain';
import { db } from '../db/index.js';
import { authSessions, users } from '../db/schema.js';
import { ApiError } from './api-error.js';

export const SESSION_COOKIE = 'lw_session';
export const CSRF_COOKIE = 'lw_csrf';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface AuthIdentity {
  userId: string;
  sessionId: string;
  csrfTokenHash: string;
  user: AuthUser;
}

declare global {
  namespace Express {
    interface Request { auth?: AuthIdentity }
  }
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part.trim(), ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }));
}

/** Secure is the production default; an override is intentional and explicit. */
export function shouldUseSecureCookie(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SESSION_COOKIE_SECURE === 'true') return true;
  if (env.SESSION_COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

function cookieOptions(httpOnly: boolean, maxAge = SESSION_TTL_MS) {
  return { httpOnly, secure: shouldUseSecureCookie(), sameSite: 'lax' as const, path: '/', maxAge };
}

export function setSessionCookies(res: Response, sessionToken: string, csrfToken: string) {
  res.cookie(SESSION_COOKIE, sessionToken, cookieOptions(true));
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(false));
}

function setCsrfCookie(res: Response, csrfToken: string) {
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(false));
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(true, 0));
  res.clearCookie(CSRF_COOKIE, cookieOptions(false, 0));
}

export async function createAuthSession(userId: string): Promise<{ sessionToken: string; csrfToken: string }> {
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  await db.insert(authSessions).values({
    userId,
    tokenHash: hashOpaqueToken(sessionToken),
    csrfTokenHash: hashOpaqueToken(csrfToken),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  });
  return { sessionToken, csrfToken };
}

export function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username || '',
    displayName: row.displayName,
    birthDate: row.birthDate || undefined,
    gender: row.gender === 'male' || row.gender === 'female' ? row.gender : undefined,
    avatarUrl: row.avatarUrl || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED');
    const [record] = await db.select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(and(eq(authSessions.tokenHash, hashOpaqueToken(token)), gt(authSessions.expiresAt, new Date())))
      .limit(1);
    if (!record) throw new ApiError(401, 'AUTH_REQUIRED');
    req.auth = {
      userId: record.user.id,
      sessionId: record.session.id,
      csrfTokenHash: record.session.csrfTokenHash,
      user: toAuthUser(record.user)
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  const token = req.get('x-csrf-token');
  const expected = req.auth?.csrfTokenHash;
  if (!token || !expected) return next(new ApiError(403, 'CSRF_INVALID'));
  const actualBuffer = Buffer.from(hashOpaqueToken(token), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return next(new ApiError(403, 'CSRF_INVALID'));
  }
  next();
}

export function currentCsrfToken(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[CSRF_COOKIE];
}

export async function ensureCurrentCsrfToken(req: Request, res: Response): Promise<string> {
  const current = currentCsrfToken(req);
  if (current && req.auth?.csrfTokenHash === hashOpaqueToken(current)) return current;
  if (!req.auth) throw new ApiError(401, 'AUTH_REQUIRED');
  const token = randomBytes(24).toString('base64url');
  const tokenHash = hashOpaqueToken(token);
  await db.update(authSessions).set({ csrfTokenHash: tokenHash }).where(eq(authSessions.id, req.auth.sessionId));
  req.auth.csrfTokenHash = tokenHash;
  setCsrfCookie(res, token);
  return token;
}

export async function revokeCurrentSession(req: Request) {
  if (req.auth?.sessionId) await db.delete(authSessions).where(eq(authSessions.id, req.auth.sessionId));
}
