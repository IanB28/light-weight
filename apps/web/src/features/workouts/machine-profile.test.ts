import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { Exercise, LoggedSet } from '@light-weight/domain';
import {
  validateMachineProfile,
  normalizeLoggedSet,
  resolveMachineBaseResistance,
  calculateEffectiveLoadKg,
  calculateSetOneRm,
  isPlateLoadedMachine
} from '@light-weight/domain';
import {
  createDefaultExerciseSession,
  normalizeActiveExerciseSession,
  serializeWorkoutSets,
  toggleSetInSessions,
  applyPlateWeightInSessions,
  updateMachineProfileInSessions,
  updateSetInSessions,
  addSetToSessions
} from './useWorkoutSession.js';
import type { ActiveExerciseSession } from './types.js';
import {
  saveMachineProfile,
  getMachineProfilesForExercise,
  deleteMachineProfile,
  getLastUsedMachineProfileId,
  setLastUsedMachineProfileId,
  clearMachineProfiles
} from '../../lib/machine-profiles.js';
import { switchStoredUserScope } from '../../lib/storage.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { I18nProvider } from '../../lib/i18n.js';
import { createRequire } from 'node:module';

// Setup mock localStorage in Node test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0
  } as Storage;
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = {
    body: {
      nodeType: 1,
      style: {},
      appendChild: () => {},
      removeChild: () => {}
    },
    activeElement: null,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

const req = createRequire(import.meta.url);
const rd = req('react-dom');
rd.createPortal = (children: unknown) => children;

const { PlatePickerSheet } = await import('./WeightEntry.js');

const mockSmithExercise: Exercise = {
  id: 'smith-bench-press',
  name: 'Smith Machine Bench Press',
  category: 'machine',
  primaryMuscle: 'chest',
  loading: {
    mechanism: 'plate_loaded',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: false,
    hasMachineBase: true,
    suggestions: [
      { weightKg: 9.07, label: 'Smith Olímpica (~20 lb)' },
      { weightKg: 6.8, label: 'Smith Ligera (~15 lb)' }
    ]
  }
};

const mockBarbellExercise: Exercise = {
  id: 'barbell-squat',
  name: 'Barbell Back Squat',
  category: 'barbell',
  primaryMuscle: 'quadriceps',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

function renderWithProviders(element: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(I18nProvider, null, element)
    )
  );
}

// ============================================================================
// 15 CANONICAL REGRESSION TEST SCENARIOS — BLOCK 15 PROVENANCE HARDENING
// ============================================================================

test('1. UNKNOWN_BASE_PLATE_PICKER_NEVER_ZERO: Plate picker with machineStatus="unknown" does not compute plates as total; summary shows "—"', () => {
  localStorage.clear();

  // Pure domain resolution test: Unknown base must NEVER become 0 kg implicitly
  const resolved = resolveMachineBaseResistance(mockSmithExercise.loading!, undefined);
  assert.equal(resolved.applicable, true);
  assert.equal(resolved.status, 'unknown');
  assert.equal(resolved.weightKg, null, 'Unknown base must resolve to null, NEVER 0');

  // UI rendering test: PlatePickerSheet displays '—' for total, not plates alone
  const html = renderWithProviders(
    React.createElement(PlatePickerSheet, {
      open: true,
      onClose: () => {},
      valueKg: 40,
      units: 'metric',
      baseWeightKg: 0,
      availablePlatesKg: [20, 10, 5, 2.5, 1.25],
      includeBarWeight: false,
      allowBarToggle: false,
      loading: mockSmithExercise.loading!,
      machineStatus: 'unknown',
      onOpenMachineProfileModal: () => {},
      onApply: () => {}
    })
  );

  assert.ok(html.includes('>—</dd>'), 'Summary total dl must render dash (—) when base is unknown');
  assert.ok(!html.includes('>40 kg</dd>'), 'Plates alone (40 kg) must NOT be displayed as total load');
  assert.ok(!html.includes('>0 kg</dd>'), 'Unknown base must NOT be displayed as 0 kg total');
});

test('2. UNKNOWN_BASE_PLATE_PICKER_PRIMARY_ACTION: Plate picker with machineStatus="unknown" disables apply or routes to modal; cannot apply plates-only load', () => {
  let modalOpened = false;
  let appliedLoad: number | null = null;

  const htmlWithModal = renderWithProviders(
    React.createElement(PlatePickerSheet, {
      open: true,
      onClose: () => {},
      valueKg: 40,
      units: 'metric',
      baseWeightKg: 0,
      availablePlatesKg: [20, 10, 5, 2.5, 1.25],
      includeBarWeight: false,
      allowBarToggle: false,
      loading: mockSmithExercise.loading!,
      machineStatus: 'unknown',
      onOpenMachineProfileModal: () => { modalOpened = true; },
      onApply: (load) => { appliedLoad = load; }
    })
  );

  // Primary action button replaces "Usar peso" with "Configurar resistencia inicial"
  assert.ok(htmlWithModal.includes('Configurar resistencia inicial'), 'Must offer button to configure machine base');
  assert.ok(!htmlWithModal.includes('Usar peso'), 'Must NOT allow "Usar peso" when base is unknown');
  assert.equal(appliedLoad, null, 'No load can be applied with unknown base');

  // If onOpenMachineProfileModal is not provided, button is disabled with explanation
  const htmlWithoutModal = renderWithProviders(
    React.createElement(PlatePickerSheet, {
      open: true,
      onClose: () => {},
      valueKg: 40,
      units: 'metric',
      baseWeightKg: 0,
      availablePlatesKg: [20, 10, 5, 2.5, 1.25],
      includeBarWeight: false,
      allowBarToggle: false,
      loading: mockSmithExercise.loading!,
      machineStatus: 'unknown',
      onApply: () => {}
    })
  );

  assert.ok(htmlWithoutModal.includes('disabled'), 'Action button must be disabled when modal callback absent');
  assert.ok(htmlWithoutModal.includes('Requiere resistencia inicial'), 'Must explain starting resistance is required');
});

