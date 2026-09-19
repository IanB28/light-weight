import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidRirValue,
  normalizeRirValue,
  isValidRpeValue,
  normalizeRpeValue,
  rirToRpe,
  rpeToRir,
  formatEffort
} from './effort.js';

test('isValidRirValue validates non-negative integers only', () => {
  // Valid non-negative integers
  assert.equal(isValidRirValue(0), true);
  assert.equal(isValidRirValue(1), true);
  assert.equal(isValidRirValue(2), true);
  assert.equal(isValidRirValue(5), true);
  assert.equal(isValidRirValue(6), true);
  assert.equal(isValidRirValue(8), true);
  assert.equal(isValidRirValue(10), true);

  // Invalid: negative
  assert.equal(isValidRirValue(-1), false);
  assert.equal(isValidRirValue(-2), false);

  // Invalid: floats / decimals
  assert.equal(isValidRirValue(1.5), false);
  assert.equal(isValidRirValue(0.5), false);

  // Invalid: non-finite
  assert.equal(isValidRirValue(NaN), false);
  assert.equal(isValidRirValue(Infinity), false);
  assert.equal(isValidRirValue(-Infinity), false);

  // Invalid: non-numbers
  assert.equal(isValidRirValue('2'), false);
  assert.equal(isValidRirValue(null), false);
  assert.equal(isValidRirValue(undefined), false);
  assert.equal(isValidRirValue({}), false);
});

test('normalizeRirValue returns valid integer or undefined', () => {
  assert.equal(normalizeRirValue(0), 0);
  assert.equal(normalizeRirValue(3), 3);
  assert.equal(normalizeRirValue(6), 6);
  assert.equal(normalizeRirValue(8), 8);

  assert.equal(normalizeRirValue(-1), undefined);
  assert.equal(normalizeRirValue(1.5), undefined);
  assert.equal(normalizeRirValue(NaN), undefined);
  assert.equal(normalizeRirValue(undefined), undefined);
  assert.equal(normalizeRirValue('3'), undefined);
});

test('isValidRpeValue validates numbers within 0..10 including decimals', () => {
  assert.equal(isValidRpeValue(0), true);
  assert.equal(isValidRpeValue(6), true);
  assert.equal(isValidRpeValue(7.5), true);
  assert.equal(isValidRpeValue(8), true);
  assert.equal(isValidRpeValue(9.5), true);
  assert.equal(isValidRpeValue(10), true);

  // Invalid: out of bounds
  assert.equal(isValidRpeValue(-1), false);
  assert.equal(isValidRpeValue(-0.5), false);
  assert.equal(isValidRpeValue(10.5), false);
  assert.equal(isValidRpeValue(15), false);

  // Invalid: non-finite
  assert.equal(isValidRpeValue(NaN), false);
  assert.equal(isValidRpeValue(Infinity), false);

  // Invalid: non-numbers
  assert.equal(isValidRpeValue('8'), false);
  assert.equal(isValidRpeValue(null), false);
  assert.equal(isValidRpeValue(undefined), false);
});

test('normalizeRpeValue returns valid number or undefined', () => {
  assert.equal(normalizeRpeValue(8), 8);
  assert.equal(normalizeRpeValue(7.5), 7.5);
  assert.equal(normalizeRpeValue(10), 10);

  assert.equal(normalizeRpeValue(10.5), undefined);
  assert.equal(normalizeRpeValue(-1), undefined);
  assert.equal(normalizeRpeValue(NaN), undefined);
  assert.equal(normalizeRpeValue(undefined), undefined);
});

test('rirToRpe and rpeToRir handle full 0..10 range symmetrically', () => {
  assert.equal(rirToRpe(0), 10);
  assert.equal(rirToRpe(1), 9);
  assert.equal(rirToRpe(2), 8);
  assert.equal(rirToRpe(3), 7);
  assert.equal(rirToRpe(4), 6);
  assert.equal(rirToRpe(5), 5);
  assert.equal(rirToRpe(6), 4);
  assert.equal(rirToRpe(10), 0);

  assert.equal(rpeToRir(10), 0);
  assert.equal(rpeToRir(9), 1);
  assert.equal(rpeToRir(8), 2);
  assert.equal(rpeToRir(7), 3);
  assert.equal(rpeToRir(6), 4);
  assert.equal(rpeToRir(5), 5);
  assert.equal(rpeToRir(4), 6);
  assert.equal(rpeToRir(0), 10);
});

test('formatEffort displays RIR, RIR 6+, @RPE, or — without inventing values', () => {
  assert.equal(formatEffort(0), 'RIR 0');
  assert.equal(formatEffort(1), 'RIR 1');
  assert.equal(formatEffort(2), 'RIR 2');
  assert.equal(formatEffort(5), 'RIR 5');
  assert.equal(formatEffort(6), 'RIR 6+');
  assert.equal(formatEffort(8), 'RIR 6+');

  // Fallback to RPE if RIR is missing or invalid
  assert.equal(formatEffort(undefined, 8), '@8');
  assert.equal(formatEffort(undefined, 9.5), '@9.5');
  assert.equal(formatEffort(-2, 8), '@8'); // invalid RIR ignored, uses RPE

  // Both missing or malformed -> —
  assert.equal(formatEffort(undefined, undefined), '—');
  assert.equal(formatEffort(-1, 15), '—');
  assert.equal(formatEffort(), '—');
});
