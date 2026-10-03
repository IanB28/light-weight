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

test('every real catalog exercise is searchable by its own full name', () => {
  assert.equal(catalog.length, 1324);
  const failures = catalog.filter((exercise) =>
    !matchesExerciseFilters(exercise, normalizeExerciseSearch(exercise.name), 'all', 'all')
  );
  assert.deepEqual(failures.map((exercise) => `${exercise.id}: ${exercise.name}`), []);
});

test('muscle words inside exercise names remain ordinary text, not hidden facets', () => {
  const collisions = [
    ['ex-1461', 'barbell full squat (back pov)', 'glutes'],
    ['ex-0039', 'barbell front chest squat', 'glutes'],
    ['ex-0104', 'barbell standing back wrist curl', 'forearms'],
    ['ex-1750', 'medicine ball supine chest throw', 'triceps']
  ] as const;
  for (const [id, name, primaryMuscle] of collisions) {
    const exercise = catalog.find((item) => item.id === id);
    assert.ok(exercise, id);
    assert.equal(normalizeExerciseSearch(exercise.name), name);
    assert.equal(exercise.primaryMuscle, primaryMuscle);
    assert.ok(find(name).some((item) => item.id === id), id);
  }
  assert.ok(!find('back').some((exercise) => exercise.id === 'ex-1461'));
  assert.ok(!find('chest').some((exercise) => exercise.id === 'ex-0039'));
});

test('mixed muscle words search names and primary aliases without secondary-muscle leakage', () => {
  for (const query of ['biceps curl', 'chest fly', 'back extension', 'back wrist curl', 'front chest squat']) {
    assert.ok(find(query).length > 0, query);
  }
  assert.ok(find('back wrist curl').some((exercise) => exercise.id === 'ex-0104'));
  assert.ok(find('front chest squat').some((exercise) => exercise.id === 'ex-0039'));
  const secondaryOnly: Exercise = {
    id: 'secondary-only', name: 'Dumbbell Curl', primaryMuscle: 'back',
    secondaryMuscles: ['biceps'], category: 'dumbbell', isCustom: true
  };
  assert.equal(matchesExerciseFilters(secondaryOnly, normalizeExerciseSearch('biceps curl'), 'all', 'all'), false);
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
  const bicepsCurl = find('curl', 'biceps', 'dumbbell');
  assert.ok(bicepsCurl.length > 0);
  assert.ok(bicepsCurl.every((exercise) => exercise.primaryMuscle === 'biceps' && exercise.category === 'dumbbell'));
  assert.ok(find('front chest squat', 'glutes', 'barbell').some((exercise) => exercise.id === 'ex-0039'));
  assert.ok(!find('front chest squat', 'chest').some((exercise) => exercise.id === 'ex-0039'));
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
