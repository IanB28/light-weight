import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_MAX_SOURCE_BYTES,
  avatarCenterCrop,
  validateAvatarSource
} from './avatar-normalization.js';

test('avatar source validation accepts JPEG, PNG and WebP only', () => {
  assert.equal(validateAvatarSource({ type: 'image/jpeg', size: 100 }), null);
  assert.equal(validateAvatarSource({ type: 'image/png', size: 100 }), null);
  assert.equal(validateAvatarSource({ type: 'image/webp', size: 100 }), null);
  assert.equal(validateAvatarSource({ type: 'image/gif', size: 100 }), 'unsupported_type');
});

test('avatar normalization uses a centered square crop and 512px output geometry', () => {
  assert.deepEqual(avatarCenterCrop(1200, 800), { sourceX: 200, sourceY: 0, sourceSize: 800, outputSize: 512 });
  assert.deepEqual(avatarCenterCrop(800, 1200), { sourceX: 0, sourceY: 200, sourceSize: 800, outputSize: 512 });
});

test('avatar source validation rejects originals larger than five megabytes before normalization', () => {
  assert.equal(validateAvatarSource({ type: 'image/jpeg', size: AVATAR_MAX_SOURCE_BYTES + 1 }), 'source_too_large');
});
