import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { Exercise } from '@light-weight/domain';
import { ExerciseAnatomyMap } from './ExerciseAnatomyMap.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { I18nProvider } from '../../lib/i18n.js';
import { DEFAULT_APP_PREFERENCES, saveStoredPreferences } from '../../lib/preferences.js';
import { DEFAULT_USER_PROFILE } from '../../lib/storage.js';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MockStorage();
}

function renderWithProviders(element: React.ReactElement, language: 'es' | 'en' = 'es') {
  saveStoredPreferences({ ...DEFAULT_APP_PREFERENCES, language });
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        element
      )
    )
  );
}

test('1. ExerciseAnatomyMap: renders curated v2 exercise with front and back views', () => {
  const benchExercise: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: benchExercise, gender: 'male' })
  );

  // Verifies front and back SVG views are rendered
  assert.ok(html.includes('role="region"'), 'Must have region role');
  assert.ok(html.includes('role="img"'), 'Must render SVG imgs');
  assert.ok(html.includes('Frente') || html.includes('Front'), 'Must render front label');
  assert.ok(html.includes('Dorso') || html.includes('Back'), 'Must render back label');

  // Verifies biomechanics v2 badge
  assert.ok(html.includes('Biomecánica v2') || html.includes('Biomechanics v2'));

  // Verifies qualitative role labels
  assert.ok(html.includes('Principal') || html.includes('Prime'));
  assert.ok(html.includes('Co-principal') || html.includes('Co-prime'));
  assert.ok(html.includes('Secundario') || html.includes('Secondary'));
  assert.ok(html.includes('Estabilizador') || html.includes('Stabilizer'));

  // Verifies key muscle entities appear
  assert.ok(html.includes('Pectoral mayor') || html.includes('Pectoralis Major'));
  assert.ok(html.includes('Tríceps braquial') || html.includes('Triceps Brachii'));
  assert.ok(html.includes('Deltoides anterior') || html.includes('Anterior Deltoid'));
  assert.ok(html.includes('Manguito rotador') || html.includes('Rotator Cuff'));

  // INVARIANT: ABSOLUTELY NO PHYSIOLOGICAL PERCENTAGES SHOWN IN USER-FACING TEXT
  const textContent = html.replace(/<[^>]*>/g, ' ');
  assert.equal(textContent.includes('100%'), false, 'Must not contain visible 100%');
  assert.equal(textContent.includes('82%'), false, 'Must not contain visible 82%');
  assert.equal(textContent.includes('60%'), false, 'Must not contain visible 60%');
  assert.equal(textContent.includes('42%'), false, 'Must not contain visible 42%');
  assert.equal(textContent.includes('28%'), false, 'Must not contain visible 28%');
  assert.equal(textContent.includes('14%'), false, 'Must not contain visible 14%');
});

test('2. ExerciseAnatomyMap: renders fallback model for uncurated exercise', () => {
  const fallbackExercise: Exercise = {
    id: 'ex-unknown-custom',
    name: 'Custom Hamstring Curl',
    category: 'machine',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['calves']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: fallbackExercise, gender: 'male' })
  );

  // Verifies fallback badge is displayed
  assert.ok(html.includes('Estimación base') || html.includes('Standard Map'));

  // Verifies qualitative roles
  assert.ok(html.includes('Principal') || html.includes('Prime'));
  assert.ok(html.includes('Secundario') || html.includes('Secondary'));

  // Verifies muscle labels
  assert.ok(html.includes('Isquiotibiales') || html.includes('Hamstrings'));
  assert.ok(html.includes('Gemelos') || html.includes('Calves'));

  // INVARIANT: NO PERCENTAGES IN USER TEXT
  const fallbackText = html.replace(/<[^>]*>/g, ' ');
  assert.equal(fallbackText.includes('100%'), false);
  assert.equal(fallbackText.includes('60%'), false);
});

