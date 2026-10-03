import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Routine } from '@light-weight/domain';
import { AuthProvider } from '../lib/auth-context.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { DAY_NUM_TO_WEEKDAY, DEFAULT_WEEKLY_SCHEDULE, type WeeklySchedule } from '../lib/storage.js';
import { HomeView } from './HomeView.js';
import { PlanView } from './PlanView.js';
import { WeightTrackerCard } from '../components/WeightTrackerCard.js';
import { RoutinePicker } from '../components/RoutinePicker.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const routine: Routine = { id: 'routine-1', userId: 'user-1', name: 'Full Body', exerciseIds: ['squat', 'row'] };
const week = (): WeeklySchedule => ({ ...DEFAULT_WEEKLY_SCHEDULE });
const renderHome = (schedule = week(), routines: Routine[] = [routine]) => renderToStaticMarkup(
  React.createElement(PreferencesProvider, null, React.createElement(HomeView, {
    userName: 'A very long athlete name that must wrap safely', routines, weeklySchedule: schedule,
    onUpdateWeeklySchedule: () => undefined, bodyweightEntries: [], targetWeight: null,
    onSaveBodyweight: () => undefined, onSaveTargetWeight: () => undefined,
    onStartWorkout: () => undefined, onOpenSettings: () => undefined
  }))
);
const renderPlan = (routines: Routine[], schedule = week()) => renderToStaticMarkup(
  React.createElement(AuthProvider, null, React.createElement(PlanView, {
    routines, exercises: [], weeklySchedule: schedule,
    onUpdateWeeklySchedule: () => undefined, onSelectAndStartRoutine: () => undefined,
    onSaveRoutine: () => undefined
  }))
);

test('Home keeps its header, logo, seven accessible days and week navigation', () => {
  const html = renderHome();
  assert.match(html, /LightWeight/);
  assert.match(html, /aria-label="(?:Semana anterior|Previous week)"/);
  assert.match(html, /aria-label="(?:Semana siguiente|Next week)"/);
  assert.equal((html.match(/aria-current="date"/g) ?? []).length, 1);
  assert.equal((html.match(/data-testid="home-week-day"/g) ?? []).length, 7);
  assert.match(html, /aria-label="(?:Abrir ajustes|Open settings)"/);
  assert.match(source('views/HomeView.tsx'), /<AppLogo/);
});

test('Home today keeps scheduled start, rest focus, alternate training and monthly calendar callbacks', () => {
  const today = DAY_NUM_TO_WEEKDAY[new Date().getDay()];
  const scheduledHtml = renderHome({ ...week(), [today]: routine.id });
  const restHtml = renderHome();
  assert.match(scheduledHtml, /Full Body/);
  assert.match(scheduledHtml, /Entrenar otra cosa/);
  assert.match(restHtml, /Día de descanso/);
  assert.match(restHtml, /Entrenar de todos modos/);
  const homeSource = source('views/HomeView.tsx');
  for (const contract of [
    'onStartWorkout(todayScheduledRoutine.id)',
    'setIsFocusModalOpen(true)',
    'setIsMonthCalendarOpen(true)',
    'onOpenLogModal={handleOpenLogWeight}',
    'onOpenGoalModal={handleOpenGoalWeight}'
  ]) assert.ok(homeSource.includes(contract), contract);
});

test('Weight tracker uses semantic goal and log controls with current metric and accent chart', () => {
  const entry = { date: '2026-10-01', timestamp: Date.parse('2026-10-01T12:00:00Z'), weightKg: 78.7 };
  const html = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(WeightTrackerCard, {
      entries: [entry], targetWeight: 77,
      onOpenLogModal: () => undefined, onOpenGoalModal: () => undefined
    })));
  assert.match(html, /ui-metric/);
  assert.match(html, /ui-unit/);
  assert.match(html, /aria-label="Cambiar meta de peso: Meta 77 kg/);
  assert.match(html, /<button[^>]*aria-label="Registrar peso de hoy"/);
  const weightSource = source('components/WeightTrackerCard.tsx');
  assert.doesNotMatch(weightSource, /<div\s+onClick=/);
  assert.match(weightSource, /color="var\(--accent-color\)"/);
  assert.match(renderHome(), /Peso corporal/);
});

test('Plan retains seven assignment pickers, empty guidance and New Routine in My Routines', () => {
  const html = renderPlan([]);
  assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 7);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 7);
  assert.match(html, /Nueva rutina/);
  assert.match(html, /No tienes rutinas todavía/);
  const planSource = source('views/PlanView.tsx');
  assert.match(planSource, /const DAYS_LIST: WeekDay\[\] = \['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'\]/);
  assert.ok(planSource.includes('onChange={(routineId) => assignRoutine(day, routineId)}'));
  assert.ok(planSource.includes('onUpdateWeeklySchedule?.({ ...weeklySchedule, [day]: routineId })'));
  assert.ok(planSource.includes('<ReceivedRoutines'));
});

test('Plan routine rows retain detail entry, exercise count and imported provenance', () => {
  const imported: Routine = {
    ...routine, origin: { type: 'shared', sharedBy: { id: 'sender', username: 'ian', displayName: 'Ian' } }
  };
  const html = renderPlan([imported], { ...week(), monday: routine.id, wednesday: routine.id });
  assert.match(html, /Full Body/);
  assert.match(html, /2 ejercicios/);
  assert.match(html, /Compartida por @ian/);
  assert.match(html, /ui-interactive-surface ui-focus-visible ui-pressable/);
  assert.match(source('views/PlanView.tsx'), /onClick=\{\(\) => setSelectedRoutine\(routine\)\}/);
  assert.match(source('features/routines/ReceivedRoutines.tsx'), /setSelected\(share\)/);
});

test('RoutinePicker retains trigger, rest, search threshold and selected options', () => {
  const html = renderToStaticMarkup(React.createElement(RoutinePicker, {
    dayLabel: 'Lunes', value: routine.id, routines: [routine], onChange: () => undefined
  }));
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /ui-focus-visible ui-control-surface/);
  const pickerSource = source('components/RoutinePicker.tsx');
  assert.match(pickerSource, /routines\.length > 4/);
  assert.match(pickerSource, /onChange\(routineId\)/);
  assert.match(pickerSource, /selectRoutine\(null\)/);
  assert.match(pickerSource, /ui-selected-option/);
});

test('VP.2 visible surfaces avoid legacy buttons, glows and structural motion', () => {
  for (const path of [
    'views/HomeView.tsx', 'views/PlanView.tsx', 'components/WeightTrackerCard.tsx',
    'components/RoutinePicker.tsx', 'features/routines/ReceivedRoutines.tsx'
  ]) {
    const contents = source(path);
    assert.doesNotMatch(contents, /transition-all|active:scale-\[|shadow-\[|glass-btn-(?:solid|secondary)|#[0-9a-f]{3,8}\b/i, path);
  }
  assert.doesNotMatch(source('views/HomeView.tsx'), /\bpb-28\b|max-w-md mx-auto/);
  assert.doesNotMatch(source('views/PlanView.tsx'), /\bpb-28\b/);
});
