import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustRestEnd,
  restSecondsRemaining,
  workoutElapsedSeconds,
  workoutStartFromLegacySeconds
} from './workout-time.js';

test('workout elapsed time is derived from its start timestamp', () => {
  assert.equal(workoutElapsedSeconds('2026-09-13T10:00:00.000Z', Date.parse('2026-09-13T10:03:42.900Z')), 222);
  assert.equal(workoutElapsedSeconds('invalid', Date.now()), 0);
  assert.equal(workoutElapsedSeconds('2026-09-13T10:00:00.000Z', Date.parse('2026-09-13T09:59:00.000Z')), 0);
  assert.equal(workoutStartFromLegacySeconds(90, Date.parse('2026-09-13T10:00:00.000Z')), '2026-09-13T09:58:30.000Z');
});

test('rest time remains exact after throttling or background time', () => {
  const now = 1_000_000;
  const restEndsAt = now + 90_000;
  assert.equal(restSecondsRemaining(restEndsAt, now), 90);
  assert.equal(restSecondsRemaining(restEndsAt, now + 31_200), 59);
  assert.equal(restSecondsRemaining(restEndsAt, now + 95_000), 0);
  assert.equal(adjustRestEnd(restEndsAt, 30, now), restEndsAt + 30_000);
  assert.equal(adjustRestEnd(restEndsAt, -120, now), null);
});
