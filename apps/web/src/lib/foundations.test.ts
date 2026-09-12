import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppPreferences, DEFAULT_APP_PREFERENCES } from './preferences.js';
import { mapApiError, mapHttpStatus } from './api-errors.js';
import { deriveExerciseUsage, rankExerciseDiscovery } from './exercise-discovery.js';
import type { Exercise, WorkoutSession } from '@light-weight/domain';

test('preference parser applies defaults and preserves valid partial settings', () => {
  assert.deepEqual(parseAppPreferences(null), DEFAULT_APP_PREFERENCES);
  const parsed = parseAppPreferences({ language: 'en', units: 'imperial', defaultRestSeconds: 120, availablePlatesKg: [20, -5, 20, 2.5] });
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.units, 'imperial');
  assert.equal(parsed.defaultRestSeconds, 120);
  assert.deepEqual(parsed.availablePlatesKg, [20, 2.5]);
  assert.equal(parseAppPreferences({}, 'en').language, 'en');
  assert.equal(parseAppPreferences({ defaultBarWeightKg: Number.NaN }).defaultBarWeightKg, 20);
});

test('API errors map to stable, non-technical codes', () => {
  assert.equal(mapHttpStatus(401).code, 'unauthorized');
  assert.equal(mapHttpStatus(403).code, 'forbidden');
  assert.equal(mapHttpStatus(404).code, 'not_found');
  assert.equal(mapHttpStatus(409).code, 'conflict');
  assert.equal(mapHttpStatus(422).code, 'validation');
  assert.equal(mapHttpStatus(429).code, 'rate_limited');
  assert.equal(mapHttpStatus(503).code, 'server');
  assert.equal(mapApiError(new TypeError('network details')).code, 'network');
  assert.equal(mapApiError(new DOMException('timeout', 'AbortError')).code, 'aborted');
});

test('exercise ranking counts sessions, favors frequency, and removes featured duplicates', () => {
  const exercises: Exercise[] = [
    { id: 'a', name: 'A', category: 'barbell', primaryMuscle: 'chest' },
    { id: 'b', name: 'B', category: 'barbell', primaryMuscle: 'chest' },
    { id: 'c', name: 'C', category: 'barbell', primaryMuscle: 'chest' }
  ];
  const set = { setIndex: 1, weightKg: 10, reps: 5, completed: true, isWarmup: false };
  const history: WorkoutSession[] = [
    { id: '1', userId: 'u', startedAt: '2026-01-01T00:00:00Z', sets: { a: [set], b: [set] } },
    { id: '2', userId: 'u', startedAt: '2026-02-01T00:00:00Z', sets: { a: [set] } }
  ];
  const usage = deriveExerciseUsage(history);
  assert.equal(usage.a.sessions, 2);
  assert.equal(usage.b.sessions, 1);
  const ranked = rankExerciseDiscovery(exercises, usage, 'chest');
  assert.equal(ranked.featured[0].id, 'a');
  assert.equal(new Set([...ranked.featured, ...ranked.remaining].map((exercise) => exercise.id)).size, 3);
});