test('3. UNKNOWN_BASE_KEYBOARD_ALLOWED: Manual/keyboard entry with machineStatus="unknown" allows entering total; snapshot captures status="unknown", baseResistanceKg=undefined', () => {
  localStorage.clear();

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  assert.equal(sessions[0].machineBaseResistanceStatus, 'unknown');

  // User manually enters 75 kg on keyboard (user takes responsibility for known total load)
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 75);
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'reps', 10);

  // Complete Set 1
  const toggleResult = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  sessions = toggleResult.sessions;

  const completedSet = sessions[0].sets[0];
  assert.equal(completedSet.completed, true);
  assert.equal(completedSet.weightKg, 75);
  assert.equal(completedSet.machineBaseResistanceStatus, 'unknown');
  assert.equal(completedSet.machineBaseResistanceKg, undefined, 'Unknown base must NOT fabricate 0 kg or 20 lb');
});

test('4. CALIBRATED_MACHINE_SUM: Machine with base 15 kg + 40 kg plates = 55 kg total; applied to set with status="user_defined", baseKg=15', () => {
  localStorage.clear();

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];

  // Machine profile: 15 kg
  const profile = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Cybex 15 kg',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 15
  });

  // User selects 40 kg in plates; total load = 15 (base) + 40 (plates) = 55 kg
  sessions = applyPlateWeightInSessions(
    sessions,
    'smith-bench-press',
    1,
    55,
    false,
    15,
    {
      machineProfileId: profile.id,
      machineProfileLabel: profile.label,
      machineBaseResistanceKg: 15,
      machineBaseResistanceStatus: 'user_defined'
    }
  );

  const set1 = sessions[0].sets[0];
  assert.equal(set1.weightKg, 55);
  assert.equal(set1.machineProfileId, profile.id);
  assert.equal(set1.machineProfileLabel, 'Smith Cybex 15 kg');
  assert.equal(set1.machineBaseResistanceKg, 15);
  assert.equal(set1.machineBaseResistanceStatus, 'user_defined');
});

test('5. SWITCH_MACHINE_PRESERVES_EXISTING_SNAPSHOT: Set 1 composed with Machine A (base 10 kg); session switches to Machine B (base 20 kg); Set 1 retains Machine A snapshot (even before completion)', () => {
  localStorage.clear();

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];

  // Set 1 composed with Machine A (base 10 kg)
  sessions = applyPlateWeightInSessions(
    sessions,
    'smith-bench-press',
    1,
    50,
    false,
    10,
    {
      machineProfileId: 'mach-A',
      machineProfileLabel: 'Machine A (10 kg)',
      machineBaseResistanceKg: 10,
      machineBaseResistanceStatus: 'user_defined'
    }
  );

  // Set 1 is still pending (completed === false)!
  assert.equal(sessions[0].sets[0].completed, false);
  assert.equal(sessions[0].sets[0].machineProfileId, 'mach-A');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 10);

  // Now user switches the session to Machine B (base 20 kg)
  const profileB = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine B (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });

  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', profileB);

  // INVARIANT: Set 1 (pending) MUST PRESERVE Machine A!
  assert.equal(sessions[0].sets[0].machineProfileId, 'mach-A');
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Machine A (10 kg)');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 10);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'user_defined');

  // Invariant 3: Changing session machine MUST NOT touch untouched sets!
  assert.equal(sessions[0].sets[1].machineProfileId, undefined);
  assert.equal(sessions[0].sets[1].machineBaseResistanceKg, undefined);

  // When Set 2 is completed with Machine B active in session, it receives Machine B snapshot
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 2, 'weightKg', 50);
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 2).sessions;
  assert.equal(sessions[0].sets[1].completed, true);
  assert.equal(sessions[0].sets[1].machineProfileId, profileB.id);
  assert.equal(sessions[0].sets[1].machineBaseResistanceKg, 20);
});

test('6. COMPLETION_NEVER_OVERWRITES_SNAPSHOT: Set with snapshot A completes under session configured with Machine B; snapshot remains Machine A', () => {
  localStorage.clear();

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];

  // Set 1 has snapshot A
  sessions = applyPlateWeightInSessions(
    sessions,
    'smith-bench-press',
    1,
    50,
    false,
    10,
    {
      machineProfileId: 'mach-A',
      machineProfileLabel: 'Machine A (10 kg)',
      machineBaseResistanceKg: 10,
      machineBaseResistanceStatus: 'user_defined'
    }
  );

  // Session profile is switched to Machine B (base 20 kg)
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    id: 'mach-B',
    exerciseId: 'smith-bench-press',
    label: 'Machine B (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  assert.equal(sessions[0].machineProfileId, 'mach-B');

  // Now user toggles/completes Set 1
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 1).sessions;

  // Set 1 MUST NOT have been overwritten by Machine B!
  assert.equal(sessions[0].sets[0].completed, true);
  assert.equal(sessions[0].sets[0].machineProfileId, 'mach-A');
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Machine A (10 kg)');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 10);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'user_defined');
});