test('3. ExerciseAnatomyMap: renders Barbell Row with multi-muscle aggregation', () => {
  const rowExercise: Exercise = {
    id: 'ex-0027',
    name: 'Barbell Bent Over Row',
    category: 'barbell',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: rowExercise, gender: 'male' })
  );

  assert.ok(html.includes('Biomecánica v2') || html.includes('Biomechanics v2'));
  // Latissimus, rhomboids, teres major
  assert.ok(html.includes('Dorsal ancho') || html.includes('Latissimus Dorsi'));
  assert.ok(html.includes('Romboides') || html.includes('Rhomboids'));
  assert.ok(html.includes('Redondo mayor') || html.includes('Teres Major'));
});

test('4. Hardening K: Interactive SVG muscle regions have accessible button role, tabIndex and aria-labels', () => {
  const benchExercise: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: benchExercise, gender: 'male' })
  );

  // Verifies targeted regions have accessible role="button" and tabIndex="0"
  assert.ok(html.includes('role="button"'), 'Targeted muscle groups must have role="button"');
  assert.ok(html.includes('tabindex="0"'), 'Targeted muscle groups must have tabIndex="0" for keyboard accessibility');
  assert.ok(html.includes('aria-label='), 'Targeted muscle groups must have aria-label');
  assert.ok(html.includes('Pecho') || html.includes('Chest'), 'Must include localized chest region label in aria-label');
});

test('5. Gate 2: Full English localization without Spanish leakage when language = en', () => {
  const benchExercise: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: benchExercise, gender: 'male' }),
    'en'
  );

  // English badge and views
  assert.ok(html.includes('Biomechanics v2'), 'Must include English Biomechanics v2 badge');
  assert.ok(html.includes('Front'), 'Must include English Front view label');
  assert.ok(html.includes('Back'), 'Must include English Back view label');

  // English muscle names
  assert.ok(html.includes('Pectoralis Major'), 'Must include English Pectoralis Major');
  assert.ok(html.includes('Triceps Brachii'), 'Must include English Triceps Brachii');
  assert.ok(html.includes('Anterior Deltoid'), 'Must include English Anterior Deltoid');

  // English roles
  assert.ok(html.includes('Prime'), 'Must include English Prime role');
  assert.ok(html.includes('Co-prime'), 'Must include English Co-prime role');
  assert.ok(html.includes('Secondary'), 'Must include English Secondary role');

  // Strict verification: No Spanish strings leaked
  assert.equal(html.includes('Pectoral mayor'), false, 'Must not leak Spanish Pectoral mayor');
  assert.equal(html.includes('Biomecánica v2'), false, 'Must not leak Spanish Biomecánica v2');
  assert.equal(html.includes('Principal'), false, 'Must not leak Spanish Principal');
  assert.equal(html.includes('Frente'), false, 'Must not leak Spanish Frente');
  assert.equal(html.includes('Dorso'), false, 'Must not leak Spanish Dorso');
});

test('6. Gate 3: Romanian Deadlift renders minimal role correctly in ExerciseAnatomyMap without percentages', () => {
  const rdlExercise: Exercise = {
    id: 'ex-0085',
    name: 'Barbell Romanian Deadlift',
    category: 'barbell',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes']
  };

  const html = renderWithProviders(
    React.createElement(ExerciseAnatomyMap, { exercise: rdlExercise, gender: 'male' })
  );

  // Verifies minimal role is present in legend and contribution list
  assert.ok(html.includes('Mínimo') || html.includes('Minimal'), 'Minimal role must be displayed');
  assert.ok(html.includes('Cuádriceps') || html.includes('Quadriceps'), 'Quadriceps must be displayed under minimal');
  assert.ok(html.includes('Isquiotibiales') || html.includes('Hamstrings'), 'Hamstrings prime must be displayed');
  assert.ok(html.includes('Glúteo mayor') || html.includes('Gluteus Maximus'), 'Gluteus maximus co-prime must be displayed');
  assert.ok(html.includes('Isométrico') || html.includes('Isometric'), 'Isometric erector spinae must be displayed');

  // INVARIANT: Zero percentages in text
  const cleanText = html.replace(/<[^>]*>/g, ' ');
  assert.equal(cleanText.includes('%'), false, 'UI text must never expose percentages');
});
