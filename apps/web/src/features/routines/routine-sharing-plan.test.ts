import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { normalizeRoutine, type Exercise, type RoutineShareSummary } from '@light-weight/domain';
import { PlanView } from '../../views/PlanView.js';
import { AuthProvider } from '../../lib/auth-context.js';
import { dictionaries } from '../../lib/i18n.js';
import { DEFAULT_APP_PREFERENCES } from '../../lib/preferences.js';
import { getStoredRoutines, saveStoredRoutines, STORAGE_KEYS } from '../../lib/storage.js';
import { mergePulledRoutines, serializeRoutineForSync } from '../../lib/routine-sync.js';
import { ReceivedRoutinePreview, pendingReceivedShares } from './ReceivedRoutines.js';

const sender = { id: 'sender-id', username: 'ian', displayName: 'Ian' };
const template = { version: 2 as const, exercises: [
  { exerciseId: 'row', sets: [{ setType: 'warmup' as const, targetWeightKg: 0 }, { setType: 'working' as const, targetWeightKg: 20 }] },
  { exerciseId: 'bench', sets: [{ setType: 'drop' as const, targetWeightKg: 15 }] }
] };
const share: RoutineShareSummary = {
  id: 'share-id', sender, routineName: 'Push Day', routineDescription: 'A snapshot',
  exerciseIds: ['row', 'bench'], template, status: 'pending', createdAt: '2026-10-02T00:00:00.000Z'
};
const exercises: Exercise[] = [
  { id: 'row', name: 'Barbell Row', category: 'barbell', primaryMuscle: 'back', secondaryMuscles: [] },
  { id: 'bench', name: 'Bench Press', category: 'barbell', primaryMuscle: 'chest', secondaryMuscles: [] }
];

test('Received Routines only retains pending snapshots', () => {
  assert.deepEqual(pendingReceivedShares([
    share, { ...share, id: 'imported', status: 'imported' }, { ...share, id: 'dismissed', status: 'dismissed' }
  ]).map((item) => item.id), ['share-id']);
});

test('received preview is read-only and displays snapshot order, sets, weights and sender', () => {
  const html = ReactDOMServer.renderToString(React.createElement(ReceivedRoutinePreview, {
    share, exercises, busy: false, onImport: () => {}, onDismiss: () => {}, onClose: () => {}
  }));
  assert.ok(html.indexOf('Barbell Row') < html.indexOf('Bench Press'));
  assert.match(html, /Compartida por @ian/);
  assert.match(html, /A snapshot/);
  assert.match(html, /2 series/);
  assert.match(html, /20 kg/);
  assert.match(html, /Importar copia/);
  assert.match(html, /Descartar rutina compartida/);
  for (const forbidden of ['Empezar rutina', 'Editar rutina', 'Eliminar rutina', 'Compartir rutina']) {
    assert.equal(html.includes(forbidden), false, forbidden);
  }
});

test('received preview uses viewer units and safe fallback for unresolved system exercises', () => {
  const html = ReactDOMServer.renderToString(React.createElement(ReceivedRoutinePreview, {
    share, exercises: [exercises[0]], preferences: { ...DEFAULT_APP_PREFERENCES, units: 'imperial' },
    busy: false, onImport: () => {}, onDismiss: () => {}, onClose: () => {}
  }));
  assert.match(html, /44.1 lb/);
  assert.match(html, /Ejercicio no disponible \(bench\)/);
});

test('server-imported routine retains exact ID, owner, template and origin through local storage and pull', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  } });
  try {
    const imported = normalizeRoutine({
      id: '00000000-0000-4000-8000-000000000101', userId: 'recipient-id', name: share.routineName,
      description: share.routineDescription, exerciseIds: share.exerciseIds, exerciseTemplate: template,
      origin: { type: 'shared', sharedBy: sender, shareId: share.id }
    })!;
    saveStoredRoutines([imported]);
    const stored = getStoredRoutines()[0];
    assert.equal(stored.id, imported.id);
    assert.equal(stored.userId, 'recipient-id');
    assert.deepEqual(stored.template, template);
    assert.deepEqual(stored.origin, imported.origin);
    assert.deepEqual(serializeRoutineForSync(stored).template, template);
    assert.deepEqual(mergePulledRoutines([stored], [stored], { cloudAuthoritative: true })[0].origin, imported.origin);
    assert.ok(values.has(STORAGE_KEYS.ROUTINES));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('Plan shows imported provenance while retaining normal owned-routine entry point', () => {
  const routine = normalizeRoutine({
    id: '00000000-0000-4000-8000-000000000102', userId: 'recipient-id', name: 'Push Day',
    exerciseIds: share.exerciseIds, template, origin: { type: 'shared', sharedBy: sender, shareId: share.id }
  })!;
  const html = ReactDOMServer.renderToString(React.createElement(AuthProvider, null, React.createElement(PlanView, {
    routines: [routine], exercises, weeklySchedule: {
      monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null
    }, onSelectAndStartRoutine: () => {}, onSaveRoutine: () => {}, onDeleteRoutine: () => {}
  })));
  assert.match(html, /Compartida por @ian/);
  assert.match(html, /Push Day/);
  assert.match(html, /Nueva rutina/);
});

test('sharing strings are present in both languages and social routine surfaces remain Plan-only', () => {
  for (const key of ['sharing.received', 'sharing.review', 'sharing.sharedBy', 'sharing.import', 'sharing.imported',
    'sharing.dismiss', 'sharing.preview', 'sharing.snapshotUnavailable', 'sharing.exerciseCount',
    'sharing.setCount', 'sharing.targetWeight', 'sharing.shared', 'sharing.noFriends', 'sharing.loadError'] as const) {
    assert.ok(dictionaries.es[key]);
    assert.ok(dictionaries.en[key]);
  }
  for (const path of ['features/profile/FriendProfileView.tsx', 'features/profile/ProfileView.tsx',
    'features/friends/FriendsPanel.tsx', 'views/HomeView.tsx', 'views/StatsView.tsx', 'views/LibraryView.tsx']) {
    const source = readFileSync(new URL(`../../../src/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /ReceivedRoutines|RoutineShareSheet|routineSharesApi|sharing\.share|sharing\.received/);
  }
});