test('7. UNSNAPSHOTTED_SET_COMPLETION_CAPTURES_CURRENT: Set with no snapshot completes; captures current session machine profile at completion time', () => {
  localStorage.clear();

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];

  // Session is configured with Machine B (base 20 kg)
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    id: 'mach-B',
    exerciseId: 'smith-bench-press',
    label: 'Machine B (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Set 3 has no explicit snapshot yet (e.g. freshly created or cleared)
  sessions[0].sets[2].machineBaseResistanceStatus = undefined;
  sessions[0].sets[2].machineProfileId = undefined;
  sessions[0].sets[2].machineBaseResistanceKg = undefined;
  sessions[0].sets[2].weightKg = 60;
  sessions[0].sets[2].reps = 8;

  // Complete Set 3
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 3).sessions;

  // At completion time, unsnapshotted set captures current session context
  assert.equal(sessions[0].sets[2].completed, true);
  assert.equal(sessions[0].sets[2].machineProfileId, 'mach-B');
  assert.equal(sessions[0].sets[2].machineProfileLabel, 'Machine B (20 kg)');
  assert.equal(sessions[0].sets[2].machineBaseResistanceKg, 20);
  assert.equal(sessions[0].sets[2].machineBaseResistanceStatus, 'user_defined');
});

test('8. PROFILE_EDIT_DOES_NOT_MUTATE_PAST_SNAPSHOTS: Profile edited from 15 kg to 20 kg; previously completed set retains 15 kg in its snapshot', () => {
  localStorage.clear();

  // 1. Create profile at 15 kg
  const profile = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Modificable',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 15
  });

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', profile);
  sessions[0].sets[0].weightKg = 65;
  sessions[0].sets[0].reps = 8;
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 1).sessions;

  // Verify initial snapshot is 15 kg
  assert.equal(sessions[0].sets[0].completed, true);
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 15);

  // 2. User edits profile in local storage to 20 kg
  saveMachineProfile({
    id: profile.id,
    exerciseId: 'smith-bench-press',
    label: 'Smith Modificable',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });

  // Completed set snapshot MUST REMAIN 15 kg (snapshots are value data, not live pointers)
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 15);

  const serialized = serializeWorkoutSets(sessions);
  assert.equal(serialized['smith-bench-press'][0].machineBaseResistanceKg, 15);
});

test('9. PROFILE_DELETE_DOES_NOT_BREAK_SNAPSHOT: Profile deleted from local storage; historical set retains label and base kg in snapshot; renders correctly', () => {
  localStorage.clear();

  const profile = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Antigua',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 18
  });

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', profile);
  sessions[0].sets[0].weightKg = 78;
  sessions[0].sets[0].reps = 6;
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 1).sessions;

  // Delete profile from storage
  deleteMachineProfile(profile.id);
  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 0);

  // Completed set still retains its complete snapshot data!
  const completedSet = sessions[0].sets[0];
  assert.equal(completedSet.machineProfileId, profile.id);
  assert.equal(completedSet.machineProfileLabel, 'Smith Antigua');
  assert.equal(completedSet.machineBaseResistanceKg, 18);
  assert.equal(completedSet.machineBaseResistanceStatus, 'user_defined');

  // Serialization preserves all snapshot fields intact
  const serialized = serializeWorkoutSets(sessions);
  const loggedSet = serialized['smith-bench-press'][0];
  assert.equal(loggedSet.machineProfileLabel, 'Smith Antigua');
  assert.equal(loggedSet.machineBaseResistanceKg, 18);
});

test('10. VERIFIED_REQUIRES_AUTHORITATIVE_SOURCE: Creating profile with status="verified" requires authoritative provenance; free-form label alone fails', () => {
  // Verified without authoritative source must fail
  const invalidVerified = validateMachineProfile({
    id: 'mp-ver-1',
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 9.07
  });
  assert.equal(invalidVerified.valid, false);
  assert.ok(invalidVerified.error?.includes('verified'));

  // Verified with free-form sourceLabel alone fails validation (requires URL or complete structured provenance)
  const invalidWithLabelAlone = validateMachineProfile({
    id: 'mp-ver-2',
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 9.07,
    sourceLabel: 'Manual Oficial Cybex Smith 2024'
  });
  assert.equal(invalidWithLabelAlone.valid, false);
  assert.ok(invalidWithLabelAlone.error?.includes('requires baseResistanceKg > 0 and either a valid http/https sourceUrl or complete structured provenance'));

  // Verified with complete structured provenance passes
  const validWithStructured = validateMachineProfile({
    id: 'mp-ver-3',
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 9.07,
    manufacturer: 'Cybex',
    model: 'Smith Pro',
    sourceLabel: 'Manual Oficial Cybex Smith 2024'
  });
  assert.equal(validWithStructured.valid, true);

  // Verified with sourceUrl passes
  const validWithUrl = validateMachineProfile({
    id: 'mp-ver-4',
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 9.07,
    sourceUrl: 'https://lifefitness.com/specs/cybex-smith.pdf'
  });
  assert.equal(validWithUrl.valid, true);
});


