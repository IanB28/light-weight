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
  assert.match(htmlBase, /<p class="truncate text-xs capitalize text-text-muted">/);
  assert.doesNotMatch(htmlBase, /text-warning">PR/);
  assert.doesNotMatch(htmlBase, /Anterior:/);

  // Case B: Exercise with PR only
  const htmlPR = card(session(exercise, { bestRecord: '100 kg × 5' }));
  assert.match(htmlPR, /<p class="text-xs font-semibold text-warning">\s*PR 100 kg × 5\s*<\/p>/);
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
  assert.match(htmlMachineFull, /ui-control-surface inline-flex min-h-11 w-full max-w-\[60%\] items-center/);

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

  // Column 2 (Weight): centered, allowing natural wrapping without truncation ellipsis
  assert.match(tableHtml, /<div class="col-span-4 flex items-center justify-center text-center"><span class="leading-tight text-center">PESO \(KG\)<\/span><\/div>/);

  // Column 2 Assisted loadMode: rendered with leading-tight text-center and strictly without truncate
  const assistedExercise: Exercise = {
    ...exercise,
    id: 'assisted-chin-up',
    name: 'Assisted Chin-up',
    category: 'machine',
    loading: {
      mechanism: 'selectorized',
      loadMode: 'assisted',
      supportsKeyboard: true,
      supportsPlates: false,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };
  const assistedTableHtml = table(session(assistedExercise));
  assert.match(assistedTableHtml, /<div class="col-span-4 flex items-center justify-center text-center"><span class="leading-tight text-center">Asistencia \(KG\)<\/span><\/div>/);
  assert.doesNotMatch(assistedTableHtml, /<div class="col-span-4 flex items-center justify-center text-center"><span class="truncate">/, 'SetTable weight header must not use truncate class to avoid clipping narrow labels');

  // Column 3 (Reps): centered
  assert.match(tableHtml, /<div class="col-span-3 flex items-center justify-center text-center"><span>REPS<\/span><\/div>/);

  // Column 4 (RIR): centered
  assert.match(tableHtml, /<div class="col-span-2 flex items-center justify-center">/);

  // Column 5 (Completion): header check icon container matches SetRow's col-span-2 flex items-center justify-end pr-1
  assert.match(tableHtml, /<div class="col-span-2 flex items-center justify-end pr-1"><span class="flex size-11 items-center justify-center"><svg[^>]*class="[^"]*size-3\.5 text-accent/);
  assert.match(rowHtml, /<div class="col-span-2 flex items-center justify-end pr-1"><button[^>]*class="[^"]*flex size-11 items-center justify-center/);

  // 2. Machine Profile Button: updated proportions (min-h-11, max-w-[60%])
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');
  assert.match(contents, /min-h-11 w-full max-w-\[60%\] items-center/);

  // Rendered machine profile card assertions
  const machineCard = card(session(machine, { machineBaseResistanceStatus: 'unknown' }));
  assert.match(machineCard, /ui-control-surface inline-flex min-h-11 w-full max-w-\[60%\] items-center/);
  assert.match(machineCard, /Sin configurar/);
});

test('WORKOUT-UI-3: ExerciseSessionCard metadata layout harmony, compact thumbnail anchor, and left-aligned machine CTA', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');

  // 1. Thumbnail anchors metadata with compact square sizing in both active and skipped flows
  assert.equal((contents.match(/flex size-14 shrink-0 items-center justify-center/g) ?? []).length, 2);

  // 2. Active metadata stack: position, title, muscle/category, PR, previous, machine CTA in left-aligned column
  const cardHtml = card(session(machine, { bestRecord: '100 kg × 5', previousRecord: '90 kg × 5', machineBaseResistanceStatus: 'unknown' }));
  const metaStart = cardHtml.indexOf('class="min-w-0 flex-1 space-y-1"');
  assert.ok(metaStart !== -1, 'Metadata stack container must exist');

  const titleIdx = cardHtml.indexOf('Plate-loaded chest press');
  const muscleIdx = cardHtml.indexOf('Pecho · Máquina');
  const prIdx = cardHtml.indexOf('PR 100 kg × 5');
  const prevIdx = cardHtml.indexOf('Anterior:');
  const machineIdx = cardHtml.indexOf('Sin configurar');

  assert.ok(titleIdx !== -1, 'Title must be present');
  assert.ok(muscleIdx !== -1, 'Muscle/equipment must be present');
  assert.ok(prIdx !== -1, 'PR must be present');
  assert.ok(prevIdx !== -1, 'Previous record must be present');
  assert.ok(machineIdx !== -1, 'Machine CTA must be present');

  // Assert vertical order: Title -> Muscle -> PR -> Previous -> Machine CTA
  assert.ok(titleIdx < muscleIdx, 'Title must precede muscle info');
  assert.ok(muscleIdx < prIdx, 'Muscle info must precede PR');
  assert.ok(prIdx < prevIdx, 'PR must precede previous record');
  assert.ok(prevIdx < machineIdx, 'Previous record must precede machine CTA');

  // 3. Compact machine CTA below metadata stack
  assert.match(cardHtml, /ui-control-surface inline-flex min-h-11 w-full max-w-\[60%\] items-center justify-center gap-1\.5 rounded-ui-md border px-3 py-2 text-xs font-semibold/);
});

