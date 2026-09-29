import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_MAX_OUTPUT_BYTES,
  AVATAR_MAX_SOURCE_BYTES,
  AvatarNormalizationError,
  avatarCenterCrop,
  normalizeAvatarFile,
  validateAvatarInputFile,
  validateAvatarSource,
  validateNormalizedAvatarBlob
} from './avatar-normalization.js';

const webpBytes = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const sourceFile = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', { type: 'image/png' });

function mockBrowserEncoder(output: Blob | Partial<Record<'image/webp' | 'image/jpeg', Blob>>, bitmapFails = false, imageFails = false) {
  const globalNames = ['createImageBitmap', 'document', 'Image'] as const;
  const originals = globalNames.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const originalCreateUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const state = { requestedMimes: [] as string[], bitmapClosed: 0, imageLoads: 0, urlRevocations: 0 };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback: (blob: Blob | null) => void, mime: string) => {
      state.requestedMimes.push(mime);
      callback(output instanceof Blob ? output : output[mime as 'image/webp' | 'image/jpeg'] ?? null);
    }
  };
  class MockImage {
    naturalWidth = 640;
    naturalHeight = 480;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) {
      state.imageLoads += 1;
      queueMicrotask(() => imageFails ? this.onerror?.() : this.onload?.());
    }
  }
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      if (bitmapFails) throw new Error('bitmap decode unavailable');
      return { width: 640, height: 480, close: () => { state.bitmapClosed += 1; } };
    }
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:avatar-test' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => { state.urlRevocations += 1; } });
  return {
    state,
    restore: () => {
      globalNames.forEach((name, index) => {
        if (originals[index]) Object.defineProperty(globalThis, name, originals[index]);
        else Reflect.deleteProperty(globalThis, name);
      });
      if (originalCreateUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateUrl);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevokeUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeUrl);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  };
}

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
  assert.equal(validateAvatarSource({ type: 'image/jpeg', size: 0 }), 'source_empty');
});

test('mobile files without MIME need supported bytes, while HEIC stays unsupported', async () => {
  const untypedJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'photo', { type: '' });
  await validateAvatarInputFile(untypedJpeg);
  await assert.rejects(() => validateAvatarInputFile(new File(['unknown'], 'photo', { type: '' })),
    (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'unsupported_type');
  await assert.rejects(() => validateAvatarInputFile(new File(['heic'], 'photo.heic', { type: 'image/heic' })),
    (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'unsupported_type');
});

test('CASE A: generated WebP MIME and bytes pass client validation', async () => {
  const blob = new Blob([webpBytes], { type: 'image/webp' });
  assert.deepEqual(await validateNormalizedAvatarBlob(blob), { blob, mimeType: 'image/webp', extension: 'webp' });
  const browser = mockBrowserEncoder(blob);
  try {
    assert.equal((await normalizeAvatarFile(sourceFile())).mimeType, 'image/webp');
    assert.deepEqual(browser.state.requestedMimes, ['image/webp']);
  } finally { browser.restore(); }
});

test('CASE B: Safari-style PNG fallback causes an explicit JPEG encode on the same canvas', async () => {
  const browser = mockBrowserEncoder({
    'image/webp': new Blob(['png fallback'], { type: 'image/png' }),
    'image/jpeg': new Blob([jpegBytes], { type: 'image/jpeg' })
  });
  try {
    const normalized = await normalizeAvatarFile(sourceFile());
    assert.equal(normalized.mimeType, 'image/jpeg');
    assert.equal(normalized.extension, 'jpg');
    assert.deepEqual(browser.state.requestedMimes, ['image/webp', 'image/jpeg']);
    assert.equal(browser.state.bitmapClosed, 1);
  } finally { browser.restore(); }
});

test('unsupported output from both encoders is not accepted as PNG', async () => {
  const browser = mockBrowserEncoder(new Blob(['png fallback'], { type: 'image/png' }));
  try {
    await assert.rejects(() => normalizeAvatarFile(sourceFile()),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'output_format_unsupported');
    assert.deepEqual(browser.state.requestedMimes, ['image/webp', 'image/jpeg']);
  } finally { browser.restore(); }
});

test('CASE C: empty or spoofed generated WebP is rejected locally', async () => {
  await assert.rejects(() => validateNormalizedAvatarBlob(new Blob([], { type: 'image/webp' })),
    (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
  await assert.rejects(() => validateNormalizedAvatarBlob(new Blob(['not webp'], { type: 'image/webp' })),
    (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
});

test('CASE I: both normalized formats retain the one-megabyte limit', async () => {
  for (const type of ['image/webp', 'image/jpeg']) {
    const oversized = new Blob([new Uint8Array(AVATAR_MAX_OUTPUT_BYTES + 1)], { type });
    await assert.rejects(() => validateNormalizedAvatarBlob(oversized),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'output_too_large');
  }
});

test('CASE E: failed createImageBitmap falls back to <img>, then releases its object URL', async () => {
  const browser = mockBrowserEncoder(new Blob([webpBytes], { type: 'image/webp' }), true);
  try {
    const result = await normalizeAvatarFile(sourceFile());
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(browser.state.imageLoads, 1);
    assert.equal(browser.state.urlRevocations, 1);
  } finally { browser.restore(); }
});

test('CASE E: both decode paths failing gives one normalization error and no leaked URL', async () => {
  const browser = mockBrowserEncoder(new Blob([webpBytes], { type: 'image/webp' }), true, true);
  try {
    await assert.rejects(() => normalizeAvatarFile(sourceFile()),
      (error: unknown) => error instanceof AvatarNormalizationError && error.code === 'normalization_failed');
    assert.equal(browser.state.imageLoads, 1);
    assert.equal(browser.state.urlRevocations, 1);
  } finally { browser.restore(); }
});
