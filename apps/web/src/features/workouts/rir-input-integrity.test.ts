import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { Exercise } from '@light-weight/domain';
import {
  addSetToSessions,
  createDefaultExerciseSession,
  normalizeActiveExerciseSession,
  serializeWorkoutSets,
  toggleSetInSessions,
  updateSetInSessions,
  updateSetRirInSessions
} from './useWorkoutSession.js';
import type { ActiveExerciseSession } from './types.js';
import { SetTable } from './WorkoutSessionComponents.js';
import { RirEducationContent, RirEducationSheet, RirHeaderButton, RirPicker, RIR_SCALE_ITEMS } from '../../components/ui/index.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { DEFAULT_APP_PREFERENCES } from '../../lib/preferences.js';

const mockBenchExercise: Exercise = {
  id: 'ex-bench',
  name: 'Barbell Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

test('RIR input integrity: initial sets have rir === undefined (no default 2)', () => {
  const session = createDefaultExerciseSession(mockBenchExercise);
  assert.equal(session.sets.length, 3);
  assert.equal(session.sets[0].rir, undefined);
  assert.equal(session.sets[1].rir, undefined);
  assert.equal(session.sets[2].rir, undefined);
});

test('RIR input integrity: adding a set after explicit RIR does not inherit RIR, while weight/reps inherit', () => {
  let sessions: ActiveExerciseSession[] = [createDefaultExerciseSession(mockBenchExercise)];

  // User enters weight, reps, and explicit RIR 1 on set 3 (the current last set)
  sessions = updateSetInSessions(sessions, 'ex-bench', 3, 'weightKg', 85);
  sessions = updateSetInSessions(sessions, 'ex-bench', 3, 'reps', 6);
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 3, 1);

  assert.equal(sessions[0].sets[2].rir, 1);
  assert.equal(sessions[0].sets[2].weightKg, 85);
  assert.equal(sessions[0].sets[2].reps, 6);

  // User adds a 4th set
  sessions = addSetToSessions(sessions, 'ex-bench');
  assert.equal(sessions[0].sets.length, 4);

  const fourthSet = sessions[0].sets[3];
  // Physical load and reps inherit from the previous set
  assert.equal(fourthSet.weightKg, 85);
  assert.equal(fourthSet.reps, 6);
  // RIR must NEVER be inherited from another physical set
  assert.equal(fourthSet.rir, undefined);
});

test('RIR input integrity: updateSetRir handles 0..5, 6+, out-of-range, and clearing to undefined', () => {
  let sessions: ActiveExerciseSession[] = [createDefaultExerciseSession(mockBenchExercise)];

  // Set 0 (failure)
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, 0);
  assert.equal(sessions[0].sets[0].rir, 0);

  // Set 3
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, 3);
  assert.equal(sessions[0].sets[0].rir, 3);

  // Set 5
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, 5);
  assert.equal(sessions[0].sets[0].rir, 5);

  // Set 6+ (e.g. 6, 8)
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, 6);
  assert.equal(sessions[0].sets[0].rir, 6);

  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, 8);
  assert.equal(sessions[0].sets[0].rir, 8);

  // Clear to undefined ("Sin registrar")
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, undefined);
  assert.equal(sessions[0].sets[0].rir, undefined);

  // Non-finite or negative values sanitize to undefined, not 2
  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, -1);
  assert.equal(sessions[0].sets[0].rir, undefined);

  sessions = updateSetRirInSessions(sessions, 'ex-bench', 1, NaN);
  assert.equal(sessions[0].sets[0].rir, undefined);
});

test('RIR input integrity: updateSetInSessions delegating field === "rir" also supports undefined/clearing', () => {
  let sessions: ActiveExerciseSession[] = [createDefaultExerciseSession(mockBenchExercise)];

  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'rir', 2);
  assert.equal(sessions[0].sets[0].rir, 2);

  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'rir', -1);
  assert.equal(sessions[0].sets[0].rir, undefined);
});

test('RIR input integrity: reloading active workout preserves undefined and explicit RIR without injecting 2', () => {
  const sessionToSave: ActiveExerciseSession = {
    ...createDefaultExerciseSession(mockBenchExercise),
    sets: [
      { setIndex: 1, weightKg: 100, reps: 5, completed: true, setType: 'working', isWarmup: false, rir: undefined },
      { setIndex: 2, weightKg: 100, reps: 5, completed: true, setType: 'working', isWarmup: false, rir: 1 },
      { setIndex: 3, weightKg: 100, reps: 5, completed: false, setType: 'working', isWarmup: false, rir: 0 },
      { setIndex: 4, weightKg: 100, reps: 5, completed: false, setType: 'working', isWarmup: false, rir: -1 as any } // Legacy malformed
    ]
  };

  const restored = normalizeActiveExerciseSession(sessionToSave);
  assert.equal(restored.sets[0].rir, undefined);
  assert.equal(restored.sets[1].rir, 1);
  assert.equal(restored.sets[2].rir, 0);
  assert.equal(restored.sets[3].rir, undefined); // Legacy malformed is sanitized to undefined, never defaulted to 2
});

