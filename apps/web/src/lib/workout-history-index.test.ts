import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkoutHistoryIndex } from './workout-history-index.js';
import type { WorkoutSession } from '@light-weight/domain';

const history: WorkoutSession[] = [
  {
    id: 'older', userId: 'user', startedAt: '2026-09-01T08:00:00.000Z',
    sets: {
      bench: [
        { setIndex: 1, weightKg: 20, reps: 10, completed: true, setType: 'warmup', isWarmup: true },
        { setIndex: 2, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }
      ]
    }
  },
  {
    id: 'newer', userId: 'user', startedAt: '2026-09-03T08:00:00.000Z',
    sets: {
      bench: [{ setIndex: 1, weightKg: 75, reps: 10, completed: true, setType: 'drop', isWarmup: false }],
      row: [{ setIndex: 1, weightKg: 60, reps: 10, completed: true, setType: 'backoff', isWarmup: false }]
    }
  }
];

test('history index derives O(1) latest performance and personal records', () => {
  const index = buildWorkoutHistoryIndex(history);
  assert.equal(index.sessionsByExercise.bench.length, 2);
  assert.equal(index.sessionsByDate['2026-09-03'].length, 1);
  assert.equal(index.latestPerformanceByExercise.bench.lastDate, '2026-09-03T08:00:00.000Z');
  assert.equal(index.latestPerformanceByExercise.bench.sets[0].setType, 'drop');
  assert.equal(index.personalRecordsByExercise.bench.weightKg, 80);
  assert.equal(index.personalRecordsByExercise.row.weightKg, 60);
});
