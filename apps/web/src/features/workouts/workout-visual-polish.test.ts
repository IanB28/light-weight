import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveExerciseLoadingProfile, type Exercise } from '@light-weight/domain';
import { RestTimerBar } from '../../components/RestTimerBar.js';
import { RirPicker } from '../../components/ui/RirPicker.js';
import { KeyboardWeightInput, PlateWeightButton } from './WeightEntry.js';
import { parseDisplayWeight } from '../../lib/weight-units.js';
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
  assert.deepEqual([...html.matchAll(/class="col-span-(\d+) /g)].map(match => Number(match[1])), [1, 4, 3, 2, 2]);
  assert.match(html, /grid grid-cols-12 items-center gap-1 rounded-2xl p-1\.5/);
  assert.doesNotMatch(html, /col-span-12|grid-cols-2|@container/);
  for (const field of ['peso', 'repeticiones']) {
    const reduce = html.indexOf(`aria-label="Reducir ${field}`);
    const input = html.indexOf(field === 'peso' ? 'inputMode="decimal"' : 'inputMode="numeric"');
    const increase = html.indexOf(`aria-label="Aumentar ${field}`);
    assert.ok(reduce < input && input < increase, `${field}: decrement -> input -> increment`);
  }
});

test('numeric input render preserves full decimal weight and three-digit reps values with signs separate from values', () => {
  for (const [valueKg, units, displayed] of [[80, 'metric', '80'], [100, 'metric', '100'], [102.5, 'metric', '102.5'], [225.5, 'metric', '225.5']] as const) {
    const html = renderToStaticMarkup(React.createElement(KeyboardWeightInput, {
      valueKg, units, label: 'Weight for set 1', onChange: noop
    }));
    assert.match(html, new RegExp(`value="${displayed.replace('.', '\\.') }"`));
    assert.match(html, /inputMode="decimal"/);
    assert.match(html, /aria-label="Weight for set 1"/);
    assert.doesNotMatch(html, /maxLength=/);
  }
  const signed = renderToStaticMarkup(React.createElement(KeyboardWeightInput, {
    valueKg: 100, units: 'metric', label: 'Weight for set 1', prefix: '-', onChange: noop
  }));
  assert.match(signed, />-<\/span>/);
  assert.match(signed, /value="100"/);
  const threeDigitReps = row(session(exercise, { sets: [{ setIndex: 1, weightKg: 80, reps: 123, completed: false, setType: 'working' }] }));
  assert.match(threeDigitReps, /aria-label="Repeticiones de la serie 1"[^>]*value="123"/);
});

test('zero keyboard weight has a single separate prefix, never a signed placeholder', () => {
  for (const units of ['metric', 'imperial'] as const) {
    for (const prefix of ['+', '-']) {
      const html = renderToStaticMarkup(React.createElement(KeyboardWeightInput, {
        valueKg: 0, units, prefix, label: 'Weight', onChange: noop
      }));
      assert.match(html, /value=""/);
      assert.match(html, /placeholder="0"/);
      assert.equal((html.match(new RegExp(`>${prefix === '+' ? '\\+' : '-'}<\\/span>`, 'g')) ?? []).length, 1);
      assert.doesNotMatch(html, /placeholder="[+-]0"/);
      assert.doesNotMatch(html, /text-\[15px\]/);
    }
  }
});

test('prefixed metric and imperial keyboard and plate values retain all digits', () => {
  for (const units of ['metric', 'imperial'] as const) {
    for (const value of [0, 80, 100, 102.5, 225.5]) {
      for (const prefix of ['+', '-']) {
        const props = { valueKg: parseDisplayWeight(value, units), units, prefix, label: 'Weight' };
        const input = renderToStaticMarkup(React.createElement(KeyboardWeightInput, { ...props, onChange: noop }));
        assert.ok(input.includes(`value="${value === 0 ? '' : value}"`));
        assert.ok(!input.includes(`value="${prefix}${value}"`));
        const plate = renderToStaticMarkup(React.createElement(PlateWeightButton, { ...props, onClick: noop }));
        assert.ok(plate.includes(`>${prefix}${value}</span>`));
      }
    }
  }
});

test('historical inline steppers use the reachable 390px gate and retain nominal widths and focus', () => {
  const html = row();
  const steppers = html.match(/<button[^>]+aria-label="(?:Reducir|Aumentar)[^"]+"[^>]*>/g) ?? [];
  assert.equal(steppers.length, 4);
  for (const button of steppers) {
    assert.match(button, /hidden h-11 w-(?:7|6)/);
    assert.match(button, /ui-focus-visible/);
    assert.match(button, /min-\[390px\]:flex/);
    assert.doesNotMatch(button, /shrink-0|@container/);
  }
  assert.equal(steppers.filter(button => button.includes('w-7')).length, 2);
  assert.equal(steppers.filter(button => button.includes('w-6')).length, 2);
  assert.match(html, /min-\[390px\]:w-16/);
  assert.match(html, /min-\[390px\]:w-9/);
  assert.doesNotMatch(html, /col-span-12|grid-cols-2|flex-1|border-t/);
});

test('inline controls do not introduce weight steppers for plates or unloaded bodyweight', () => {
  for (const [mode, usesAddedWeight] of [['plates', true], ['keyboard', false]] as const) {
    const value = session();
    const html = renderToStaticMarkup(React.createElement(SetRow, {
      exerciseId: value.exercise.id, set: value.sets[0], session: value,
      loading: resolveExerciseLoadingProfile(value.exercise).profile,
      usesAddedWeight, weightInputMode: mode, preferences: DEFAULT_APP_PREFERENCES,
      onUpdateSet: noop, onToggleSet: noop, onStartRestTimer: noop, onOpenPlates: noop
    }));
    assert.doesNotMatch(html, /aria-label="(?:Reducir|Aumentar) peso/);
    assert.match(html, /aria-label="Reducir repeticiones/);
    assert.match(html, /aria-label="Aumentar repeticiones/);
  }
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

test('completion retains historical alignment and natural shrink inside its narrow cell', () => {
  const html = row();
  assert.match(html, /col-span-2 flex items-center justify-end pr-1/);
  const completion = html.match(/<button[^>]+aria-pressed="false"[^>]*>/)?.[0];
  assert.ok(completion);
  assert.match(completion, /flex size-11 items-center justify-center/);
  assert.doesNotMatch(completion, /shrink-0|min-w-|min-width|absolute|translate|overflow/);
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

test('ExerciseSessionCard metadata maintains uniform vertical rhythm without ad-hoc padding overrides', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');
  // Confirm the metadata column uses space-y-1 for clean, uniform 4px vertical rhythm
  assert.match(contents, /<div className="min-w-0 flex-1 space-y-1">/);

  // 1. Isolate and assert skipped metadata block boundaries
  const skippedStart = contents.indexOf('<div className="min-w-0 flex-1 space-y-1">');
  const skippedEnd = contents.indexOf('<div className="glass-surface flex flex-col', skippedStart);
  assert.ok(skippedStart !== -1, 'Skipped metadata start marker must exist in source');
  assert.ok(skippedEnd !== -1 && skippedEnd > skippedStart, 'Skipped metadata end marker must exist after start');
  const skippedMetadataBlock = contents.slice(skippedStart, skippedEnd);
  assert.doesNotMatch(skippedMetadataBlock, /\bpt-0\.5\b/, 'Skipped metadata block must not contain pt-0.5');
  assert.doesNotMatch(skippedMetadataBlock, /\bpt-1\.5\b/, 'Skipped metadata block must not contain pt-1.5');

  // 2. Isolate and assert active metadata block boundaries
  const activeStart = contents.lastIndexOf('<div className="min-w-0 flex-1 space-y-1">');
  const activeEnd = contents.indexOf('<SetTable', activeStart);
  assert.ok(activeStart !== -1, 'Active metadata start marker must exist in source');
  assert.ok(activeEnd !== -1 && activeEnd > activeStart, 'Active metadata end marker (<SetTable) must exist after start');
  assert.ok(activeStart > skippedEnd, 'Active metadata block must follow skipped block in source');
  const activeMetadataBlock = contents.slice(activeStart, activeEnd);
  assert.doesNotMatch(activeMetadataBlock, /\bpt-0\.5\b/, 'Active metadata block must not contain pt-0.5');
  assert.doesNotMatch(activeMetadataBlock, /\bpt-1\.5\b/, 'Active metadata block must not contain pt-1.5');

  // Case A: Base exercise (name + muscle/category only)
  const htmlBase = card(session(exercise));
  assert.match(htmlBase, /line-clamp-2 break-words/);
  assert.match(htmlBase, /flex min-w-0 items-center justify-between gap-3 text-xs/);
  assert.doesNotMatch(htmlBase, /text-warning">PR/);
  assert.doesNotMatch(htmlBase, /Anterior:/);

  // Case B: Exercise with PR only
  const htmlPR = card(session(exercise, { bestRecord: '100 kg × 5' }));
  assert.match(htmlPR, /<span class="shrink-0 font-semibold text-warning">PR 100 kg × 5<\/span>/);
  assert.doesNotMatch(htmlPR, /Anterior:/);

  // Case C: Exercise with Previous record only
  const htmlPrev = card(session(exercise, { previousRecord: '80 kg × 8' }));
  assert.match(htmlPrev, /<p class="font-mono text-\[11px\] leading-relaxed text-text-muted">/);
  assert.match(htmlPrev, /Anterior:<\/span> 80 kg × 8/);
  assert.doesNotMatch(htmlPrev, /text-warning">PR/);

  // Case D: Exercise with PR + Previous record
  const htmlPRPrev = card(session(exercise, { bestRecord: '100 kg × 5', previousRecord: '80 kg × 8' }));
  assert.match(htmlPRPrev, /text-warning">PR 100 kg × 5/);
  assert.match(htmlPRPrev, /Anterior:<\/span> 80 kg × 8/);

  // Case E: Plate-loaded machine with PR + Previous record + Machine control
  const htmlMachineFull = card(session(machine, { bestRecord: '120 kg × 10', previousRecord: '100 kg × 10' }));
  assert.match(htmlMachineFull, /text-warning">PR 120 kg × 10/);
  assert.match(htmlMachineFull, /Anterior:<\/span> 100 kg × 10/);
  assert.match(htmlMachineFull, /ui-control-surface inline-flex min-h-12 max-w-full items-center/);

  // Case F: Skipped card flow
  const htmlSkipped = card(session(exercise, { skipped: true }));

  // 3. Rendered markup boundary isolation: ensure rendered metadata columns never contain pt-0.5 or pt-1.5
  const renderedCases = [
    { name: 'Case A (base)', html: htmlBase },
    { name: 'Case B (PR only)', html: htmlPR },
    { name: 'Case C (Previous only)', html: htmlPrev },
    { name: 'Case D (PR + Previous)', html: htmlPRPrev },
    { name: 'Case E (Machine full)', html: htmlMachineFull },
    { name: 'Case F (Skipped card)', html: htmlSkipped },
  ];
  for (const { name, html } of renderedCases) {
    const renderedStart = html.indexOf('class="min-w-0 flex-1 space-y-1"');
    const renderedEnd = html.indexOf('class="glass-surface', renderedStart);
    assert.ok(renderedStart !== -1, `${name}: rendered metadata start marker must exist`);
    assert.ok(renderedEnd !== -1 && renderedEnd > renderedStart, `${name}: rendered metadata end marker must exist`);
    const renderedMeta = html.slice(renderedStart, renderedEnd);
    assert.doesNotMatch(renderedMeta, /\bpt-0\.5\b/, `${name} rendered metadata must not contain pt-0.5`);
    assert.doesNotMatch(renderedMeta, /\bpt-1\.5\b/, `${name} rendered metadata must not contain pt-1.5`);
  }
});

test('WORKOUT-UI-2: SetTable header aligns columns symmetrically with SetRow and machine profile button has updated proportions', () => {
  const tableHtml = table();
  const rowHtml = row();

  // 1. SetTable header grid structure and symmetry with SetRow
  // Header container must match SetRow's gap-1 and horizontal padding px-1.5
  assert.match(tableHtml, /<div class="grid grid-cols-12 items-center gap-1 px-1\.5 pb-1 text-center text-\[10px\] font-bold uppercase tracking-wider text-text-muted">/);
  assert.match(rowHtml, /<div class="[^"]*grid grid-cols-12 items-center gap-1 rounded-2xl p-1\.5[^"]*">/);

  // Assert canonical column spans matching SetRow [1, 4, 3, 2, 2]
  assert.deepEqual(
    [...tableHtml.matchAll(/class="col-span-(\d+) /g)].slice(0, 5).map(match => Number(match[1])),
    [1, 4, 3, 2, 2],
    'SetTable header must have column spans [1, 4, 3, 2, 2] matching SetRow'
  );

  // Column 1 (#): centered
  assert.match(tableHtml, /<div class="col-span-1 flex items-center justify-center"><span>#<\/span><\/div>/);

  // Column 2 (Weight): centered
  assert.match(tableHtml, /<div class="col-span-4 flex items-center justify-center text-center"><span class="truncate">PESO \(KG\)<\/span><\/div>/);

  // Column 3 (Reps): centered
  assert.match(tableHtml, /<div class="col-span-3 flex items-center justify-center text-center"><span>REPS<\/span><\/div>/);

  // Column 4 (RIR): centered
  assert.match(tableHtml, /<div class="col-span-2 flex items-center justify-center">/);

  // Column 5 (Completion): header check icon container matches SetRow's col-span-2 flex items-center justify-end pr-1
  assert.match(tableHtml, /<div class="col-span-2 flex items-center justify-end pr-1"><span class="flex size-11 items-center justify-center"><svg[^>]*class="[^"]*size-3\.5 text-accent/);
  assert.match(rowHtml, /<div class="col-span-2 flex items-center justify-end pr-1"><button[^>]*class="[^"]*flex size-11 items-center justify-center/);

  // 2. Machine Profile Button: updated proportions (min-h-12, px-2, py-1.5, gap-1)
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');
  assert.match(contents, /min-h-12 max-w-full items-center gap-1 rounded-ui-md border px-2 py-1\.5 text-\[11px\]/);

  // Rendered machine profile card assertions
  const machineCard = card(session(machine, { machineBaseResistanceStatus: 'unknown' }));
  assert.match(machineCard, /ui-control-surface inline-flex min-h-12 max-w-full items-center gap-1 rounded-ui-md border px-2 py-1\.5 text-\[11px\] font-semibold/);
  assert.match(machineCard, /Sin configurar/);
});
