import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveExerciseLoadingProfile, type Exercise } from '@light-weight/domain';
import { RestTimerBar } from '../../components/RestTimerBar.js';
import { RirPicker } from '../../components/ui/RirPicker.js';
import { dictionaries } from '../../lib/i18n.js';
import { DEFAULT_APP_PREFERENCES } from '../../lib/preferences.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { ExerciseSessionCard, SetRow, SetTable, WorkoutHeader } from './WorkoutSessionComponents.js';
import type { ActiveExerciseSession } from './types.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const noop = () => undefined;
const exercise: Exercise = {
  id: 'bench', name: 'A deliberately long barbell bench press variation for narrow screens',
  category: 'barbell', primaryMuscle: 'chest',
  loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true,
    supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true }
};
const machine: Exercise = {
  ...exercise, id: 'machine', name: 'Plate-loaded chest press', category: 'machine',
  loading: { mechanism: 'plate_loaded', loadMode: 'total', supportsKeyboard: true,
    supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false, hasMachineBase: true }
};
const session = (item: Exercise = exercise, overrides: Partial<ActiveExerciseSession> = {}): ActiveExerciseSession => ({
  exercise: item, targetRepRange: [6, 12], skipped: false,
  sets: [{ setIndex: 1, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: undefined }],
  ...overrides
});
const row = (value = session()) => renderToStaticMarkup(React.createElement(SetRow, {
  exerciseId: value.exercise.id, set: value.sets[0], session: value,
  loading: resolveExerciseLoadingProfile(value.exercise).profile,
  usesAddedWeight: true, weightInputMode: 'keyboard', preferences: DEFAULT_APP_PREFERENCES,
  onUpdateSet: noop, onUpdateSetRir: noop, onToggleSet: noop,
  onStartRestTimer: noop, onOpenPlates: noop
}));
const table = (value = session()) => renderToStaticMarkup(React.createElement(SetTable, {
  session: value, preferences: DEFAULT_APP_PREFERENCES,
  onUpdateSet: noop, onUpdateSetRir: noop, onToggleSet: noop,
  onStartRestTimer: noop, onOpenPlates: noop, onAddSet: noop,
  onRemoveSet: noop, onUpdateWeightInputMode: noop, onToggleAddedWeight: noop
}));
const card = (value = session(), mode: 'live' | 'historical' = 'live') => renderToStaticMarkup(
  React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
    session: value, exerciseIndex: 0, totalExercises: 2, preferences: DEFAULT_APP_PREFERENCES, mode,
    onViewTechnique: noop, onRemoveExercise: noop, onSkipExercise: noop,
    onResumeExercise: noop, onAddReplacement: noop, onUpdateSet: noop, onUpdateSetRir: noop,
    onToggleSet: noop, onStartRestTimer: noop, onOpenPlates: noop,
    onAddSet: noop, onRemoveSet: noop, onUpdateWeightInputMode: noop,
    onToggleAddedWeight: noop, onUpdateMachineProfile: noop
  }))
);

test('WorkoutHeader keeps stable actions and all metrics, with Finish disabled at zero', () => {
  const html = renderToStaticMarkup(React.createElement(WorkoutHeader, {
    routineName: 'Very long full body routine name', sessionDuration: '01:23',
    completedSetsCount: 0, totalSetsCount: 4, totalVolumeLabel: '1200 kg',
    onDiscard: noop, onFinish: noop
  }));
  assert.match(html, /grid-cols-\[2\.75rem_minmax\(0,1fr\)_auto\]/);
  assert.match(html, /aria-label="Descartar sesión"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /01:23/);
  assert.match(html, /0\/4/);
  assert.match(html, /1200 kg/);
  assert.match(html, /tabular-nums/);
});

test('SetRow keeps weight, reps, compact RIR and completion semantics', () => {
  const html = row();
  assert.match(html, /aria-label="Peso de la serie 1"/);
  assert.match(html, /inputMode="decimal"/);
  assert.match(html, /aria-label="Repeticiones de la serie 1"/);
  assert.match(html, /inputMode="numeric"/);
  assert.match(html, /aria-label="RIR de la serie 1"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /min-\[390px\]:flex/);
});