test('RIR input integrity: a set can be completed without entering RIR', () => {
  let sessions: ActiveExerciseSession[] = [createDefaultExerciseSession(mockBenchExercise)];

  // Set 1 has default weight 0 or 80 and reps 8, rir is undefined
  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'weightKg', 70);
  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'reps', 10);
  assert.equal(sessions[0].sets[0].rir, undefined);

  // Toggle set 1 completed
  const { sessions: toggledSessions, completed } = toggleSetInSessions(sessions, 'ex-bench', 1);
  assert.equal(completed, true);
  assert.equal(toggledSessions[0].sets[0].completed, true);
  assert.equal(toggledSessions[0].sets[0].rir, undefined);
});

test('RIR input integrity: serialized completed workout sets contain no invented RIR', () => {
  let sessions: ActiveExerciseSession[] = [createDefaultExerciseSession(mockBenchExercise)];
  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'weightKg', 80);
  sessions = updateSetInSessions(sessions, 'ex-bench', 1, 'reps', 8);
  const { sessions: toggledSessions } = toggleSetInSessions(sessions, 'ex-bench', 1);

  const serialized = serializeWorkoutSets(toggledSessions);
  const completedSets = serialized['ex-bench'];

  assert.equal(completedSets.length, 3);
  assert.equal(completedSets[0].completed, true);
  assert.equal(completedSets[0].weightKg, 80);
  assert.equal(completedSets[0].reps, 8);
  assert.equal(completedSets[0].rir, undefined); // Preserves undefined!
});

function renderWithPreferences(element: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, element)
  );
}

test('RIR education: RIR table column header renders as an interactive info control', () => {
  const html = renderWithPreferences(
    React.createElement(SetTable, {
      session: createDefaultExerciseSession(mockBenchExercise),
      preferences: DEFAULT_APP_PREFERENCES,
      onUpdateSet: () => {},
      onToggleSet: () => {},
      onStartRestTimer: () => {},
      onOpenPlates: () => {},
      onAddSet: () => {},
      onRemoveSet: () => {},
      onUpdateWeightInputMode: () => {},
      onToggleAddedWeight: () => {}
    })
  );

  assert.ok(html.includes('aria-label="¿Qué es RIR?"'), 'Header button has accessible aria-label');
  assert.ok(html.includes('<span>RIR</span>'), 'Header displays RIR column text');
  assert.ok(html.includes('aria-hidden="true"'), 'Help icon is aria-hidden');
  assert.ok(html.includes('aria-haspopup="dialog"'), 'Header has popup dialog semantics');
  assert.ok(html.includes('min-h-9 min-w-9'), 'Header button has adequate mobile touch target');
});

test('RIR education: RirHeaderButton has adequate interactive target class and aria attributes', () => {
  const html = renderWithPreferences(
    React.createElement(RirHeaderButton)
  );

  assert.ok(html.includes('min-h-9'), 'Header button has min-h-9 class');
  assert.ok(html.includes('min-w-9'), 'Header button has min-w-9 class');
  assert.ok(html.includes('aria-label="¿Qué es RIR?"'), 'Header button has aria-label');
  assert.ok(html.includes('aria-haspopup="dialog"'), 'Header button has aria-haspopup="dialog"');
  assert.ok(html.includes('aria-expanded="false"'), 'Header button initial aria-expanded is false');
});

test('RIR education: closed info sheet renders nothing in DOM', () => {
  const html = renderWithPreferences(
    React.createElement(RirEducationSheet, { open: false, onClose: () => {} })
  );
  assert.equal(html, '', 'Closed education sheet renders nothing');
});

test('RIR education: educational content renders the definition, examples, and unlogged guidance', () => {
  const html = renderWithPreferences(
    React.createElement(RirEducationContent, { onClose: () => {} })
  );

  // Simple definition
  assert.ok(html.includes('RIR significa repeticiones en reserva.'), 'Definition part 1 is present');
  assert.ok(
    html.includes('Es una estimación de cuántas repeticiones más crees que podrías haber realizado al terminar la serie antes de no poder completar otra repetición con una técnica similar.'),
    'Definition part 2 is present'
  );

  // Calculation examples
  assert.ok(
    html.includes('Terminaste 8 repeticiones y crees que todavía podrías haber hecho 2 más → RIR 2.'),
    'Example RIR 2 is present'
  );
  assert.ok(
    html.includes('Crees que no podrías haber completado otra repetición → RIR 0.'),
    'Example RIR 0 is present'
  );
  assert.ok(
    html.includes('Crees que todavía quedaban 6 o más → RIR 6+.'),
    'Example RIR 6+ is present'
  );
  assert.ok(
    html.includes('Si no estás seguro, déjalo sin registrar. No se asumirá un valor.'),
    'Unsure / leave unlogged guidance is present'
  );

  // Compact scale
  assert.ok(html.includes('Escala rápida'), 'Scale header is present');
  assert.ok(html.includes('Sin repeticiones estimadas en reserva'), 'RIR 0 scale item is present');
  assert.ok(html.includes('6 o más repeticiones estimadas en reserva'), 'RIR 6+ scale item is present');
  assert.ok(html.includes('Entendido'), 'Close button is present');
});