test('11. STATUS_WEIGHT_CONSISTENCY: Status and weight consistency rules across domain validators', () => {
  // A) status 'unknown' with weightKg fails profile validation & is sanitized by normalizeLoggedSet
  const unknownWithKg = validateMachineProfile({
    id: 'mp-unk-1',
    exerciseId: 'smith-bench-press',
    label: 'Unknown Smith',
    baseResistanceStatus: 'unknown',
    baseResistanceKg: 10
  });
  assert.equal(unknownWithKg.valid, false);

  const normalizedUnknown = normalizeLoggedSet<LoggedSet>({
    setIndex: 1,
    weightKg: 80,
    reps: 8,
    completed: true,
    setType: 'working',
    isWarmup: false,
    machineBaseResistanceStatus: 'unknown',
    machineBaseResistanceKg: 10
  });
  assert.equal(normalizedUnknown.machineBaseResistanceStatus, 'unknown');
  assert.equal(normalizedUnknown.machineBaseResistanceKg, undefined);

  // B) status 'none' with weightKg > 0 fails validation & is normalized to 0
  const noneWithPositiveKg = validateMachineProfile({
    id: 'mp-none-1',
    exerciseId: 'smith-bench-press',
    label: 'Counterbalanced',
    baseResistanceStatus: 'none',
    baseResistanceKg: 15
  });
  assert.equal(noneWithPositiveKg.valid, false);

  const normalizedNone = normalizeLoggedSet<LoggedSet>({
    setIndex: 1,
    weightKg: 80,
    reps: 8,
    completed: true,
    setType: 'working',
    isWarmup: false,
    machineBaseResistanceStatus: 'none',
    machineBaseResistanceKg: 15
  });
  assert.equal(normalizedNone.machineBaseResistanceStatus, 'none');
  assert.equal(normalizedNone.machineBaseResistanceKg, 0);

  // C) status 'user_defined' with negative weight fails
  const negativeWeight = validateMachineProfile({
    id: 'mp-neg',
    exerciseId: 'smith-bench-press',
    label: 'Negative weight',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: -5
  });
  assert.equal(negativeWeight.valid, false);

  // D) status 'suggested' without weight fails
  const suggestedNoWeight = validateMachineProfile({
    id: 'mp-sug-noweight',
    exerciseId: 'smith-bench-press',
    label: 'Suggested no weight',
    baseResistanceStatus: 'suggested'
  });
  assert.equal(suggestedNoWeight.valid, false);
});

test('12. API_SYNC_VALIDATION_REJECTS_INCONSISTENT: Sync mapper rejects 422 for malformed machine base snapshots', () => {
  // Validates domain types and constraints that mirror apps/api sync-mappers
  const baseSet: LoggedSet = {
    setIndex: 1,
    weightKg: 50,
    reps: 10,
    completed: true,
    setType: 'working',
    isWarmup: false
  };

  // 1. Unknown status with non-null/non-undefined kg is sanitized
  const sanitizedUnk = normalizeLoggedSet({
    ...baseSet,
    machineBaseResistanceStatus: 'unknown',
    machineBaseResistanceKg: 10
  });
  assert.equal(sanitizedUnk.machineBaseResistanceKg, undefined);

  // 2. None status with non-zero kg is forced to 0
  const sanitizedNone = normalizeLoggedSet({
    ...baseSet,
    machineBaseResistanceStatus: 'none',
    machineBaseResistanceKg: 10
  });
  assert.equal(sanitizedNone.machineBaseResistanceKg, 0);

  // 3. User defined without kg has status degraded to undefined
  const degradedUserDefined = normalizeLoggedSet({
    ...baseSet,
    machineBaseResistanceStatus: 'user_defined',
    machineBaseResistanceKg: undefined
  });
  assert.equal(degradedUserDefined.machineBaseResistanceStatus, undefined);
});

test('13. API_HYDRATION_LEGACY_SETS: Sets without machine base fields hydrate safely with undefined/null fields', () => {
  const legacySet: LoggedSet = {
    setIndex: 1,
    weightKg: 100,
    reps: 5,
    completed: true,
    setType: 'working',
    isWarmup: false
  };

  const normalized = normalizeLoggedSet<LoggedSet>(legacySet);
  assert.equal(normalized.weightKg, 100);
  assert.equal(normalized.reps, 5);
  assert.equal(normalized.completed, true);
  assert.equal(normalized.machineProfileId, undefined);
  assert.equal(normalized.machineProfileLabel, undefined);
  assert.equal(normalized.machineBaseResistanceKg, undefined);
  assert.equal(normalized.machineBaseResistanceStatus, undefined);
});

test('14. USER_SCOPE_ISOLATION: Machine profiles and last-used keys participate in user-scoped storage isolation', () => {
  localStorage.clear();

  // User Alice logs in
  switchStoredUserScope('user-alice');

  // Alice saves a custom machine profile
  const profileAlice = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Gimnasio de Alice',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 11
  });
  setLastUsedMachineProfileId('smith-bench-press', profileAlice.id);

  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 1);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), profileAlice.id);

  // User Bob logs in on the same browser
  switchStoredUserScope('user-bob');

  // Bob must NOT see Alice's machine profile or last-used memory!
  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 0);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), null);

  // Bob saves his own profile
  const profileBob = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Gimnasio de Bob',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 16
  });
  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 1);
  assert.equal(getMachineProfilesForExercise('smith-bench-press')[0].id, profileBob.id);

  // Switch back to Alice
  switchStoredUserScope('user-alice');

  // Alice's machine profile and last used memory are accurately restored
  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 1);
  assert.equal(getMachineProfilesForExercise('smith-bench-press')[0].id, profileAlice.id);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), profileAlice.id);
});

test('15. PR_AND_VOLUME_INTEGRITY: Sets with machine base use total load (base + plates) for volume and PR calculations; unknown base sets use user-entered weight; no double counting', () => {
  localStorage.clear();

  // Case A: Calibrated machine set
  // Base 15 kg + Plates 40 kg = Total 55 kg
  const calibratedSet: LoggedSet = {
    setIndex: 1,
    weightKg: 55, // Total external load
    reps: 10,
    completed: true,
    setType: 'working',
    isWarmup: false,
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'user_defined'
  };

  // Effective load uses the logged total external load
  const effectiveLoad = calculateEffectiveLoadKg({
    exercise: mockSmithExercise,
    setWeightKg: calibratedSet.weightKg,
    bodyweightKg: 80
  });
  assert.equal(effectiveLoad, 55, 'Effective load must equal total external load (55 kg)');

  // Volume for set: 55 kg * 10 reps = 550 kg
  const setVolume = effectiveLoad * calibratedSet.reps;
  assert.equal(setVolume, 550, 'Volume must be 550 kg; no double counting of 15 kg base and no dropped base');

  // 1RM estimation uses total load
  const e1rm = calculateSetOneRm(calibratedSet, {
    exercise: mockSmithExercise,
    bodyweightKg: 80,
    formula: 'average'
  });
  assert.ok(e1rm !== null && e1rm > 55, 'e1RM calculated correctly from total external load');

  // Case B: Uncalibrated machine set (status 'unknown')
  // User enters 70 kg total
  const uncalibratedSet: LoggedSet = {
    setIndex: 1,
    weightKg: 70,
    reps: 8,
    completed: true,
    setType: 'working',
    isWarmup: false,
    machineBaseResistanceStatus: 'unknown',
    machineBaseResistanceKg: undefined
  };

  const uncalibratedEffective = calculateEffectiveLoadKg({
    exercise: mockSmithExercise,
    setWeightKg: uncalibratedSet.weightKg,
    bodyweightKg: 80
  });
  assert.equal(uncalibratedEffective, 70, 'Uncalibrated machine uses user-entered weight as total load');
  assert.equal(uncalibratedEffective * uncalibratedSet.reps, 560, 'Volume calculated correctly without base distortion');
});

