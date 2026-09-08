import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEpley, calculateBrzycki, estimateOneRm } from './onerm.js';
import { calculateVolume, checkProgressionTarget } from './progression.js';
import type { LoggedSet } from './types.js';

test('1RM estimation formulas', () => {
  // 1 rep of 100kg should always be 100kg 1RM
  assert.equal(calculateEpley(100, 1), 100);
  assert.equal(calculateBrzycki(100, 1), 100);

  // 100kg for 10 reps
  // Epley: 100 * (1 + 10/30) = 133.3
  assert.equal(calculateEpley(100, 10), 133.3);
  // Brzycki: 100 * (36 / 27) = 133.3
  assert.equal(calculateBrzycki(100, 10), 133.3);

  const estimate = estimateOneRm(100, 10);
  assert.equal(estimate.average, 133.3);
});

test('volume calculation', () => {
  const sets: LoggedSet[] = [
    { setIndex: 1, weightKg: 100, reps: 5, completed: true, isWarmup: false },
    { setIndex: 2, weightKg: 100, reps: 5, completed: true, isWarmup: false },
    { setIndex: 3, weightKg: 60, reps: 10, completed: true, isWarmup: true }, // warmup should be ignored
    { setIndex: 4, weightKg: 100, reps: 5, completed: false, isWarmup: false } // failed set ignored
  ];

  assert.equal(calculateVolume(sets), 1000);
});

test('double progression threshold check', () => {
  const successfulSets: LoggedSet[] = [
    { setIndex: 1, weightKg: 80, reps: 12, completed: true, isWarmup: false },
    { setIndex: 2, weightKg: 80, reps: 12, completed: true, isWarmup: false },
    { setIndex: 3, weightKg: 80, reps: 12, completed: true, isWarmup: false }
  ];

  assert.equal(checkProgressionTarget(successfulSets, 3, 12), true);

  const incompleteSets: LoggedSet[] = [
    { setIndex: 1, weightKg: 80, reps: 12, completed: true, isWarmup: false },
    { setIndex: 2, weightKg: 80, reps: 10, completed: true, isWarmup: false }
  ];

  assert.equal(checkProgressionTarget(incompleteSets, 3, 12), false);
});
