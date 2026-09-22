import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { db, replaceDatabaseForTesting } from '../db/index.js';
import { hashOpaqueToken } from '../lib/auth-session.js';
import { createAuthRouter } from './auth.js';
import type { AvatarStorage } from '../lib/avatar-storage.js';

const userId = '00000000-0000-4000-8000-000000000011';
const csrfToken = 'avatar-csrf-token';
const sessionToken = 'avatar-session-token';
const now = new Date('2026-09-22T00:00:00.000Z');
const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');

function user(avatarUrl: string | null = null) {
  return { id: userId, email: 'avatar@example.test', username: 'avatar', displayName: 'Avatar Athlete', birthDate: null, gender: null, avatarUrl, name: 'Avatar Athlete', createdAt: now, updatedAt: now };
}

function mockDatabase(updatedUser: ReturnType<typeof user>, failUpdate = false, currentAvatar: string | null = null) {
  return {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{
      session: { id: 'session-id', userId, csrfTokenHash: hashOpaqueToken(csrfToken), expiresAt: new Date(Date.now() + 60_000) },
      user: user(currentAvatar)
    }] }) }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => {
      if (failUpdate) throw new Error('database unavailable');
      return [updatedUser];
    } }) }) })
  };
}

async function withAvatarServer(storage: AvatarStorage, database: ReturnType<typeof mockDatabase>, run: (baseUrl: string) => Promise<void>) {
  const restore = replaceDatabaseForTesting(database as unknown as typeof db);
  const server = createApp({ authRouter: createAuthRouter(storage) }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    restore();
  }
}

function uploadHeaders(extra: Record<string, string> = {}) {
  return { cookie: `lw_session=${sessionToken}`, 'x-csrf-token': csrfToken, 'content-type': 'image/webp', ...extra };
}

test('avatar route requires auth and CSRF before it reaches storage', async () => {
  let writes = 0;
  const storage: AvatarStorage = { put: async () => { writes += 1; return { url: 'https://store.public.blob.vercel-storage.com/avatars/x/file.webp' }; }, delete: async () => {}, isOwnedAvatarUrl: () => false };
  await withAvatarServer(storage, mockDatabase(user('https://store.public.blob.vercel-storage.com/avatars/x/file.webp')), async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: webp });
    assert.equal(anonymous.status, 401);
    const noCsrf = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: { cookie: `lw_session=${sessionToken}`, 'content-type': 'image/webp' }, body: webp });
    assert.equal(noCsrf.status, 403);
    const untrusted = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders({ origin: 'https://untrusted.example' }), body: webp });
    assert.equal(untrusted.status, 403);
    assert.equal(writes, 0);
  });
});

test('avatar route validates normalized WebP bytes, returns canonical user, and cleans only an owned previous object', async () => {
  const paths: string[] = [];
  const deleted: string[] = [];
  const previous = `https://store.public.blob.vercel-storage.com/avatars/${userId}/old.webp`;
  const next = `https://store.public.blob.vercel-storage.com/avatars/${userId}/next.webp`;
  const storage: AvatarStorage = {
    put: async (pathname) => { paths.push(pathname); return { url: next }; },
    delete: async (url) => { deleted.push(url); },
    isOwnedAvatarUrl: (url, ownerId) => url === previous && ownerId === userId
  };
  await withAvatarServer(storage, mockDatabase(user(next), false, previous), async (baseUrl) => {
    const wrongMime = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: { ...uploadHeaders(), 'content-type': 'image/png' }, body: webp });
    assert.equal(wrongMime.status, 422);
    const spoofed = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: Buffer.from('not a WebP') });
    assert.equal(spoofed.status, 422);
    const oversized = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: Buffer.alloc(1_000_001) });
    assert.equal(oversized.status, 422);
    const response = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: webp });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { user: { avatarUrl?: string } }).user.avatarUrl, next);
    assert.match(paths[0] || '', new RegExp(`^avatars/${userId}/.+\\.webp$`));
    assert.deepEqual(deleted, [previous]);
  });
});

test('avatar storage failure leaves the database untouched and database failure cleans the new object', async () => {
  const failedStorage: AvatarStorage = { put: async () => { throw new Error('blob down'); }, delete: async () => {}, isOwnedAvatarUrl: () => false };
  await withAvatarServer(failedStorage, mockDatabase(user()), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: webp });
    assert.equal(response.status, 503);
  });

  const deleted: string[] = [];
  const storage: AvatarStorage = { put: async () => ({ url: `https://store.public.blob.vercel-storage.com/avatars/${userId}/new.webp` }), delete: async (url) => { deleted.push(url); }, isOwnedAvatarUrl: () => false };
  await withAvatarServer(storage, mockDatabase(user(), true), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: webp });
    assert.equal(response.status, 500);
    assert.equal(deleted.length, 1);
  });
});

test('avatar replacement never deletes an external profile image', async () => {
  const deleted: string[] = [];
  const external = 'https://lh3.googleusercontent.com/a/external-photo';
  const next = `https://store.public.blob.vercel-storage.com/avatars/${userId}/new.webp`;
  const storage: AvatarStorage = {
    put: async () => ({ url: next }),
    delete: async (url) => { deleted.push(url); },
    isOwnedAvatarUrl: () => false
  };
  await withAvatarServer(storage, mockDatabase(user(next), false, external), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers: uploadHeaders(), body: webp });
    assert.equal(response.status, 200);
    assert.deepEqual(deleted, []);
  });
});