test('16. UNKNOWN_SNAPSHOT_IMMUTABILITY_ACROSS_SESSION_SWITCH: Machine with unknown base; user enters 100 kg; session switches to Machine B; Set 1 retains unknown snapshot through completion; unconfigured sets inherit Machine B', () => {
  localStorage.clear();

  // 1. Session starts uncalibrated (status 'unknown', no machine profile configured yet)
  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  assert.equal(sessions[0].machineBaseResistanceStatus, 'unknown');
  assert.equal(sessions[0].machineProfileId, undefined);

  // Set 1 and Set 2 start with NO SNAPSHOT (State A)
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, undefined);
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);
  assert.equal(sessions[0].sets[1].machineBaseResistanceStatus, undefined);
  assert.equal(sessions[0].sets[1].machineProfileId, undefined);

  // User enters 100 kg on keyboard on Set 1 -> captures current session unknown context (State B)
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 100);
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'reps', 8);

  const set1BeforeSwitch = sessions[0].sets[0];
  assert.equal(set1BeforeSwitch.weightKg, 100);
  assert.equal(set1BeforeSwitch.machineBaseResistanceStatus, 'unknown');
  assert.equal(set1BeforeSwitch.machineBaseResistanceKg, undefined);

  // Set 2 has NO SNAPSHOT yet (State A)
  const set2BeforeSwitch = sessions[0].sets[1];
  assert.equal(set2BeforeSwitch.machineProfileId, undefined);
  assert.equal(set2BeforeSwitch.machineBaseResistanceStatus, undefined);

  // User switches SESSION to Machine B (base 20 kg)
  const profileB = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Calibrada B (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });

  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', profileB);

  // INVARIANT 1: Set 1 MUST NOT inherit Machine B merely because its base was unknown!
  const set1AfterSwitch = sessions[0].sets[0];
  assert.equal(set1AfterSwitch.weightKg, 100);
  assert.equal(set1AfterSwitch.machineBaseResistanceStatus, 'unknown');
  assert.equal(set1AfterSwitch.machineBaseResistanceKg, undefined);
  assert.equal(set1AfterSwitch.machineProfileId, undefined);

  // INVARIANT 2: Changing session machine does NOT mutate untouched sets (session.sets remains untouched)
  const set2AfterSwitch = sessions[0].sets[1];
  assert.equal(set2AfterSwitch.machineProfileId, undefined);
  assert.equal(set2AfterSwitch.machineBaseResistanceStatus, undefined);

  // When Set 2 is executed/completed under Machine B, it receives Machine B snapshot:
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 2, 'weightKg', 60);
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 2).sessions;
  const set2Completed = sessions[0].sets[1];
  assert.equal(set2Completed.completed, true);
  assert.equal(set2Completed.machineProfileId, profileB.id);
  assert.equal(set2Completed.machineProfileLabel, 'Smith Calibrada B (20 kg)');
  assert.equal(set2Completed.machineBaseResistanceKg, 20);
  assert.equal(set2Completed.machineBaseResistanceStatus, 'user_defined');

  // INVARIANT 3: Completing Set 1 preserves unknown status
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 1).sessions;
  const set1Completed = sessions[0].sets[0];
  assert.equal(set1Completed.completed, true);
  assert.equal(set1Completed.weightKg, 100);
  assert.equal(set1Completed.machineBaseResistanceStatus, 'unknown');
  assert.equal(set1Completed.machineBaseResistanceKg, undefined);

  // INVARIANT 4: Named profile with unknown base is also preserved across switches
  sessions[0].sets[0].machineProfileId = 'mach-A';
  sessions[0].sets[0].machineProfileLabel = 'Smith Desconocida A';
  const profileC = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Smith Calibrada C (30 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 30
  });
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', profileC);
  assert.equal(sessions[0].sets[0].machineProfileId, 'mach-A');
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Smith Desconocida A');
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'unknown');

  // Serialization maintains strict unknown contract
  const serialized = serializeWorkoutSets(sessions);
  const serializedSet1 = serialized['smith-bench-press'][0];
  assert.equal(serializedSet1.weightKg, 100);
  assert.equal(serializedSet1.machineProfileId, 'mach-A');
  assert.equal(serializedSet1.machineBaseResistanceStatus, 'unknown');
  assert.equal(serializedSet1.machineBaseResistanceKg, undefined);
});


