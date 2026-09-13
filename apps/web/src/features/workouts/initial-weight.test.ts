import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialWeightKg } from './initial-weight.js';

test('previous valid performance wins over a semantic fallback', () => {
  assert.equal(resolveInitialWeightKg(82.5, 0), 82.5);
  assert.equal(resolveInitialWeightKg(undefined, 0), 0);
});
