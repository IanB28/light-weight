import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isOwnedAvatarPath, vercelBlobAvatarStorage } from './avatar-storage.js';
import { isWebpAvatar } from '../routes/auth.js';

const userId = '123e4567-e89b-12d3-a456-426614174000';

test('avatar storage cleanup recognizes only a user-scoped LightWeight avatar path', () => {
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/${userId}/random.webp`, userId), true);
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/${userId}/random.jpg`, userId), true);
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/another-user/random.jpg`, userId), false);
  assert.equal(isOwnedAvatarPath(`https://lh3.googleusercontent.com/avatars/${userId}/photo.jpg`, userId), false);
  assert.equal(isOwnedAvatarPath(`https://lh3.googleusercontent.com/avatars/${userId}/photo.webp`, userId), false);
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/another-user/random.webp`, userId), false);
  assert.equal(isOwnedAvatarPath('https://example.com/photo.png', userId), false);
});

test('avatar upload validates WebP magic bytes instead of trusting the header', () => {
  const valid = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');
  assert.equal(isWebpAvatar(valid), true);
  assert.equal(isWebpAvatar(Buffer.from('not-a-webp')), false);
});

test('Vercel Blob SDK preserves binary public put and URL delete semantics', async () => {
  const pathname = `avatars/${userId}/sdk.webp`;
  const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
  const bytes = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');
  const requests: Array<{ method: string; path: string; headers: Record<string, string | string[] | undefined>; body: Buffer }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ method: request.method || '', path: request.url || '', headers: request.headers, body: Buffer.concat(chunks) });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.method === 'PUT'
      ? { url, pathname, contentType: 'image/webp', contentDisposition: 'inline', downloadUrl: `${url}?download=1`, etag: '"test"' }
      : {}));
  });
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  const previousApiUrl = process.env.VERCEL_BLOB_API_URL;
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_fake';
    process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    assert.deepEqual(await vercelBlobAvatarStorage.put(pathname, bytes, 'image/webp'), { url });
    await vercelBlobAvatarStorage.delete(url);

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.method, 'PUT');
    assert.equal(new URL(requests[0]!.path, 'http://localhost').searchParams.get('pathname'), pathname);
    assert.equal(requests[0]?.headers['x-vercel-blob-access'], 'public');
    assert.equal(requests[0]?.headers['x-add-random-suffix'], '0');
    assert.equal(requests[0]?.headers['x-content-type'], 'image/webp');
    assert.deepEqual(requests[0]?.body, bytes);
    assert.equal(requests[1]?.method, 'POST');
    assert.equal(requests[1]?.path, '/delete');
    assert.deepEqual(JSON.parse(requests[1]!.body.toString()), { urls: [url] });
  } finally {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    if (previousApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = previousApiUrl;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
