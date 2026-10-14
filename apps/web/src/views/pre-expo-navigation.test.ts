import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanSectionSelector } from './PlanSectionSelector.js';
import { SegmentedControl } from '../components/ui/SelectionControls.js';
import { appSurfaceReducer, INITIAL_APP_SURFACE_STATE } from '../features/profile/profile-surface-state.js';

test('Plan section selector exposes Week and Exercises as accessible, mutually exclusive choices', () => {
  const week = renderToStaticMarkup(React.createElement(PlanSectionSelector, { value: 'week', onChange: () => undefined }));
  const exercises = renderToStaticMarkup(React.createElement(PlanSectionSelector, { value: 'exercises', onChange: () => undefined }));
  assert.match(week, /role="group" aria-label="Secciones del plan"/);
  assert.match(week, /aria-pressed="true"[^>]*>.*Semana y rutinas/);
  assert.match(exercises, /aria-pressed="true"[^>]*>.*Ejercicios/);
  assert.equal((week.match(/type="button"/g) ?? []).length, 2);
});

test('Plan section control reports the selected destination', () => {
  let selected = '';
  const control = SegmentedControl({
    value: 'week', label: 'Plan sections',
    options: [{ value: 'week', label: 'Week and routines' }, { value: 'exercises', label: 'Exercises' }],
    onChange: (value) => { selected = value; }
  });
  const options = React.Children.toArray(control.props.children) as React.ReactElement<{ onClick: () => void }>[];
  options[1].props.onClick();
  assert.equal(selected, 'exercises');
});

test('Profile and Plan are primary surfaces without resetting workout or rest session state', () => {
  const profile = appSurfaceReducer(INITIAL_APP_SURFACE_STATE, { type: 'select_tab', tab: 'profile' });
  const settings = appSurfaceReducer(profile, { type: 'open_settings' });
  assert.equal(appSurfaceReducer(settings, { type: 'close_settings' }).currentTab, 'profile');
  assert.equal(appSurfaceReducer(profile, { type: 'select_tab', tab: 'plan' }).currentTab, 'plan');
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const workout = useWorkoutSession\(/);
  assert.match(app, /const restTimer = useRestTimer\(/);
  assert.match(app, /\(planVisited \|\| currentTab === 'plan'\).*hidden=/s);
  assert.match(app, /currentTab === 'plan' && planSection === 'exercises' && <LibraryView/);
});
