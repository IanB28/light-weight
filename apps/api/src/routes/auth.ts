import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
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
import { authRateLimit, avatarUploadRateLimit, requireTrustedOrigin } from '../lib/request-security.js';
import { mapIdentityUniqueViolation, parseBirthDate } from '../lib/auth-validation.js';
import { authenticateIdentity, authenticateWithGoogle, registerIdentity } from '../lib/auth-service.js';
import { verifyGoogleCredential } from '../lib/google-auth.js';
import { identityRepository } from '../lib/identity-repository.js';
import { AVATAR_PATH_PREFIX, type AvatarStorage, vercelBlobAvatarStorage } from '../lib/avatar-storage.js';

const MAX_AVATAR_BYTES = 1_000_000;

export function isWebpAvatar(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

function safelyDeleteAvatar(storage: AvatarStorage, url: string) {
  return storage.delete(url).catch((error: unknown) => {
    console.warn('[AVATAR_CLEANUP_FAILED]', { name: error instanceof Error ? error.name : 'UnknownError' });
  });
}

export function createAuthRouter(storage: AvatarStorage = vercelBlobAvatarStorage): Router {
  const authRouter: Router = Router();

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
  // Avatar URLs are intentionally not accepted through the general profile
  // patch. The authenticated WebP upload route below is the single user
  // supplied avatar path; federated identity providers populate avatarUrl
  // server-side when accounts are created.
  try {
    const [updated] = await db.update(users).set(patch).where(eq(users.id, req.auth!.userId)).returning();
    if (!updated) throw new ApiError(404, 'USER_NOT_FOUND');
    res.json({ user: toAuthUser(updated) });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    mapIdentityUniqueViolation(error);
  }
}));

authRouter.put('/avatar', requireAuth, requireCsrf, requireTrustedOrigin, avatarUploadRateLimit,
  express.raw({ type: 'image/webp', limit: MAX_AVATAR_BYTES }),
  asyncRoute(async (req, res) => {
    if (!req.is('image/webp')) throw new ApiError(422, 'AVATAR_INVALID_TYPE');
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
      throw new ApiError(422, 'AVATAR_TOO_LARGE');
    }
    if (!isWebpAvatar(bytes)) throw new ApiError(422, 'AVATAR_INVALID_IMAGE');

    const pathname = `${AVATAR_PATH_PREFIX}${req.auth!.userId}/${randomUUID()}.webp`;
    let uploaded: { url: string };
    try {
      uploaded = await storage.put(pathname, bytes);
    } catch (error) {
      console.error('[AVATAR_UPLOAD_FAILED]', {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined
      });
      throw new ApiError(503, 'AVATAR_STORAGE_UNAVAILABLE');
    }

    const previousAvatarUrl = req.auth!.user.avatarUrl;
    let updated: typeof users.$inferSelect | undefined;
    try {
      [updated] = await db.update(users)
        .set({ avatarUrl: uploaded.url, updatedAt: new Date() })
        .where(eq(users.id, req.auth!.userId))
        .returning();
    } catch (error) {
      await safelyDeleteAvatar(storage, uploaded.url);
      throw error;
    }
    if (!updated) {
      await safelyDeleteAvatar(storage, uploaded.url);
      throw new ApiError(404, 'USER_NOT_FOUND');
    }
    if (previousAvatarUrl && storage.isOwnedAvatarUrl(previousAvatarUrl, req.auth!.userId)) {
      void safelyDeleteAvatar(storage, previousAvatarUrl);
    }
    res.json({ user: toAuthUser(updated) });
  })
);

return authRouter;
}

export const authRouter = createAuthRouter();
