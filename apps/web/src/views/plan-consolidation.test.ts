import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Exercise, Routine } from '@light-weight/domain';
import { AuthProvider } from '../lib/auth-context.js';
import { DEFAULT_WEEKLY_SCHEDULE } from '../lib/storage.js';
import { PlanHeader } from './PlanHeader.js';
import { PlanView } from './PlanView.js';
import { LibraryView } from './LibraryView.js';

const source = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const routine: Routine = { id: 'routine-1', userId: 'local-anonymous', name: 'Strength day', exerciseIds: ['bench'] };
const exercise = { id: 'bench', name: 'Bench press', primaryMuscle: 'chest', category: 'barbell' } as Exercise;
const headerProps = {
  section: 'week' as const,
  onSectionChange: (_section: 'week' | 'exercises') => undefined,
  isWorkoutActive: true,
  activeWorkoutDuration: '12:34',
  onNavigateToWorkout: () => undefined,
  onOpenSettings: () => undefined
};

test('Plan has one header, one Settings action, one active workout return, and exactly two sections', () => {
  const html = renderToStaticMarkup(React.createElement(PlanHeader, headerProps));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="Abrir ajustes"/g) ?? []).length, 1);
  assert.equal((html.match(/Sesión activa/g) ?? []).length, 1);
  assert.match(html, /12:34/);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 2);
  assert.match(html, /Semana y rutinas/);
  assert.match(html, /Ejercicios/);
});

test('Week retains seven assignment controls and routine management without a second header', () => {
  const html = renderToStaticMarkup(React.createElement(AuthProvider, null,
    React.createElement(PlanView, {
      routines: [routine], exercises: [exercise], weeklySchedule: { ...DEFAULT_WEEKLY_SCHEDULE, monday: routine.id },
      onSelectAndStartRoutine: () => undefined, onSaveRoutine: () => undefined
    })));
  assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 7);
  assert.match(html, /Strength day/);
  assert.match(html, /Mis rutinas/);
  assert.doesNotMatch(html, /<h1\b|aria-label="Abrir ajustes"/);
  const plan = source('views/PlanView.tsx');
  assert.ok(plan.indexOf('<ReceivedRoutines') > plan.indexOf("title={t('plan.myRoutines')}"));
  assert.match(plan, /<CreateRoutineModal\s+isOpen=\{isCreateModalOpen\}\s+isActive=\{isActive\}/);
});

test('Exercise catalog reuses Library controls and loading/error states without a competing header', () => {
  const props = { exercises: [exercise], isWorkoutActive: true, onAddExerciseToActiveWorkout: () => undefined, onRetryCatalog: () => undefined };
  const ready = renderToStaticMarkup(React.createElement(LibraryView, props));
  const loading = renderToStaticMarkup(React.createElement(LibraryView, { ...props, catalogStatus: 'loading' }));
  const error = renderToStaticMarkup(React.createElement(LibraryView, { ...props, catalogStatus: 'error' }));
  assert.match(ready, /Buscar ejercicios/);
  assert.match(ready, /Filtros/);
  assert.match(ready, /Bench press/);
  assert.match(loading, /Cargando/);
  assert.match(error, /Reintentar/);
  for (const html of [ready, loading, error]) assert.doesNotMatch(html, /<h1\b|aria-label="Abrir ajustes"/);
});

test('Plan keeps both section instances mounted and gates their transient overlays by active context', () => {
  const app = source('App.tsx');
  const library = source('views/LibraryView.tsx');
  const editor = source('components/RoutineEditorModal.tsx');
  assert.match(app, /\(planVisited \|\| currentTab === 'plan'\).*<PlanView/s);
  assert.match(app, /\(exercisesVisited \|\| \(currentTab === 'plan' && planSection === 'exercises'\)\).*<LibraryView/s);
  assert.match(library, /open=\{isActive && filtersOpen\}/);
  assert.match(library, /isOpen=\{isActive && Boolean\(selectedMediaExercise\)\}/);
  assert.match(editor, /if \(!isOpen \|\| !isActive\) return null/);
  assert.match(app, /const restTimer = useRestTimer\(\)/);
  assert.match(app, /const workout = useWorkoutSession\(/);
});
