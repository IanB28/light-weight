import test from 'node:test';
import assert from 'node:assert/strict';
import { isWebpSignature } from './avatar.js';

test('WebP identity requires RIFF and WEBP at their container offsets', () => {
  const valid = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
  assert.equal(isWebpSignature(valid), true);
  assert.equal(isWebpSignature(new TextEncoder().encode('RIFF\0\0\0\0PNG!')), false);
  assert.equal(isWebpSignature(valid.slice(0, 11)), false);
});
