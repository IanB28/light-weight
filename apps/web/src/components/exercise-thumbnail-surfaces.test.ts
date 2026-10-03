import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Exercise, WorkoutSession } from '@light-weight/domain';
import { ExercisePicker } from './ExercisePicker.js';
import { WorkoutDetailModal } from './WorkoutDetailModal.js';
import { ProfilePrRow } from '../features/profile/ProfilePrRow.js';
import { LibraryView } from '../views/LibraryView.js';
import { PreferencesProvider } from '../lib/preferences-context.js';

const exercise: Exercise = { id: 'ex-qa', name: 'Bench Press', category: 'barbell', primaryMuscle: 'chest', img: 'bench-demo.jpg' };
const session: WorkoutSession = { id: 'session-qa', userId: 'user-qa', startedAt: '2026-10-02T10:00:00Z', sets: { 'ex-qa': [] } };

test('Library featured, picker selected, workout detail and Profile PR render shared exercise image', () => {
  const library = renderToStaticMarkup(React.createElement(LibraryView, {
    exercises: [exercise], catalogStatus: 'ready', history: [{ ...session, sets: { 'ex-qa': [{ setIndex: 0, weightKg: 50, reps: 5, completed: true, setType: 'working', isWarmup: false }] } }]
  }));
  assert.match(library, /bench-demo\.jpg/);
  assert.match(library, /data-testid="exercise-thumbnail"/);

  const picker = renderToStaticMarkup(React.createElement(ExercisePicker, { label: 'Exercise', value: exercise.id, exercises: [exercise], onChange: () => {} }));
  assert.match(picker, /bench-demo\.jpg/);

  const detail = renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(WorkoutDetailModal, { session, onClose: () => {}, exercisesById: { [exercise.id]: exercise } })
  ));
  assert.match(detail, /bench-demo\.jpg/);

  const pr = renderToStaticMarkup(React.createElement(ProfilePrRow, { exercise, name: exercise.name, rank: null, displayLoad: '50 kg' }));
  assert.match(pr, /bench-demo\.jpg/);
});

test('thumbnail coverage guard for selected, result and locally resolved exercise surfaces', () => {
  const sources = [
    ['src/views/LibraryView.tsx', 1],
    ['src/components/ExercisePicker.tsx', 2],
    ['src/features/routines/ReceivedRoutines.tsx', 1],
    ['src/components/WorkoutDetailModal.tsx', 1],
    ['src/features/profile/ProfileStrengthSection.tsx', 1],
    ['src/components/AddExerciseModal.tsx', 1],
    ['src/components/RoutineEditorModal.tsx', 1],
    ['src/features/routines/RoutineDetailSheet.tsx', 1],
    ['src/components/HistoricalPersonalRecordModal.tsx', 3],
    ['src/features/workouts/WorkoutSessionComponents.tsx', 2],
    ['src/features/profile/ProfilePrRow.tsx', 1]
  ] as const;
  for (const [path, minimum] of sources) {
    const source = readFileSync(path, 'utf8');
    assert.ok((source.match(/<ExerciseThumbnail\b/g) ?? []).length >= minimum, path);
  }
  const mediaViewer = readFileSync('src/components/ExerciseMediaModal.tsx', 'utf8');
  assert.doesNotMatch(mediaViewer, /ExerciseThumbnail/);
});