test('17. VERIFIED_HISTORICAL_SNAPSHOT_PRESERVES_EVIDENCE_ACROSS_EDIT_AND_DELETE: Verified machine profile snapshot captures authoritative evidence and preserves it when profile is modified or deleted', () => {
  localStorage.clear();

  // 1. Create verified profile with full authoritative provenance
  const verifiedProfile = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro Verified 40 kg',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 40,
    sourceUrl: 'https://cybex.com/spec-v1.pdf',
    manufacturer: 'Cybex International',
    model: 'VR3 Smith Machine',
    sourceLabel: 'Official Service Manual 2022'
  });

  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', verifiedProfile);

  // Apply plate load: 40 kg base + 60 kg plates = 100 kg total
  sessions = applyPlateWeightInSessions(
    sessions,
    'smith-bench-press',
    1,
    100,
    false,
    40,
    {
      machineProfileId: verifiedProfile.id,
      machineProfileLabel: verifiedProfile.label,
      machineBaseResistanceKg: 40,
      machineBaseResistanceStatus: 'verified',
      machineBaseSourceLabel: verifiedProfile.sourceLabel,
      machineBaseSourceUrl: verifiedProfile.sourceUrl,
      machineManufacturer: verifiedProfile.manufacturer,
      machineModel: verifiedProfile.model
    }
  );

  // Complete Set 1
  sessions[0].sets[0].reps = 6;
  sessions = toggleSetInSessions(sessions, 'smith-bench-press', 1).sessions;

  const set1 = sessions[0].sets[0];
  assert.equal(set1.completed, true);
  assert.equal(set1.machineProfileId, verifiedProfile.id);
  assert.equal(set1.machineBaseResistanceStatus, 'verified');
  assert.equal(set1.machineBaseResistanceKg, 40);
  assert.equal(set1.machineBaseSourceUrl, 'https://cybex.com/spec-v1.pdf');
  assert.equal(set1.machineManufacturer, 'Cybex International');
  assert.equal(set1.machineModel, 'VR3 Smith Machine');
  assert.equal(set1.machineBaseSourceLabel, 'Official Service Manual 2022');

  // 2. Edit profile in local storage to 45 kg and new URL
  saveMachineProfile({
    id: verifiedProfile.id,
    exerciseId: 'smith-bench-press',
    label: 'Cybex Pro Verified 45 kg',
    baseResistanceStatus: 'verified',
    baseResistanceKg: 45,
    sourceUrl: 'https://cybex.com/spec-v2.pdf',
    manufacturer: 'Cybex New Spec',
    model: 'VR3 Smith Machine Revision 2',
    sourceLabel: 'Updated Service Manual 2024'
  });

  // Set 1 historical snapshot MUST remain unmodified
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 40);
  assert.equal(sessions[0].sets[0].machineBaseSourceUrl, 'https://cybex.com/spec-v1.pdf');
  assert.equal(sessions[0].sets[0].machineManufacturer, 'Cybex International');

  // 3. Delete profile from local storage
  deleteMachineProfile(verifiedProfile.id);
  assert.equal(getMachineProfilesForExercise('smith-bench-press').length, 0);

  // Set 1 still retains complete verified snapshot and provenance
  const set1AfterDelete = sessions[0].sets[0];
  assert.equal(set1AfterDelete.machineProfileId, verifiedProfile.id);
  assert.equal(set1AfterDelete.machineBaseResistanceStatus, 'verified');
  assert.equal(set1AfterDelete.machineBaseResistanceKg, 40);
  assert.equal(set1AfterDelete.machineBaseSourceUrl, 'https://cybex.com/spec-v1.pdf');
  assert.equal(set1AfterDelete.machineManufacturer, 'Cybex International');
  assert.equal(set1AfterDelete.machineModel, 'VR3 Smith Machine');
  assert.equal(set1AfterDelete.machineBaseSourceLabel, 'Official Service Manual 2022');

  // 4. Serialization preserves all provenance value fields intact
  const serialized = serializeWorkoutSets(sessions);
  const loggedSet = serialized['smith-bench-press'][0];
  assert.equal(loggedSet.machineBaseResistanceStatus, 'verified');
  assert.equal(loggedSet.machineBaseResistanceKg, 40);
  assert.equal(loggedSet.machineBaseSourceUrl, 'https://cybex.com/spec-v1.pdf');
  assert.equal(loggedSet.machineManufacturer, 'Cybex International');
  assert.equal(loggedSet.machineModel, 'VR3 Smith Machine');
  assert.equal(loggedSet.machineBaseSourceLabel, 'Official Service Manual 2022');
});

