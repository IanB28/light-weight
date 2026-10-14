import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  calculateWeeklyStreak,
  estimateOneRm,
  getExerciseProgressSeries,
  type Exercise,
  type WorkoutSession
} from '@light-weight/domain';
import { HomeView } from './HomeView.js';
import { StatsView } from './StatsView.js';
import { DEFAULT_WEEKLY_SCHEDULE } from '../lib/storage.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import {
  buildExercisesById,
  selectLastTopSet,
  selectMuscleAnalytics,
  selectProgressSummary,
  selectStatsSnapshot,
  selectTotalVolumeTonnage
} from '../features/stats/stats-selectors.js';
import { dictionaries } from '../lib/i18n.js';

const bench: Exercise = { id: 'bench', name: 'Bench', category: 'barbell', primaryMuscle: 'chest' };
const exerciseMap = buildExercisesById([bench]);
const workout: WorkoutSession = {
  id: 'progress-r4', userId: 'athlete', routineName: 'Upper',
  startedAt: '2026-10-12T16:00:00.000Z', performedDate: '2026-10-12',
  sets: { bench: [
    { setIndex: 1, weightKg: 20, reps: 10, setType: 'warmup', completed: true },
    { setIndex: 2, weightKg: 80, reps: 5, rir: 2, setType: 'working', completed: true }
  ] }
};
const weights = [{ date: '2026-10-01', timestamp: Date.parse('2026-10-01T12:00:00.000Z'), weightKg: 75 }];

function renderStats(history: WorkoutSession[] = []) {
  return renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(StatsView, {
      history, exercises: [bench], profile: { displayName: 'Athlete', gender: 'male' },
      bodyweightEntries: weights, onOpenSettings: () => undefined,
      isWorkoutActive: true, activeWorkoutDuration: '02:35', onNavigateToWorkout: () => undefined
    })));
}

test('Progress has exactly three analytical sections and no duplicate weight, consistency or 30-day recap', () => {
  for (const html of [renderStats(), renderStats([workout])]) {
    assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3);
    for (const key of ['stats.musclesTitle', 'stats.exerciseProgressTitle', 'stats.calculatorTitle'] as const) {
      assert.ok(html.includes(dictionaries.es[key]), key);
    }
    for (const key of ['stats.bodyweightTitle', 'stats.consistencyTitle', 'stats.last30'] as const) {
      assert.ok(!html.includes(dictionaries.es[key]), key);
    }
    assert.ok(!html.includes('Tonelaje histórico'));
    assert.ok(html.includes('02:35'));
  }
});

test('Home retains its weight tracker, passive streak and independent historical activity entry', () => {
  const html = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(HomeView, {
      userName: 'Athlete', history: [workout], exercises: [bench], routines: [],
      weeklySchedule: DEFAULT_WEEKLY_SCHEDULE, onUpdateWeeklySchedule: () => undefined,
      bodyweightEntries: weights, targetWeight: 73, onSaveBodyweight: () => undefined,
      onSaveTargetWeight: () => undefined, onStartWorkout: () => undefined
    })));
  assert.ok(html.includes('data-testid="home-weekly-streak"'));
  assert.ok(html.includes(dictionaries.es['weight.title']));
  assert.ok(html.includes('data-testid="home-history-card"'));
  assert.ok(html.includes('aria-label="Contraer peso corporal y meta"'));
  assert.ok(!html.includes('Tonelaje histórico'));
});

test('Home recap preserves the exact 30-day selector and historical tonnage semantics', () => {
  const now = Date.parse('2026-10-13T12:00:00.000Z');
  const summary = selectProgressSummary([workout], exerciseMap, weights, now);
  assert.equal(summary.sessions, 1);
  assert.equal(summary.volumeKg, 400);
  assert.equal(summary.bestExerciseName, 'Bench');
  assert.ok(Math.abs(summary.bestEstimatedOneRm - estimateOneRm(80, 5).average) < 0.001);
  assert.equal(summary.weeklyStreak, calculateWeeklyStreak([workout]));
  assert.equal(selectTotalVolumeTonnage([workout], exerciseMap, weights), 400);
});

test('Exercise Progress and calculator retain workout-derived weights, RIR and estimation parity', () => {
  const series = getExerciseProgressSeries([workout], bench.id, { exercise: bench, bodyweightEntries: weights });
  assert.equal(series.length, 1);
  assert.equal(series[0].topWeightKg, 80);
  assert.equal(series[0].avgRir, 2);
  const last = selectLastTopSet([workout], bench.id);
  assert.equal(last?.weightKg, 80);
  assert.equal(last?.reps, 5);
  assert.ok(Math.abs((last?.estimatedOneRm ?? 0) - estimateOneRm(80, 5).average) < 0.001);
});

test('direct muscle selector used by Progress preserves prior strength and fatigue snapshot', () => {
  const direct = selectMuscleAnalytics([workout], exerciseMap, 7, 75, 'male', weights);
  const previous = selectStatsSnapshot([workout], [bench], 7, 75, 'male', weights);
  assert.deepEqual(direct.muscleAnalysis, previous.muscle.muscleAnalysis);
  assert.deepEqual(direct.fullMuscleAnalytics, previous.muscle.fullMuscleAnalytics);
  assert.deepEqual(direct.semanticBalance, previous.muscle.semanticBalance);
  assert.deepEqual(direct.semanticFatigue, previous.muscle.semanticFatigue);
});