test('invalid, unknown-machine, base-violation and completed rows remain distinct', () => {
  const invalid = row(session(exercise, { sets: [{ setIndex: 1, weightKg: 0, reps: 0, completed: false, setType: 'working' }] }));
  const unknown = row(session(machine, { machineBaseResistanceStatus: 'unknown' }));
  const violation = row(session(machine, { machineBaseResistanceStatus: 'user_defined', machineBaseResistanceKg: 100 }));
  const complete = row(session(exercise, { sets: [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working' }] }));
  assert.match(invalid, /disabled=""/);
  assert.match(invalid, /title="Introduce al menos una repetición válida"/);
  assert.match(unknown, /border-warning\/40 bg-warning-soft/);
  assert.match(unknown, /disabled=""/);
  assert.match(violation, /border-danger\/40 bg-danger-soft/);
  assert.match(violation, /disabled=""/);
  assert.match(complete, /aria-pressed="true"/);
  assert.doesNotMatch(complete, /disabled=""/);
});

test('completion callback ordering and rest gate remain frozen', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');
  assert.match(contents, /onToggleSet\(exerciseId, set\.setIndex\);\s*if \(!set\.completed && canComplete\) onStartRestTimer\(preferences\.defaultRestSeconds\)/);
  assert.match(contents, /disabled=\{!set\.completed && !canComplete\}/);
  assert.match(contents, /aria-pressed=\{set\.completed\}/);
});

test('SetTable keeps canonical columns, set types, remove, and keyboard/plate mode', () => {
  const html = table();
  assert.match(html, />#<\/span>/);
  assert.match(html, /PESO/);
  assert.match(html, /REPS/);
  assert.match(html, /RIR/);
  assert.match(html, /aria-label="Tipo de serie a agregar"/);
  assert.match(html, /Quitar última/);
  assert.match(html, /aria-pressed="true"/);
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');
  for (const kind of ['working', 'warmup', 'drop', 'backoff']) assert.ok(contents.includes(`value: '${kind}'`));
  assert.ok(contents.includes("(['keyboard', 'plates'] as const)"));
});

test('exercise card preserves technique, actions, reference, PR and machine trigger', () => {
  const html = card(session(exercise, { previousRecord: '70 kg × 8', bestRecord: '90 kg × 5' }));
  assert.match(html, /aria-label="Ver técnica de/);
  assert.match(html, /aria-label="Omitir ejercicio/);
  assert.match(html, /aria-label="Eliminar/);
  assert.match(html, /Anterior:/);
  assert.match(html, /text-warning">PR/);
  assert.match(html, /line-clamp-2/);
  const machineHtml = card(session(machine, { machineBaseResistanceStatus: 'unknown' }));
  assert.match(machineHtml, /Sin configurar/);
  assert.match(machineHtml, /border-warning\/40 bg-warning-soft/);
  assert.match(source('features/workouts/WorkoutSessionComponents.tsx'), /<ExerciseThumbnail/);
});

test('skipped and historical cards retain their distinct flows', () => {
  const skipped = card(session(exercise, { skipped: true }));
  assert.match(skipped, /Omitido en esta sesión/);
  assert.match(skipped, /Reanudar/);
  assert.match(skipped, /Agregar reemplazo/);
  assert.doesNotMatch(skipped, /aria-label="Tipo de serie a agregar"/);
  const historical = card(session(), 'historical');
  assert.doesNotMatch(historical, /aria-label="Omitir ejercicio/);
  assert.match(historical, /aria-label="Tipo de serie a agregar"/);
  assert.match(source('features/workouts/WorkoutSessionComponents.tsx'), /mode === 'historical' \? \(\) => \{\} : onStartRestTimer/);
});

test('RIR compact trigger keeps dialog semantics and canonical unlogged/0/6+ presentation', () => {
  for (const [value, label] of [[undefined, '—'], [0, '0'], [6, '6+']] as const) {
    const html = renderToStaticMarkup(React.createElement(RirPicker, {
      value, onChange: noop, ariaLabel: 'RIR for test', compact: true
    }));
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, new RegExp(`>${label.replace('+', '\\+') }<\\/span>`));
  }
  const contents = source('components/ui/RirPicker.tsx');
  assert.match(contents, /role="listbox"/);
  assert.match(contents, /role="option"/);
  assert.match(contents, /aria-selected=\{selected\}/);
  assert.match(contents, /value: undefined/);
});

test('RestTimer is hidden at zero and keeps translated controls and stable time', () => {
  assert.equal(renderToStaticMarkup(React.createElement(RestTimerBar, {
    secondsLeft: 0, totalSeconds: 60, onAddSeconds: noop, onDismiss: noop
  })), '');
  const html = renderToStaticMarkup(React.createElement(RestTimerBar, {
    secondsLeft: 59, totalSeconds: 90, onAddSeconds: noop, onDismiss: noop
  }));
  assert.match(html, /00:59/);
  assert.match(html, /bottom-above-nav/);
  assert.match(html, /ui-elevated-surface/);
  assert.match(html, /tabular-nums/);
  assert.match(html, /15s/);
  assert.match(html, /30s/);
  assert.match(html, /aria-label="Saltar descanso"/);
  assert.equal((html.match(/type="button"/g) ?? []).length, 3);
  assert.equal(dictionaries.en['workout.restTimer'], 'Rest');
  assert.equal(dictionaries.en['workout.skipRest'], 'Skip rest');
  assert.equal(dictionaries.es['workout.restTimer'], 'Descanso');
});

test('VP.3 visual guard excludes legacy dark palette in owned core, not deferred overlays', () => {
  const owned = [source('views/WorkoutView.tsx'), source('features/workouts/WorkoutSessionComponents.tsx'),
    source('features/workouts/WeightEntry.tsx').split('export function PlatePickerSheet')[0],
    source('components/RestTimerBar.tsx')];
  for (const contents of owned) {
    assert.doesNotMatch(contents, /text-white|text-zinc-|bg-black|border-white|transition-all|active:scale-\[|shadow-\[|(?:text|bg|border)-(?:amber|sky|rose)-|#[0-9a-f]{3,8}\b/i);
  }
  assert.match(source('views/WorkoutView.tsx'), /pb-36/);
  assert.match(source('components/RestTimerBar.tsx'), /bottom-above-nav/);
});
