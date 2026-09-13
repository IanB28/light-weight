import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProgressSummary } from './stats-selectors.js';

test('stats progress summary counts effective work but not warmups as a personal record', () => {
  const history = [{ id: 'session-1', userId: 'user', routineName: 'Test', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), sets: { bench: [
    { setIndex: 1, weightKg: 120, reps: 1, completed: true, isWarmup: true, setType: 'warmup' as const },
    { setIndex: 2, weightKg: 100, reps: 5, completed: true, isWarmup: false, setType: 'working' as const }
  ] } }];
  const summary = selectProgressSummary(history, { bench: { id: 'bench', name: 'Bench press', category: 'barbell', primaryMuscle: 'chest' } });
  assert.equal(summary.sessions, 1);
  assert.equal(summary.bestExerciseName, 'Bench press');
  assert.ok(summary.bestEstimatedOneRm < 120);
});
