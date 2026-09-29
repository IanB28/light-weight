import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarFormatDetails, detectAvatarFormat, isJpegSignature, isWebpSignature } from './avatar.js';

test('WebP identity requires RIFF and WEBP at their container offsets', () => {
  const valid = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
  assert.equal(isWebpSignature(valid), true);
  assert.equal(isWebpSignature(new TextEncoder().encode('RIFF\0\0\0\0PNG!')), false);
  assert.equal(isWebpSignature(valid.slice(0, 11)), false);
});

test('JPEG identity and format details stay distinct from WebP', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(isJpegSignature(jpeg), true);
  assert.equal(detectAvatarFormat(jpeg), 'jpeg');
  assert.equal(detectAvatarFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.deepEqual(avatarFormatDetails('jpeg'), { mimeType: 'image/jpeg', extension: 'jpg' });
  assert.deepEqual(avatarFormatDetails('webp'), { mimeType: 'image/webp', extension: 'webp' });
});