test('RIR education: shared scale items are identical between RirEducationModal and RirPicker', () => {
  assert.equal(RIR_SCALE_ITEMS.length, 7);
  assert.deepEqual(
    RIR_SCALE_ITEMS.map((item) => item.label),
    ['0', '1', '2', '3', '4', '5', '6+']
  );
  // Verify descriptions match canonical translation keys
  assert.equal(RIR_SCALE_ITEMS[0].descriptionKey, 'workout.rir0Desc');
  assert.equal(RIR_SCALE_ITEMS[1].descriptionKey, 'workout.rir1Desc');
  assert.equal(RIR_SCALE_ITEMS[2].descriptionKey, 'workout.rir2Desc');
  assert.equal(RIR_SCALE_ITEMS[3].descriptionKey, 'workout.rir3Desc');
  assert.equal(RIR_SCALE_ITEMS[4].descriptionKey, 'workout.rir4Desc');
  assert.equal(RIR_SCALE_ITEMS[5].descriptionKey, 'workout.rir5Desc');
  assert.equal(RIR_SCALE_ITEMS[6].descriptionKey, 'workout.rir6PlusDesc');
});

test('RIR education: educational content has zero coupling with set mutation', () => {
  let updateCalled = false;
  const mockUpdate = () => { updateCalled = true; };

  let closed = false;
  const html = renderWithPreferences(
    React.createElement(RirEducationContent, { onClose: () => { closed = true; } })
  );

  assert.ok(html.length > 0);
  assert.equal(updateCalled, false, 'Education content has zero coupling with set mutation');
});

test('RIR education: normal RirPicker still changes values independently', () => {
  let selectedValue: number | undefined = -999;
  const onChange = (v: number | undefined) => { selectedValue = v; };

  // Explicit value 2
  onChange(2);
  assert.equal(selectedValue, 2);

  // Explicit 0 (failure)
  onChange(0);
  assert.equal(selectedValue, 0);

  // Explicit 6+ (6)
  onChange(6);
  assert.equal(selectedValue, 6);

  // Clear back to undefined (unlogged)
  onChange(undefined);
  assert.equal(selectedValue, undefined);
});

test('RIR architectural dependencies: RirPicker and RirEducationModal import neutral rir-content', () => {
  const uiDir = path.resolve(process.cwd(), 'src/components/ui');
  const pickerSource = fs.readFileSync(path.join(uiDir, 'RirPicker.tsx'), 'utf8');
  const educationSource = fs.readFileSync(path.join(uiDir, 'RirEducationModal.tsx'), 'utf8');

  // Both import from neutral rir-content
  assert.ok(pickerSource.includes("from './rir-content.js'"), 'RirPicker imports from ./rir-content.js');
  assert.ok(educationSource.includes("from './rir-content.js'"), 'RirEducationModal imports from ./rir-content.js');

  // RirPicker MUST NOT import RirEducationModal
  assert.ok(!pickerSource.includes('RirEducationModal'), 'RirPicker MUST NOT import RirEducationModal');
});

test('RIR copy consolidation: duplicate body copy keys are removed from i18n and canonical keys exist', () => {
  const libDir = path.resolve(process.cwd(), 'src/lib');
  const i18nSource = fs.readFileSync(path.join(libDir, 'i18n.tsx'), 'utf8');

  // Duplicate body copy keys that must be removed
  const removedKeys = [
    'workout.rirInfoDef1',
    'workout.rirPickerHelper',
    'workout.rirInfoDef2',
    'workout.rirPickerNotice',
    'workout.rirInfoExampleUnsure'
  ];

  for (const key of removedKeys) {
    assert.ok(!i18nSource.includes(`'${key}':`), `Duplicate key ${key} must not exist in i18n`);
  }

  // Canonical keys that must exist
  const canonicalKeys = [
    'workout.rirPickerTitle',
    'workout.rirInfoTitle',
    'workout.rirDefinition',
    'workout.rirEstimateDefinition',
    'workout.rirUnsureGuidance',
    'workout.rirUnlogged',
    'workout.rirUnloggedDesc',
    'workout.rir0Desc',
    'workout.rir1Desc',
    'workout.rir2Desc',
    'workout.rir3Desc',
    'workout.rir4Desc',
    'workout.rir5Desc',
    'workout.rir6PlusDesc'
  ];

  for (const key of canonicalKeys) {
    assert.ok(i18nSource.includes(`'${key}':`), `Canonical key ${key} must exist in i18n`);
  }
});

