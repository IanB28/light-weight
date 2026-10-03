import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mapDatasetExerciseToDomain, type Exercise, type RawDatasetExercise } from '@light-weight/domain';
import { matchesExerciseFilters, normalizeExerciseSearch } from './exercise-filters.js';
import { rankExerciseDiscovery } from './exercise-discovery.js';

const require = createRequire(import.meta.url);
const { EXDB } = require('../../src/lib/exercises-data.js') as { EXDB: RawDatasetExercise[] };
const catalog = EXDB.map(mapDatasetExerciseToDomain);
const find = (query: string, muscle: Parameters<typeof matchesExerciseFilters>[2] = 'all', equipment: Parameters<typeof matchesExerciseFilters>[3] = 'all') =>
  catalog.filter((exercise) => matchesExerciseFilters(exercise, normalizeExerciseSearch(query), muscle, equipment));

test('primary muscle is mandatory; secondary involvement cannot leak through facet or query', () => {
  const pullUp = catalog.find((exercise) => exercise.id === 'ex-0652');
  assert.ok(pullUp);
  assert.equal(pullUp.primaryMuscle, 'back');
  assert.ok(pullUp.secondaryMuscles?.includes('biceps'));
  assert.equal(matchesExerciseFilters(pullUp, '', 'biceps', 'all'), false);
  assert.equal(matchesExerciseFilters(pullUp, 'biceps', 'all', 'all'), false);
  assert.ok(!find('', 'biceps').some((exercise) => exercise.id === 'ex-0652'));
  assert.ok(find('', 'biceps').every((exercise) => exercise.primaryMuscle === 'biceps'));
});

test('ES/EN muscle intents constrain the canonical primary target', () => {
  const aliases = [
    ['biceps', 'biceps'], ['bíceps', 'biceps'], ['triceps', 'triceps'],
    ['pecho', 'chest'], ['chest', 'chest'], ['espalda', 'back'], ['back', 'back'],
    ['hombros', 'shoulders'], ['shoulders', 'shoulders'],
    ['cuádriceps', 'quadriceps'], ['quadriceps', 'quadriceps'],
    ['hamstrings', 'hamstrings'], ['femoral', 'hamstrings'],
    ['glúteos', 'glutes'], ['glutes', 'glutes'], ['gemelos', 'calves'],
    ['calves', 'calves'], ['antebrazos', 'forearms'], ['forearms', 'forearms'],
    ['core', 'core'], ['abs', 'core']
  ] as const;
  for (const [alias, expected] of aliases) {
    const results = find(alias);
    assert.ok(results.length > 0, alias);
    assert.ok(results.every((exercise) => exercise.primaryMuscle === expected), alias);
  }
});

test('all equipment facets are exact on real EXDB; no cross-category leakage', () => {
  for (const category of ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const) {
    const results = find('', 'all', category);
    assert.ok(results.length > 0, category);
    assert.ok(results.every((exercise) => exercise.category === category), category);
  }
  const examples = [
    ['barbell', 'ex-0046'], ['bodyweight', 'ex-0652'],
    ['machine', 'ex-0743'], ['cable', 'ex-0007']
  ] as const;
  for (const [category, id] of examples) assert.ok(find('', 'all', category).some((exercise) => exercise.id === id));
  assert.ok(find('', 'all', 'dumbbell').some((exercise) => exercise.name.toLowerCase().includes('dumbbell')));
  assert.ok(find('', 'all', 'other').some((exercise) => exercise.category === 'other'));
});

test('muscle, equipment and search compose with AND, including custom exercises', () => {
  const results = find('incline', 'chest', 'dumbbell');
  assert.ok(results.length > 0);
  assert.ok(results.every((exercise) => exercise.primaryMuscle === 'chest' && exercise.category === 'dumbbell' && exercise.name.toLowerCase().includes('incline')));
  const custom: Exercise = { id: 'custom-1', name: 'Biceps Curl', primaryMuscle: 'back', secondaryMuscles: ['biceps'], category: 'dumbbell', isCustom: true };
  assert.equal(matchesExerciseFilters(custom, 'biceps', 'all', 'dumbbell'), false);
  assert.equal(matchesExerciseFilters(custom, 'curl', 'back', 'dumbbell'), true);
  assert.equal(matchesExerciseFilters(custom, 'curl', 'back', 'machine'), false);
});

test('generic names remain searchable; ranking only receives strict candidates', () => {
  for (const query of ['bench', 'curl', 'squat', 'row']) assert.ok(find(query).length > 0, query);
  const candidates = find('', 'biceps', 'dumbbell');
  const usage = Object.fromEntries(catalog.map((exercise) => [exercise.id, { sessions: 1, lastUsedAt: 1 }]));
  const discovery = rankExerciseDiscovery(candidates, usage, 'biceps');
  assert.ok([...discovery.featured, ...discovery.remaining].every((exercise) => exercise.primaryMuscle === 'biceps' && exercise.category === 'dumbbell'));
});

test('all discovery consumers use the shared authority without local secondary-muscle matching', () => {
  const consumers = [
    'src/views/LibraryView.tsx', 'src/components/AddExerciseModal.tsx',
    'src/components/RoutineEditorModal.tsx', 'src/components/HistoricalPersonalRecordModal.tsx',
    'src/components/ExercisePicker.tsx'
  ];
  for (const path of consumers) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /matchesExerciseFilters\(/, path);
    assert.doesNotMatch(source, /secondaryMuscles\??\.includes\(/, path);
  }
});
