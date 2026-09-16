import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkoutHistoryIndex } from './workout-history-index.js';
import type { Exercise, WorkoutSession } from '@light-weight/domain';

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

test('history index supports weighted and assisted bodyweight load correctness with historical BW', () => {
  const pullUpExercise: Exercise = {
    id: 'pull-up',
    name: 'Pull-up',
    category: 'bodyweight',
    primaryMuscle: 'back',
    loading: {
      loadMode: 'added_weight',
      bodyweightFactor: 1,
      mechanism: 'bodyweight',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };
  const assistedPullUpExercise: Exercise = {
    id: 'assisted-pull-up',
    name: 'Assisted Pull-up',
    category: 'machine',
    primaryMuscle: 'back',
    loading: {
      loadMode: 'assisted',
      bodyweightFactor: 1,
      mechanism: 'selectorized',
      supportsKeyboard: true,
      supportsPlates: false,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };

  const bodyweightHistory: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'user',
      startedAt: '2026-08-01T10:00:00.000Z',
      sets: {
        'pull-up': [
          { setIndex: 1, weightKg: 0, reps: 10, completed: true, setType: 'working' }
        ]
      }
    },
    {
      id: 's2',
      userId: 'user',
      startedAt: '2026-08-15T10:00:00.000Z',
      sets: {
        'pull-up': [
          { setIndex: 1, weightKg: 20, reps: 5, completed: true, setType: 'working' }
        ],
        'assisted-pull-up': [
          { setIndex: 1, weightKg: 15, reps: 8, completed: true, setType: 'working' }
        ]
      }
    }
  ];

  const bodyweightEntries = [
    { date: '2026-07-20', weightKg: 70 },
    { date: '2026-08-10', weightKg: 72 }
  ];

  const exercisesById = {
    'pull-up': pullUpExercise,
    'assisted-pull-up': assistedPullUpExercise
  };

  const index = buildWorkoutHistoryIndex(bodyweightHistory, { exercisesById, bodyweightEntries });

  // S2 pull-up PR: external load is 20 kg, but est1Rm uses effective load (72 + 20 = 92 kg for 5 reps)
  const pullUpPr = index.personalRecordsByExercise['pull-up'];
  assert.ok(pullUpPr);
  assert.equal(pullUpPr.weightKg, 20); // External load preserved!
  assert.equal(pullUpPr.reps, 5);
  // 92 * (1 + 5/30) = 107.33 kg
  assert.ok(pullUpPr.est1Rm > 100);

  // Assisted pull-up PR: external load is 15 kg (assistance), est1Rm uses effective load (72 - 15 = 57 kg for 8 reps)
  const assistedPr = index.personalRecordsByExercise['assisted-pull-up'];
  assert.ok(assistedPr);
  assert.equal(assistedPr.weightKg, 15); // External assistance preserved!
  assert.equal(assistedPr.reps, 8);
  // 57 * (1 + 8/30) = 72.2 kg
  assert.ok(assistedPr.est1Rm > 65 && assistedPr.est1Rm < 80);

  // Performance summaries format with correct prefixes
  assert.equal(index.latestPerformanceByExercise['pull-up'].summary, '+20 kg × 5');
  assert.equal(index.latestPerformanceByExercise['assisted-pull-up'].summary, '-15 kg × 8');
});
