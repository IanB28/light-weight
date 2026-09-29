import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarNormalizationError } from './avatar-normalization.js';
import { requestAvatarUpload } from './avatar-upload.js';

const endpoint = 'https://api.example.test/api/auth/avatar';
const webpBytes = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

test('upload boundary rejects a mislabeled canvas fallback without sending a request', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let requests = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => { requests += 1; throw new Error('must not send'); } });
  try {
    await assert.rejects(() => requestAvatarUpload(new Blob(['PNG bytes'], { type: 'image/webp' }), endpoint),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
    assert.equal(requests, 0);
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});

test('upload boundary sends validated WebP bytes with credentials and matching MIME', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let uploaded: Blob | undefined;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url: string, init: RequestInit) => {
    assert.equal(url, endpoint);
    assert.equal(init.method, 'PUT');
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).get('content-type'), 'image/webp');
    uploaded = init.body as Blob;
    return Response.json({ user: { id: 'athlete' } });
  } });
  try {
    const avatar = new Blob([webpBytes], { type: 'image/webp' });
    const result = await requestAvatarUpload(avatar, endpoint);
    assert.equal(result.user.id, 'athlete');
    assert.equal(uploaded, avatar);
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});
