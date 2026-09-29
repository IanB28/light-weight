import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleLatestExercisePerformances, type PerformanceRow } from './latest-exercise-performances.js';

test('full-history head projection hydrates every qualifying set in selected session', () => {
  const base: PerformanceRow = {
    exerciseId: 'bench', sessionId: 'old-but-latest-for-exercise',
    startedAt: new Date('2026-01-01T10:00:00Z'), performedDate: '2026-01-01', recordedAt: null,
    setIndex: 1, weightKg: '40.00', reps: 12, rir: 4, rpe: null,
    setType: 'warmup', isWarmup: true, completed: true,
    machineProfileId: null, machineProfileLabel: null, machineBaseResistanceKg: null,
    machineBaseResistanceStatus: null, machineBaseSourceLabel: null, machineBaseSourceUrl: null,
    machineManufacturer: null, machineModel: null
  };
  const result = assembleLatestExercisePerformances([
    base,
    { ...base, setIndex: 2, weightKg: '80.00', reps: 8, rir: 2, setType: 'working', isWarmup: false },
    { ...base, setIndex: 3, weightKg: '70.00', reps: 10, rir: 1, setType: 'backoff', isWarmup: false }
  ]);
  assert.equal(result.bench.sessionId, base.sessionId);
  assert.deepEqual(result.bench.sets.map((set) => [set.setType, set.weightKg, set.reps]), [
    ['warmup', 40, 12], ['working', 80, 8], ['backoff', 70, 10]
  ]);
});
