import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateSessionTotalVolume,
  type BodyweightEntry,
  type Exercise,
  type LoggedSet,
  type WorkoutSession
} from '@light-weight/domain';
import { selectProgressSummary, selectStatsSnapshot } from '../features/stats/stats-selectors.js';
import { calculateHistoricalSessionVolume } from './historical-volume.js';

const bench: Exercise = { id: 'bench', name: 'Bench', category: 'barbell', primaryMuscle: 'chest' };
const assisted: Exercise = {
  id: 'assisted', name: 'Assisted pull-up', category: 'bodyweight', primaryMuscle: 'back',
  loading: { mechanism: 'bodyweight', loadMode: 'assisted', bodyweightFactor: 1, supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false }
};
const weighted: Exercise = {
  id: 'weighted', name: 'Weighted pull-up', category: 'bodyweight', primaryMuscle: 'back',
  loading: { mechanism: 'bodyweight', loadMode: 'added_weight', bodyweightFactor: 1, supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false }
};
const exercisesById: Record<string, Exercise> = { bench, assisted, weighted };
const historicalWeights: BodyweightEntry[] = [
  { date: '2026-08-01', weightKg: 80 },
  { date: '2026-09-01', weightKg: 90 }
];

function set(weightKg: number, reps: number, setType: LoggedSet['setType'] = 'working', completed = true): LoggedSet {
  return { setIndex: 1, weightKg, reps, setType, completed };
}

function session(sets: WorkoutSession['sets'], performedDate = '2026-08-10'): WorkoutSession {
  return {
    id: 'historical-volume', userId: 'athlete',
    startedAt: '2026-09-10T10:00:00.000Z', performedDate,
    sets
  };
}

const volume = (workout: WorkoutSession, entries = historicalWeights, catalog: Record<string, Exercise> = exercisesById) =>
  calculateHistoricalSessionVolume(workout, catalog, entries);

test('A: completed conventional external load is 80 × 10 = 800 kg', () => {
  assert.equal(volume(session({ bench: [set(80, 10)] })), 800);
});

test('B: assistance uses historical effective load, not assistance as moved load', () => {
  assert.equal(volume(session({ assisted: [set(30, 10)] })), 500);
});

test('C: added weight includes the evidenced historical bodyweight', () => {
  assert.equal(volume(session({ weighted: [set(20, 10)] })), 1000);
});

test('D/E: current weight never substitutes for unavailable historical evidence', () => {
  const past = session({ assisted: [set(30, 10)], weighted: [set(20, 10)] });
  assert.equal(volume(past), 1500); // 80 kg at the session date, not 90 kg today.
  assert.equal(volume(past, [{ date: '2026-09-01', weightKg: 90 }]), 200); // Assistance 0; external added load only.
});

test('F: only completed effective working/drop/backoff sets count', () => {
  assert.equal(volume(session({ bench: [
    set(20, 10, 'warmup'),
    set(80, 10),
    set(60, 5, 'drop'),
    set(50, 4, 'backoff'),
    set(100, 2, 'working', false)
  ] })), 1300);
});

test('G: mixed session has identical Domain, historical UI and Stats selector totals', () => {
  const mixed = session({
    bench: [set(20, 10, 'warmup'), set(80, 10)],
    assisted: [set(30, 10)],
    weighted: [set(20, 10)]
  });
  const expected = 2300;
  assert.equal(calculateSessionTotalVolume(mixed, { exercisesById, bodyweightEntries: historicalWeights }), expected);
  assert.equal(volume(mixed), expected);
  assert.equal(selectProgressSummary([mixed], exercisesById, historicalWeights, Date.parse('2026-09-15T00:00:00Z')).volumeKg, expected);
  assert.equal(selectStatsSnapshot([mixed], Object.values(exercisesById), 30, 90, undefined, historicalWeights).totalVolumeTonnage, expected);
});

test('G: Profile, Stats, Detail, Heatmap and Calendar all use the historical context adapter', () => {
  const surfaces = [
    'src/features/profile/ProfileView.tsx',
    'src/views/StatsView.tsx',
    'src/components/WorkoutDetailModal.tsx',
    'src/components/charts/ActivityHeatmap.tsx',
    'src/components/MonthCalendarModal.tsx'
  ];
  for (const path of surfaces) {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    assert.match(source, /calculateHistoricalSessionVolume\(/, `${path} must use canonical historical tonnage`);
    assert.doesNotMatch(source, /calculateSessionTotalVolume\(session\)/, `${path} must not omit historical context`);
  }
});

test('H: performedDate, not startedAt or recordedAt, chooses the bodyweight', () => {
  const workout = session({ assisted: [set(30, 10)] }, '2026-08-10');
  assert.equal(volume(workout), 500);
  assert.equal(volume({ ...workout, performedDate: '2026-09-10' }), 600);
});

test('I: per_hand and per_side stored kg represent one hand/side and are never implicitly doubled', () => {
  const perHand: Exercise = { id: 'curl', name: 'Curl', category: 'dumbbell', primaryMuscle: 'biceps', loading: { mechanism: 'dumbbell', loadMode: 'per_hand', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false } };
  const perSide: Exercise = { id: 'row', name: 'One-arm row', category: 'cable', primaryMuscle: 'back', loading: { mechanism: 'cable', loadMode: 'per_side', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false } };
  assert.equal(volume(session({ curl: [set(20, 10)], row: [set(30, 10)] }), historicalWeights, { curl: perHand, row: perSide }), 500);
});

test('J: a legacy persisted total cannot override canonical runtime volume', () => {
  const workout = { ...session({ assisted: [set(30, 10)] }), totalVolumeKg: 300 };
  assert.equal(volume(workout), 500);
});
