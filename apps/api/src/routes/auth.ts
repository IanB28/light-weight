import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import {
  isValidUsername,
  normalizeUsername,
  type UserGender
} from '@light-weight/domain';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import {
  clearSessionCookies,
  createAuthSession,
  ensureCurrentCsrfToken,
  requireAuth,
  requireCsrf,
  revokeCurrentSession,
  setSessionCookies,
  toAuthUser
} from '../lib/auth-session.js';
import { authRateLimit, requireTrustedOrigin } from '../lib/request-security.js';
import { mapIdentityUniqueViolation, parseBirthDate } from '../lib/auth-validation.js';
import { authenticateIdentity, authenticateWithGoogle, registerIdentity } from '../lib/auth-service.js';
import { verifyGoogleCredential } from '../lib/google-auth.js';
import { identityRepository } from '../lib/identity-repository.js';

export const authRouter: Router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length > maxLength) throw new ApiError(422, 'VALIDATION_ERROR');
  return value;
}

authRouter.post('/register', requireTrustedOrigin, authRateLimit, asyncRoute(async (req, res) => {
  const created = await registerIdentity(identityRepository, req.body);
  const tokens = await createAuthSession(created.id);
  setSessionCookies(res, tokens.sessionToken, tokens.csrfToken);
  res.status(201).json({ user: toAuthUser(created), csrfToken: tokens.csrfToken });
}));

authRouter.post('/login', requireTrustedOrigin, authRateLimit, asyncRoute(async (req, res) => {
  const user = await authenticateIdentity(identityRepository, req.body);
  const tokens = await createAuthSession(user.id);
  setSessionCookies(res, tokens.sessionToken, tokens.csrfToken);
  res.json({ user: toAuthUser(user), csrfToken: tokens.csrfToken });
}));

authRouter.post('/google', requireTrustedOrigin, authRateLimit, asyncRoute(async (req, res) => {
  if (!isRecord(req.body) || typeof req.body.credential !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR');
  }
  const profile = await verifyGoogleCredential(req.body.credential);
  const user = await authenticateWithGoogle(identityRepository, profile);
  const tokens = await createAuthSession(user.id);
  setSessionCookies(res, tokens.sessionToken, tokens.csrfToken);
  res.json({ user: toAuthUser(user), csrfToken: tokens.csrfToken });
}));


authRouter.get('/me', requireAuth, asyncRoute(async (req, res) => {
  res.json({ user: req.auth!.user, csrfToken: await ensureCurrentCsrfToken(req, res) });
}));

authRouter.post('/logout', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  await revokeCurrentSession(req);
  clearSessionCookies(res);
  res.status(204).end();
}));

authRouter.get('/profile', requireAuth, asyncRoute(async (req, res) => {
  res.json({ user: req.auth!.user });
}));

authRouter.patch('/profile', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  if (!isRecord(req.body)) throw new ApiError(422, 'VALIDATION_ERROR');
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if ('displayName' in req.body) {
    const displayName = stringField(req.body, 'displayName', 100).trim();
    if (!displayName) throw new ApiError(422, 'VALIDATION_ERROR');
    patch.displayName = displayName;
    patch.name = displayName;
  }
  if ('username' in req.body) {
    const username = normalizeUsername(stringField(req.body, 'username', 30));
    if (!isValidUsername(username)) throw new ApiError(422, 'INVALID_USERNAME');
    const [collision] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.username, username), ne(users.id, req.auth!.userId))).limit(1);
    if (collision) throw new ApiError(409, 'USERNAME_ALREADY_EXISTS');
    patch.username = username;
  }
  if ('birthDate' in req.body) {
    patch.birthDate = parseBirthDate(req.body.birthDate);
  }
  if ('gender' in req.body) {
    const gender = req.body.gender;
    if (gender !== null && gender !== 'male' && gender !== 'female') throw new ApiError(422, 'VALIDATION_ERROR');
    patch.gender = gender as UserGender | null;
  }
  if ('avatarUrl' in req.body) {
    const avatarUrl = req.body.avatarUrl;
    if (avatarUrl !== null && typeof avatarUrl !== 'string') throw new ApiError(422, 'VALIDATION_ERROR');
    if (typeof avatarUrl === 'string') {
      if (avatarUrl.length > 2_048) throw new ApiError(422, 'VALIDATION_ERROR');
      try {
        const parsed = new URL(avatarUrl);
        if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) throw new Error('invalid protocol');
      } catch { throw new ApiError(422, 'VALIDATION_ERROR'); }
    }
    patch.avatarUrl = avatarUrl?.trim() || null;
  }
  try {
    const [updated] = await db.update(users).set(patch).where(eq(users.id, req.auth!.userId)).returning();
    if (!updated) throw new ApiError(404, 'USER_NOT_FOUND');
    res.json({ user: toAuthUser(updated) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    mapIdentityUniqueViolation(error);
  }
}));
