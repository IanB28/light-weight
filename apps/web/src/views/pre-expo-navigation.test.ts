import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanSectionSelector } from './PlanSectionSelector.js';
import { SegmentedControl } from '../components/ui/SelectionControls.js';
import { appSurfaceReducer, INITIAL_APP_SURFACE_STATE } from '../features/profile/profile-surface-state.js';
import { AuthProvider } from '../lib/auth-context.js';
import { RoutineDetailSheet } from '../features/routines/RoutineDetailSheet.js';
import type { Routine } from '@light-weight/domain';

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

test('a routine detail sheet renders only while its owning Plan context supplies a selection', () => {
  const routine: Routine = { id: 'routine-1', userId: 'local-anonymous', name: 'Push day', exerciseIds: ['bench'] };
  const props = { exercises: [], onClose: () => undefined, onStart: () => undefined };
  const render = (selected: Routine | null) => renderToStaticMarkup(
    React.createElement(AuthProvider, null, React.createElement(RoutineDetailSheet, { ...props, routine: selected }))
  );
  assert.match(render(routine), /role="dialog"/);
  assert.doesNotMatch(render(null), /role="dialog"/);
});

test('Plan gates portal overlays by active navigation without discarding editor state', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../../src/views/PlanView.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../../src/components/RoutinePicker.tsx', import.meta.url), 'utf8');
  const received = readFileSync(new URL('../../src/features/routines/ReceivedRoutines.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../../src/features/routines/RoutineDetailSheet.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../../src/components/RoutineEditorModal.tsx', import.meta.url), 'utf8');

  assert.match(app, /isActive=\{currentTab === 'plan' && planSection === 'week'\}/);
  assert.match(plan, /setSelectedRoutine\(null\);\s*onSelectAndStartRoutine\(routineId\)/);
  assert.match(plan, /routine=\{isActive \? selectedRoutine : null\}/);
  assert.match(plan, /isOpen=\{Boolean\(editingRoutine\)\}\s*isActive=\{isActive\}/);
  assert.match(picker, /open=\{isActive && open\}/);
  assert.match(received, /\{isActive && selected && <ReceivedRoutinePreview/);
  assert.match(detail, /if \(!routine\) setSharing\(false\)/);
  assert.match(editor, /open=\{isActive && showDiscardConfirm\}/);
  assert.doesNotMatch(plan, /isOpen=\{isActive && Boolean\(editingRoutine\)\}/);
});

test('Profile keeps Settings in the summary header and local Back/Cancel actions in subviews', () => {
  const profile = readFileSync(new URL('../../src/features/profile/ProfileView.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/features/profile/ProfileScreen.tsx', import.meta.url), 'utf8');
  const friend = readFileSync(new URL('../../src/features/profile/FriendProfileView.tsx', import.meta.url), 'utf8');
  assert.match(profile, /aria-label=\{t\('header.openSettings'\)\}/);
  assert.match(profile, /aria-label=\{t\('common.cancel'\)\}/);
  assert.match(screen, /onBack=\{\(\) => setPanel\(\{ type: 'friends' \}\)\}/);
  assert.match(screen, /onClick=\{\(\) => setPanel\(\{ type: 'summary' \}\)\}/);
  assert.match(friend, /aria-label=\{t\('friends.backToFriends'\)\}/);
});
