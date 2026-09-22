import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedAvatarPath } from './avatar-storage.js';
import { isWebpAvatar } from '../routes/auth.js';

const userId = '123e4567-e89b-12d3-a456-426614174000';

test('avatar storage cleanup recognizes only a user-scoped LightWeight avatar path', () => {
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/${userId}/random.webp`, userId), true);
  assert.equal(isOwnedAvatarPath(`https://lh3.googleusercontent.com/avatars/${userId}/photo.webp`, userId), false);
  assert.equal(isOwnedAvatarPath(`https://store.public.blob.vercel-storage.com/avatars/another-user/random.webp`, userId), false);
  assert.equal(isOwnedAvatarPath('https://example.com/photo.png', userId), false);
});

test('avatar upload validates WebP magic bytes instead of trusting the header', () => {
  const valid = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');
  assert.equal(isWebpAvatar(valid), true);
  assert.equal(isWebpAvatar(Buffer.from('not-a-webp')), false);
});