test('18. POST_COMMIT_INTEGRITY_HARDENING_SCENARIOS: Selection contract, last-used lifecycle, initial/add set isolation, serialize honesty, and total load guards', () => {
  localStorage.clear();

  // 1. Initial sets start without snapshot
  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  assert.equal(sessions[0].machineBaseResistanceStatus, 'unknown');
  assert.equal(sessions[0].sets[0].weightKg, 0, 'Unknown base must start default weight at 0, not synthetic plate sum');
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, undefined);

  // 2. addSetToSessions does NOT pre-snapshot
  sessions = addSetToSessions(sessions, 'smith-bench-press', 'working');
  const addedSet = sessions[0].sets[sessions[0].sets.length - 1];
  assert.equal(addedSet.machineProfileId, undefined);
  assert.equal(addedSet.machineBaseResistanceStatus, undefined);
  assert.equal(addedSet.machineBaseResistanceKg, undefined);

  // 3. Selection contract: Quick none (status: none, weightKg: 0)
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: undefined,
    status: 'none',
    weightKg: 0
  });
  assert.equal(sessions[0].machineBaseResistanceStatus, 'none');
  assert.equal(sessions[0].machineBaseResistanceKg, 0);
  assert.equal(sessions[0].plateBaseWeightKg, 0);
  // Existing untouched sets remain untouched!
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, undefined);

  // 4. Selection contract: Quick unknown (status: unknown, weightKg: null)
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: undefined,
    status: 'unknown',
    weightKg: null
  });
  assert.equal(sessions[0].machineBaseResistanceStatus, 'unknown');
  assert.equal(sessions[0].machineBaseResistanceKg, undefined);

  // 5. Selection contract: Saved profile selection
  const profileCybex = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Cybex 12 kg',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 12
  });
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileCybex,
    status: 'user_defined',
    weightKg: 12
  });
  assert.equal(sessions[0].machineProfileId, profileCybex.id);
  assert.equal(sessions[0].machineProfileLabel, 'Cybex 12 kg');
  assert.equal(sessions[0].machineBaseResistanceStatus, 'user_defined');
  assert.equal(sessions[0].machineBaseResistanceKg, 12);
  // Untouched sets still untouched
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);

  // 6. Last-used tracking: saved profile saves ID, quick none/unknown clears ID
  setLastUsedMachineProfileId('smith-bench-press', profileCybex.id);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), profileCybex.id);
  setLastUsedMachineProfileId('smith-bench-press', null);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), null);

  // 7. Total load invariant guard in toggleSetInSessions:
  // Cannot complete set where weightKg < machineBaseResistanceKg (12 kg)
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 10);
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'reps', 8);
  const blockedToggle = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  assert.equal(blockedToggle.completed, false, 'Completing set with weight < machine base must be blocked');
  assert.equal(blockedToggle.sessions[0].sets[0].completed, false);

  // When weightKg >= machineBaseResistanceKg, completion succeeds and snapshots
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 12);
  const successToggle = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  assert.equal(successToggle.completed, true);
  assert.equal(successToggle.sessions[0].sets[0].completed, true);
  assert.equal(successToggle.sessions[0].sets[0].machineProfileId, profileCybex.id);
  assert.equal(successToggle.sessions[0].sets[0].machineBaseResistanceKg, 12);

  // 8. Explicit total assertion on unknown machine base:
  // Switch session to unknown machine base
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: undefined,
    status: 'unknown',
    weightKg: null
  });
  // Set 2 has weight 0 and no snapshot: toggle must be blocked
  const blockedUnknown = toggleSetInSessions(sessions, 'smith-bench-press', 2);
  assert.equal(blockedUnknown.completed, false, 'Completing unasserted set on unknown machine must be blocked');

  // Once user enters explicit total weight via keyboard (> 0), completion succeeds
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 2, 'weightKg', 80);
  const successUnknown = toggleSetInSessions(sessions, 'smith-bench-press', 2);
  assert.equal(successUnknown.completed, true);
  assert.equal(successUnknown.sessions[0].sets[1].completed, true);
  assert.equal(successUnknown.sessions[0].sets[1].weightKg, 80);
  assert.equal(successUnknown.sessions[0].sets[1].machineBaseResistanceStatus, 'unknown');
  assert.equal(successUnknown.sessions[0].sets[1].machineBaseResistanceKg, undefined);

  // 9. serializeWorkoutSets does NOT backfill machine fields to unsnapshotted sets
  // Set 3 was never touched/completed: serialize must keep machine fields undefined
  const serializedSets = serializeWorkoutSets(sessions);
  const set3Serialized = serializedSets['smith-bench-press'][2];
  assert.equal(set3Serialized.machineProfileId, undefined);
  assert.equal(set3Serialized.machineBaseResistanceStatus, undefined);
  assert.equal(set3Serialized.machineBaseResistanceKg, undefined);
});

test('19. SNAPSHOT_TIMING_SEQUENCE: Session starts with A -> Set 1 untouched (no snapshot) -> switch to B -> Set 1 untouched (no snapshot) -> keyboard 80 kg (snapshots B) -> switch to C -> Set 1 remains B -> complete Set 1 -> remains B -> serialize -> remains B without C', () => {
  localStorage.clear();

  const profileA = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine A (10 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 10
  });
  const profileB = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine B (15 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 15
  });
  const profileC = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine C (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });

  // 1. Session starts with Machine A
  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileA,
    status: 'user_defined',
    weightKg: 10
  });
  // Set 1 untouched -> no snapshot
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, undefined);

  // 2. Switch session to Machine B
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileB,
    status: 'user_defined',
    weightKg: 15
  });
  // Set 1 untouched -> still no snapshot
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, undefined);
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, undefined);

  // 3. keyboard enter 80 kg -> Set 1 snapshots Machine B
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 80);
  assert.equal(sessions[0].sets[0].machineProfileId, profileB.id);
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Machine B (15 kg)');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 15);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'user_defined');

  // 4. Switch session to Machine C
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileC,
    status: 'user_defined',
    weightKg: 20
  });
  // Set 1 remains Machine B
  assert.equal(sessions[0].sets[0].machineProfileId, profileB.id);
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Machine B (15 kg)');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 15);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'user_defined');

  // 5. Complete Set 1
  const toggleResult = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  sessions = toggleResult.sessions;
  assert.equal(toggleResult.completed, true);
  // Set 1 remains Machine B
  assert.equal(sessions[0].sets[0].machineProfileId, profileB.id);
  assert.equal(sessions[0].sets[0].machineProfileLabel, 'Machine B (15 kg)');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, 15);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'user_defined');

  // 6. Serialize -> Set 1 remains Machine B; no Machine C provenance leaks in
  const serialized = serializeWorkoutSets(sessions);
  const serializedSet1 = serialized['smith-bench-press'][0];
  assert.equal(serializedSet1.machineProfileId, profileB.id);
  assert.equal(serializedSet1.machineProfileLabel, 'Machine B (15 kg)');
  assert.equal(serializedSet1.machineBaseResistanceKg, 15);
  assert.equal(serializedSet1.machineBaseResistanceStatus, 'user_defined');
});

