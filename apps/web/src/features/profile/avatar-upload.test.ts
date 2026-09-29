import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarNormalizationError } from './avatar-normalization.js';
import { requestAvatarUpload } from './avatar-upload.js';

const endpoint = 'https://api.example.test/api/auth/avatar';
const webpBytes = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function normalized(blob: Blob) {
  return { blob, mimeType: blob.type as 'image/webp' | 'image/jpeg', extension: blob.type === 'image/jpeg' ? 'jpg' as const : 'webp' as const };
}

test('upload boundary rejects a mislabeled canvas fallback without sending a request', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let requests = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => { requests += 1; throw new Error('must not send'); } });
  try {
    await assert.rejects(() => requestAvatarUpload(normalized(new Blob(['PNG bytes'], { type: 'image/webp' })), endpoint),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
    await assert.rejects(() => requestAvatarUpload(normalized(new Blob([webpBytes], { type: 'image/jpeg' })), endpoint),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
    await assert.rejects(() => requestAvatarUpload(normalized(new Blob([jpegBytes], { type: 'image/webp' })), endpoint),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
    await assert.rejects(() => requestAvatarUpload({ blob: new Blob([webpBytes], { type: 'image/webp' }), mimeType: 'image/webp', extension: 'jpg' }, endpoint),
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
    const result = await requestAvatarUpload(normalized(avatar), endpoint);
    assert.equal(result.user.id, 'athlete');
    assert.equal(uploaded, avatar);
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});

test('CASE C: upload boundary sends validated JPEG bytes and image/jpeg', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get('content-type'), 'image/jpeg');
    assert.equal(init.credentials, 'include');
    assert.deepEqual(new Uint8Array(await (init.body as Blob).arrayBuffer()), jpegBytes);
    return Response.json({ user: { id: 'athlete' } });
  } });
  try {
    const avatar = normalized(new Blob([jpegBytes], { type: 'image/jpeg' }));
    assert.equal((await requestAvatarUpload(avatar, endpoint)).user.id, 'athlete');
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});
