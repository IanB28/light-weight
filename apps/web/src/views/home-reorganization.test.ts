import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkoutSession } from '@light-weight/domain';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { DEFAULT_WEEKLY_SCHEDULE } from '../lib/storage.js';
import { groupWorkoutSessionsByDate, recentWorkoutSessions } from '../lib/home-history.js';
import { HomeView } from './HomeView.js';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal.js';

const session = (id: string, startedAt: string, endedAt?: string): WorkoutSession => ({
  id, userId: 'athlete', startedAt, endedAt, routineName: id,
  sets: { bench: [
    { setIndex: 1, weightKg: 40, reps: 10, setType: 'warmup', completed: true },
    { setIndex: 2, weightKg: 80, reps: 8, rir: 2, setType: 'working', completed: true }
  ] }
});

const render = (history: WorkoutSession[] = [], entries: { date: string; timestamp: number; weightKg: number }[] = [], targetWeight: number | null = null) =>
  renderToStaticMarkup(React.createElement(PreferencesProvider, null, React.createElement(HomeView, {
    userName: 'Ian', history, routines: [], weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    onUpdateWeeklySchedule: () => undefined, bodyweightEntries: entries, targetWeight,
    onSaveBodyweight: () => undefined, onSaveTargetWeight: () => undefined,
    onStartWorkout: () => undefined
  })));

test('Home stacks greeting, passive weekly streak, planning, expanded legacy weight and collapsed history', () => {
  const html = render();
  const positions = [html.indexOf('Hola,'), html.indexOf('data-testid="home-weekly-streak"'),
    html.indexOf('aria-label="Semana anterior"'), html.indexOf('aria-label="Registrar peso de hoy"'),
    html.indexOf('data-testid="home-history-card"')];
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(html, /data-testid="home-weekly-streak"/);
  assert.doesNotMatch(html, /aria-label="racha de/);
  assert.match(html, /aria-label="Contraer peso corporal y meta"/);
  assert.match(html, /Historial y consistencia/);
  assert.match(html, /aria-expanded="false" aria-controls="home-history-content"/);
  assert.doesNotMatch(html, /Peso corporal y meta/);
  assert.equal((html.match(/data-testid="home-week-day"/g) ?? []).length, 7);
});

test('legacy weight body remains present for empty history and a configured goal', () => {
  const empty = render();
  const goal = render([], [], 75);
  const many = render([], [
    { date: '2026-10-01', timestamp: Date.parse('2026-10-01T12:00:00Z'), weightKg: 80 },
    { date: '2026-10-02', timestamp: Date.parse('2026-10-02T12:00:00Z'), weightKg: 79 }
  ], 75);
  assert.match(empty, /Aún no tienes registros de peso/);
  assert.match(goal, /Meta 75 kg/);
  assert.match(many, /79/);
  assert.match(many, /<svg/);
});

test('history grouping uses recorded local date and retains every session in chronological order', () => {
  const first = session('first', '2026-10-02T08:00:00Z');
  const second = session('second', '2026-10-02T18:00:00Z');
  const older = session('older', '2026-10-01T08:00:00Z');
  const grouped = groupWorkoutSessionsByDate([first, older, second]);
  assert.deepEqual(grouped['2026-10-02'].map((item) => item.id), ['second', 'first']);
  assert.deepEqual(recentWorkoutSessions([first, older, second]).map((item) => item.id), ['second', 'first', 'older']);
  const retrospective = { ...session('retrospective', '2026-10-03T18:00:00Z'), performedDate: '2026-09-20' };
  assert.deepEqual(recentWorkoutSessions([first, retrospective, older]).map((item) => item.id), ['first', 'older', 'retrospective']);
});

test('full workout detail distinguishes working/warmup sets and unknown duration', () => {
  const withDuration = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(WorkoutDetailModal, { session: session('detail', '2026-10-02T08:00:00Z', '2026-10-02T08:45:00Z'), onClose: () => undefined })));
  const withoutDuration = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(WorkoutDetailModal, { session: session('unknown', '2026-10-02T08:00:00Z'), onClose: () => undefined })));
  assert.match(withDuration, /45 min/);
  assert.match(withDuration, /Calentamiento/);
  assert.match(withDuration, /Serie efectiva/);
  assert.match(withDuration, /RIR 2/);
  assert.match(withoutDuration, /Duración<\/span><span[^>]*>—/);
});
