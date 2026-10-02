import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCanonicalStrengthProjection,
  projectPublicStrength,
  projectPublicFeaturedPrLoad,
  selectCanonicalPersonalRecordsByExercise
} from './index.js';
import type { Exercise, WorkoutSession } from './types.js';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest'
};

function session(id: string, startedAt: string, weightKg: number, reps: number): WorkoutSession {
  return {
    id,
    userId: 'user',
    startedAt,
    sets: { bench: [{ setIndex: 1, weightKg, reps, completed: true, setType: 'working' }] }
  };
}

test('canonical strength projection preserves full-history score, 1RM and date tie-break semantics', () => {
  const history = [
    session('old-strong', '2024-01-01T10:00:00.000Z', 100, 8),
    session('new-weak', '2026-01-01T10:00:00.000Z', 60, 5)
  ];
  const bodyweightEntries = [{ date: '2023-12-31', timestamp: 0, weightKg: 80 }];
  const projection = resolveCanonicalStrengthProjection(history, { bench }, {
    gender: 'male',
    bodyweightEntries
  });

  assert.equal(projection.byExercise.bench.performedAt, '2024-01-01T10:00:00.000Z');
  assert.equal(projection.byMuscle.chest?.exerciseId, 'bench');
  assert.equal(projection.overall?.rank, projection.byExercise.bench.evaluation.rank);
  assert.ok(projection.byExercise.bench.evaluation.strengthScore > 1);
});

test('public strength projection exposes aggregate results and rank-only muscle entries', () => {
  const projection = resolveCanonicalStrengthProjection([
    session('old-strong', '2024-01-01T10:00:00.000Z', 100, 8)
  ], { bench }, {
    gender: 'male',
    bodyweightEntries: [{ date: '2023-12-31', timestamp: 0, weightKg: 80 }]
  });

  const publicProjection = projectPublicStrength(projection, 'male');
  assert.equal(publicProjection.anatomy, 'male');
  assert.equal(publicProjection.muscleRanks.chest, projection.byMuscle.chest?.evaluation.rank);
  assert.equal(publicProjection.overall?.rank, projection.overall?.rank);
  assert.equal(typeof publicProjection.muscleRanks.chest, 'string');

  const serialized = JSON.stringify(publicProjection.muscleRanks);
  for (const privateField of [
    'strengthScore', 'currentRatio', 'oneRmKg', 'bodyweightKg', 'targetRatio',
    'targetOneRmKg', 'kgToNextRank', 'progressPctToNextRank', 'exerciseId',
    'exerciseName', 'performedAt'
  ]) {
    assert.ok(!serialized.includes(privateField), `${privateField} must not cross the social projection boundary`);
  }
});

test('public featured load projection preserves presentation semantics without effective bodyweight load', () => {
  const exercise = (loadMode: 'total' | 'added_weight' | 'assisted', bodyweightFactor?: number): Exercise => ({
    ...bench,
    loading: {
      mechanism: loadMode === 'total' ? 'barbell' : 'bodyweight',
      loadMode,
      supportsKeyboard: true,
      supportsPlates: loadMode === 'total',
      supportsExternalLoad: true,
      includeBarWeight: loadMode === 'total',
      ...(bodyweightFactor ? { bodyweightFactor } : {})
    }
  });

  assert.deepEqual(projectPublicFeaturedPrLoad(exercise('total'), 100), { type: 'weight', weightKg: 100, loadMode: 'total' });
  assert.deepEqual(projectPublicFeaturedPrLoad(exercise('added_weight', 1), 0), { type: 'bodyweight' });
  assert.deepEqual(projectPublicFeaturedPrLoad(exercise('added_weight', 1), 20), { type: 'added_weight', weightKg: 20 });
  assert.deepEqual(projectPublicFeaturedPrLoad(exercise('assisted', 1), 30), { type: 'assisted', weightKg: 30 });
});

test('canonical default personal records retain the current highest-1RM-per-exercise behavior', () => {
  const records = selectCanonicalPersonalRecordsByExercise([
    session('heavy', '2024-01-01T10:00:00.000Z', 100, 5),
    session('lighter', '2025-01-01T10:00:00.000Z', 80, 5)
  ], {
    exercisesById: { bench },
    bodyweightEntries: [{ date: '2023-12-31', timestamp: 0, weightKg: 80 }]
  });

  assert.equal(records.bench.weightKg, 100);
  assert.equal(records.bench.reps, 5);
  assert.equal(records.bench.date, '2024-01-01T10:00:00.000Z');
});