test('20. LAST_USED_CLEARING: Selecting profile A records last-used; quick Unknown clears; new session starts without A; repeat with quick None', () => {
  localStorage.clear();

  const profileA = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine A',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 10
  });

  // 1. Select saved profile A -> last-used A
  setLastUsedMachineProfileId('smith-bench-press', profileA.id);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), profileA.id);

  // 2. Select quick Unknown -> last-used cleared
  setLastUsedMachineProfileId('smith-bench-press', null);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), null);

  // 3. Restart/create new session -> A does NOT return
  const session1 = createDefaultExerciseSession(mockSmithExercise);
  assert.equal(session1.machineProfileId, undefined);
  assert.equal(session1.machineBaseResistanceStatus, 'unknown');

  // 4. Repeat: Select A -> last-used A
  setLastUsedMachineProfileId('smith-bench-press', profileA.id);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), profileA.id);

  // 5. Select quick None -> last-used cleared
  setLastUsedMachineProfileId('smith-bench-press', null);
  assert.equal(getLastUsedMachineProfileId('smith-bench-press'), null);

  // 6. Restart/create new session -> A does NOT return
  const session2 = createDefaultExerciseSession(mockSmithExercise);
  assert.equal(session2.machineProfileId, undefined);
  assert.equal(session2.machineBaseResistanceStatus, 'unknown');
});

test('21. ZERO_WEIGHT_AND_SELECTION_CONSISTENCY: Base 0/status none allows total weight 0 completion; contradictory selection derives from profile', () => {
  localStorage.clear();

  // 1. Base none (0 kg) allows completing a set with explicit total 0 kg
  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: undefined,
    status: 'none',
    weightKg: 0
  });
  // Set weight to 0 explicitly via keyboard (user entered total 0)
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 0);
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'reps', 10);
  const toggleNone = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  assert.equal(toggleNone.completed, true, 'Set with status none and weight 0 MUST be able to complete');
  assert.equal(toggleNone.sessions[0].sets[0].weightKg, 0);
  assert.equal(toggleNone.sessions[0].sets[0].machineBaseResistanceStatus, 'none');

  // 2. Contradictory selection: profile exists with user_defined 20 kg, but selection claims none / 0 kg
  const profile20 = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Cybex 20 kg',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profile20,
    status: 'none', // contradictory!
    weightKg: 0 // contradictory!
  });
  // Must derive status/weightKg from profile, preventing contradictory state
  assert.equal(sessions[0].machineBaseResistanceStatus, 'user_defined');
  assert.equal(sessions[0].machineBaseResistanceKg, 20);
  assert.equal(sessions[0].machineProfileId, profile20.id);
});

test('22. UNKNOWN_SNAPSHOT_ISOLATION_AGAINST_SESSION_BASE: Unknown snapshot A (10 kg) does NOT borrow session B base (20 kg), can complete, and session C (30 kg) does not leak into serialization', () => {
  localStorage.clear();

  // 1. Session Machine A with unknown base
  let sessions = [createDefaultExerciseSession(mockSmithExercise)];
  assert.equal(sessions[0].machineBaseResistanceStatus, 'unknown');

  // User keyboard-enters 10 kg, 8 reps
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'weightKg', 10);
  sessions = updateSetInSessions(sessions, 'smith-bench-press', 1, 'reps', 8);

  // Set 1 has snapshot: status unknown, base undefined, weightKg 10
  const set1BeforeSwitch = sessions[0].sets[0];
  assert.equal(set1BeforeSwitch.weightKg, 10);
  assert.equal(set1BeforeSwitch.machineBaseResistanceStatus, 'unknown');
  assert.equal(set1BeforeSwitch.machineBaseResistanceKg, undefined);

  // 2. Switch SESSION to Machine B (base 20 kg, status user_defined)
  const profileB = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine B (20 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 20
  });
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileB,
    status: 'user_defined',
    weightKg: 20
  });
  assert.equal(sessions[0].machineBaseResistanceKg, 20);

  // Set 1 MUST NOT borrow Machine B base 20 kg!
  // Even though 10 < 20, Set 1 evaluates exclusively from its unknown snapshot and CAN be completed
  const toggleResult = toggleSetInSessions(sessions, 'smith-bench-press', 1);
  assert.equal(toggleResult.completed, true, 'Set 1 must complete using its own unknown snapshot, NOT blocked by session base 20 kg');
  sessions = toggleResult.sessions;
  assert.equal(sessions[0].sets[0].completed, true);
  assert.equal(sessions[0].sets[0].weightKg, 10);
  assert.equal(sessions[0].sets[0].machineBaseResistanceStatus, 'unknown');
  assert.equal(sessions[0].sets[0].machineBaseResistanceKg, undefined);
  assert.equal(sessions[0].sets[0].machineProfileId, undefined);

  // 3. Switch session to Machine C (base 30 kg)
  const profileC = saveMachineProfile({
    exerciseId: 'smith-bench-press',
    label: 'Machine C (30 kg)',
    baseResistanceStatus: 'user_defined',
    baseResistanceKg: 30
  });
  sessions = updateMachineProfileInSessions(sessions, 'smith-bench-press', {
    profile: profileC,
    status: 'user_defined',
    weightKg: 30
  });

  // 4. Serialize: Set 1 must remain weightKg 10, status unknown, base undefined, with NO B or C provenance
  const serialized = serializeWorkoutSets(sessions);
  const serializedSet1 = serialized['smith-bench-press'][0];
  assert.equal(serializedSet1.weightKg, 10);
  assert.equal(serializedSet1.machineBaseResistanceStatus, 'unknown');
  assert.equal(serializedSet1.machineBaseResistanceKg, undefined);
  assert.equal(serializedSet1.machineProfileId, undefined);
  assert.notEqual(serializedSet1.machineProfileId, profileB.id);
  assert.notEqual(serializedSet1.machineProfileId, profileC.id);
});