test('WORKOUT-UI-3H: Exercise card composition matches product owner wireframe with Section A identity and Section B machine CTA', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');

  // 1. Strict 1:1 aspect ratio compact thumbnail sizing (size-14 min-[360px]:size-16) in active and skipped
  assert.equal((contents.match(/flex size-14 shrink-0 items-center justify-center[^"]*min-\[360px\]:size-16/g) ?? []).length, 2);

  // 2. Section B machine CTA rendered outside Section A flex container, left-aligned
  assert.match(contents, /<\/div>\s*<\/div>\s*\{isPlateMachine && \(\s*<div className="flex justify-start">[\s\S]*?className=\{`ui-focus-visible ui-control-surface inline-flex min-h-11 w-full max-w-\[60%\] items-center justify-center/);

  // 3. Rendered output verification with all wireframe elements
  const fullCard = card(session(machine, { bestRecord: '220 lb × 8', previousRecord: '220 lb × 7', machineBaseResistanceStatus: 'unknown' }));

  // Section A stack ordering: position/actions -> title -> muscle -> PR -> previous
  const metaStart = fullCard.indexOf('class="min-w-0 flex-1 space-y-1"');
  assert.ok(metaStart !== -1, 'Metadata stack container must exist');
  const posIdx = fullCard.indexOf('1 de 2', metaStart);
  const titleIdx = fullCard.indexOf('<h3', metaStart);
  const muscleIdx = fullCard.indexOf('Pecho · Máquina', metaStart);
  const prIdx = fullCard.indexOf('PR 220 lb × 8', metaStart);
  const prevIdx = fullCard.indexOf('Anterior:', metaStart);
  const machineIdx = fullCard.indexOf('Sin configurar', metaStart);

  assert.ok(posIdx !== -1 && titleIdx !== -1 && muscleIdx !== -1 && prIdx !== -1 && prevIdx !== -1 && machineIdx !== -1);
  assert.ok(posIdx < titleIdx, 'Position indicator must precede title');
  assert.ok(titleIdx < muscleIdx, 'Title must precede muscle');
  assert.ok(muscleIdx < prIdx, 'Muscle must precede dedicated PR row');
  assert.ok(prIdx < prevIdx, 'PR must precede previous record');
  assert.ok(prevIdx < machineIdx, 'Section A metadata must precede Section B machine CTA');

  // 4. Section B machine button styling & touch target
  assert.match(fullCard, /<div class="flex justify-start"><button[^>]*class="[^"]*min-h-11 w-full max-w-\[60%\] items-center justify-center gap-1\.5 rounded-ui-md border px-3 py-2 text-xs font-semibold[^"]*sm:max-w-\[280px\]/);
});

test('WORKOUT-UI-3V: Restores compact square thumbnail (56px / 64px max) and preserves wireframe hierarchy', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');

  // 1. Thumbnail strictly uses size-14 (56px) with min-[360px]:size-16 (64px) in active and skipped
  assert.equal((contents.match(/flex size-14 shrink-0 items-center justify-center[^"]*min-\[360px\]:size-16/g) ?? []).length, 2);

  // 2. Thumbnail never uses oversized classes (size-20, 72px, 80px, 88px, 96px)
  assert.equal((contents.match(/size-20|size-\[72px\]|size-\[80px\]|size-\[88px\]|size-\[96px\]/g) ?? []).length, 0);

  // 3. Thumbnail preserves square aspect ratio, object-contain, and technique preview
  assert.match(contents, /<ExerciseThumbnail exercise=\{exercise\} size="fill" className="border-0" \/>/);

  // 4. Section B machine CTA remains flush left and below Section A
  assert.match(contents, /<\/div>\s*<\/div>\s*\{isPlateMachine && \(\s*<div className="flex justify-start">/);
});

test('WORKOUT-UI-3A: Exercise identity layout eliminates empty action row, displays position indicator for single and multi-exercise, and anchors title directly below position', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');

  // 1. Grid structure separates metadata stack from action buttons in both active and skipped cards
  assert.equal((contents.match(/grid grid-cols-\[1fr_auto\] items-start gap-x-2/g) ?? []).length, 2);

  // 2. Single exercise renders position indicator (e.g. "1 de 1" in Spanish)
  const singleCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: session(exercise), exerciseIndex: 0, totalExercises: 1, preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: noop, onRemoveExercise: noop, onSkipExercise: noop,
      onResumeExercise: noop, onAddReplacement: noop, onUpdateSet: noop, onUpdateSetRir: noop,
      onToggleSet: noop, onStartRestTimer: noop, onOpenPlates: noop,
      onAddSet: noop, onRemoveSet: noop, onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop, onUpdateMachineProfile: noop
    }))
  );
  assert.match(singleCardHtml, /<p class="text-\[11px\] font-medium leading-tight text-text-muted">1 de 1<\/p>/);

  // 3. ExerciseSessionCard does not have a min-h-10 action row spacer forcing title down
  assert.doesNotMatch(singleCardHtml, /min-h-10 items-center justify-between/);

  // 4. Multi-exercise renders position indicator (e.g. "3 de 8")
  const multiCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: session(exercise), exerciseIndex: 2, totalExercises: 8, preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: noop, onRemoveExercise: noop, onSkipExercise: noop,
      onResumeExercise: noop, onAddReplacement: noop, onUpdateSet: noop, onUpdateSetRir: noop,
      onToggleSet: noop, onStartRestTimer: noop, onOpenPlates: noop,
      onAddSet: noop, onRemoveSet: noop, onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop, onUpdateMachineProfile: noop
    }))
  );
  assert.match(multiCardHtml, /<p class="text-\[11px\] font-medium leading-tight text-text-muted">3 de 8<\/p>/);

  // 5. Title appears directly below position indicator without an intermediate action button
  const posPos = multiCardHtml.indexOf('3 de 8');
  const titlePos = multiCardHtml.indexOf('<h3');
  assert.ok(posPos !== -1 && titlePos !== -1);
  assert.ok(posPos < titlePos);
  const intermediateHtml = multiCardHtml.slice(posPos, titlePos);
  assert.doesNotMatch(intermediateHtml, /<button|<IconButton/);

  // 6. Skipped exercise card consistency
  const skippedCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: session(exercise, { skipped: true }), exerciseIndex: 0, totalExercises: 1, preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: noop, onRemoveExercise: noop, onSkipExercise: noop,
      onResumeExercise: noop, onAddReplacement: noop, onUpdateSet: noop, onUpdateSetRir: noop,
      onToggleSet: noop, onStartRestTimer: noop, onOpenPlates: noop,
      onAddSet: noop, onRemoveSet: noop, onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop, onUpdateMachineProfile: noop
    }))
  );
  assert.match(skippedCardHtml, /<p class="text-\[11px\] font-medium leading-tight text-text-muted">1 de 1<\/p>/);
  assert.match(skippedCardHtml, /grid grid-cols-\[1fr_auto\] items-start gap-x-2/);

  // 7. Actions touch targets preserved (sm size = size-11 / 44px min-h)
  assert.match(singleCardHtml, /size-11 min-h-11/);
});

test('WORKOUT-UI-3AH: Prevents horizontal metadata compression and action-induced layout shifts', () => {
  const contents = source('features/workouts/WorkoutSessionComponents.tsx');

  // 1. Lower metadata stack (muscle, PR, previous) is placed outside the action grid in active and skipped cards
  // In both active and skipped cards, the grid only wraps position/title + actions
  const gridMatches = contents.match(/grid grid-cols-\[1fr_auto\] items-start gap-x-2/g) ?? [];
  assert.equal(gridMatches.length, 2, 'Exactly 2 action header grids must exist (active and skipped)');

  // 2. Active card renders muscle/equipment, PR, and previous record as siblings outside the header grid
  const activeCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: session(machine, { bestRecord: '220 lb × 8', previousRecord: '220 lb × 7' }),
      exerciseIndex: 0,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      mode: 'live',
      onViewTechnique: noop,
      onRemoveExercise: noop,
      onSkipExercise: noop,
      onResumeExercise: noop,
      onAddReplacement: noop,
      onUpdateSet: noop,
      onToggleSet: noop,
      onStartRestTimer: noop,
      onOpenPlates: noop,
      onAddSet: noop,
      onRemoveSet: noop,
      onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop,
      onUpdateMachineProfile: noop
    }))
  );

  // Isolate the header grid closing tag and verify lower metadata follows it
  const gridEndIdx = activeCardHtml.indexOf('</div><p class="truncate text-xs capitalize text-text-muted">');
  assert.ok(gridEndIdx !== -1, 'Muscle/equipment line must immediately follow the header grid closing tag');

  // Verify full hierarchy: position -> title -> actions in grid, then muscle -> PR -> previous outside grid
  const metaStart = activeCardHtml.indexOf('class="min-w-0 flex-1 space-y-1"');
  assert.ok(metaStart !== -1, 'Metadata stack container must exist');
  const posIdx = activeCardHtml.indexOf('1 de 2', metaStart);
  const titleIdx = activeCardHtml.indexOf('<h3', metaStart);
  const muscleIdx = activeCardHtml.indexOf('Pecho · Máquina', metaStart);
  const prIdx = activeCardHtml.indexOf('PR 220 lb × 8', metaStart);
  const prevIdx = activeCardHtml.indexOf('Anterior:', metaStart);
  const machineIdx = activeCardHtml.indexOf('Sin configurar', metaStart);

  assert.ok(posIdx !== -1 && titleIdx !== -1 && muscleIdx !== -1 && prIdx !== -1 && prevIdx !== -1 && machineIdx !== -1);
  assert.ok(posIdx < titleIdx, 'Position must precede title');
  assert.ok(titleIdx < muscleIdx, 'Title must precede muscle info');
  assert.ok(muscleIdx < prIdx, 'Muscle info must precede PR');
  assert.ok(prIdx < prevIdx, 'PR must precede previous record');
  assert.ok(prevIdx < machineIdx, 'Previous record must precede machine CTA');

  // 3. Action container reserves stable width (min-w-[5.75rem] / 92px) in live sessions to prevent layout shifts
  assert.match(contents, /min-w-\[5\.75rem\]/);
  assert.match(activeCardHtml, /min-w-\[5\.75rem\]/);

  // 4. When a set is completed (hasCompletedSets: true), Skip button is hidden but action container maintains stability
  const completedSession = session(machine, {
    bestRecord: '220 lb × 8',
    previousRecord: '220 lb × 7',
    sets: [
      { setIndex: 1, weightKg: 100, reps: 8, completed: true, setType: 'working' },
      { setIndex: 2, weightKg: 100, reps: 8, completed: false, setType: 'working' }
    ]
  });
  const completedCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: completedSession,
      exerciseIndex: 0,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      mode: 'live',
      onViewTechnique: noop,
      onRemoveExercise: noop,
      onSkipExercise: noop,
      onResumeExercise: noop,
      onAddReplacement: noop,
      onUpdateSet: noop,
      onToggleSet: noop,
      onStartRestTimer: noop,
      onOpenPlates: noop,
      onAddSet: noop,
      onRemoveSet: noop,
      onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop,
      onUpdateMachineProfile: noop
    }))
  );

  // Skip button must not be rendered when set 1 is completed
  assert.doesNotMatch(completedCardHtml, /aria-label="Saltar ejercicio/);
  // Remove button must still be rendered
  assert.match(completedCardHtml, /aria-label="Eliminar .* del entrenamiento"/);
  // Action container retains min-w-[5.75rem] to eliminate title reflow and card height shift
  assert.match(completedCardHtml, /min-w-\[5\.75rem\]/);

  // 5. In historical mode, Skip is not available and min-w-[5.75rem] is not forced
  const historicalCardHtml = renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(ExerciseSessionCard, {
      session: session(machine),
      exerciseIndex: 0,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      mode: 'historical',
      onViewTechnique: noop,
      onRemoveExercise: noop,
      onSkipExercise: noop,
      onResumeExercise: noop,
      onAddReplacement: noop,
      onUpdateSet: noop,
      onToggleSet: noop,
      onStartRestTimer: noop,
      onOpenPlates: noop,
      onAddSet: noop,
      onRemoveSet: noop,
      onUpdateWeightInputMode: noop,
      onToggleAddedWeight: noop,
      onUpdateMachineProfile: noop
    }))
  );
  assert.doesNotMatch(historicalCardHtml, /aria-label="Omitir ejercicio/);
  assert.match(historicalCardHtml, /aria-label="Eliminar .* del entrenamiento"/);
  assert.doesNotMatch(historicalCardHtml, /min-w-\[5\.75rem\]/);
});
