import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  snapWeightValue,
  clampWeightValue,
  formatWeightValue,
  parseWeightInput,
  WeightWidget
} from './WeightWidget.js';
import { BodyweightModal } from './BodyweightModal.js';
import {
  saveBodyweightEntry,
  getStoredBodyweight,
  saveStoredTargetWeight,
  getStoredTargetWeight,
  saveStoredBodyweight
} from '../lib/storage.js';
import { displayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { I18nProvider } from '../lib/i18n.js';

// Setup mock localStorage in Node test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
}

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
// 1. PURE VALUE LOGIC (Prompt Section 31)
// ============================================================================

test('pure logic: snapWeightValue snaps 72.04 -> 72.0 and 72.05 -> 72.1', () => {
  assert.equal(snapWeightValue(72.04, 0.1), 72.0);
  assert.equal(snapWeightValue(72.05, 0.1), 72.1);
  assert.equal(snapWeightValue(72.06, 0.1), 72.1);
  assert.equal(snapWeightValue(72.00, 0.1), 72.0);
});

test('pure logic: snapWeightValue handles whole numbers and safe precision', () => {
  assert.equal(snapWeightValue(72, 0.1), 72);
  assert.equal(snapWeightValue(72.5, 0.1), 72.5);
  assert.equal(snapWeightValue(80, 0.1), 80);
  assert.equal(snapWeightValue(80.7, 0.1), 80.7);
  assert.equal(snapWeightValue(152, 0.1), 152);
  assert.equal(snapWeightValue(152.5, 0.1), 152.5);
});

test('pure logic: snapWeightValue handles invalid values safely', () => {
  assert.equal(snapWeightValue(Number.NaN, 0.1), 0);
  assert.equal(snapWeightValue(Number.POSITIVE_INFINITY, 0.1), 0);
  assert.equal(snapWeightValue(Number.NEGATIVE_INFINITY, 0.1), 0);
});

test('pure logic: clampWeightValue bounds numbers correctly', () => {
  assert.equal(clampWeightValue(10, 20, 300), 20);
  assert.equal(clampWeightValue(350, 20, 300), 300);
  assert.equal(clampWeightValue(75.5, 20, 300), 75.5);
  assert.equal(clampWeightValue(Number.NaN, 20, 300), 20);
});

test('pure logic: formatWeightValue formats integers without trailing .0 and decimals with 1 decimal place', () => {
  assert.equal(formatWeightValue(72), '72');
  assert.equal(formatWeightValue(72.0), '72');
  assert.equal(formatWeightValue(72.5), '72.5');
  assert.equal(formatWeightValue(72.7), '72.7');
  assert.equal(formatWeightValue(152), '152');
  assert.equal(formatWeightValue(152.5), '152.5');
  assert.equal(formatWeightValue(Number.NaN), '0');
});

test('pure logic: parseWeightInput normalizes commas, parses decimals, and rejects invalid input', () => {
  assert.equal(parseWeightInput('72'), 72);
  assert.equal(parseWeightInput('72.5'), 72.5);
  assert.equal(parseWeightInput('72,5'), 72.5);
  assert.equal(parseWeightInput(' 80.4 '), 80.4);
  assert.equal(parseWeightInput(''), null);
  assert.equal(parseWeightInput('abc'), null);
  assert.equal(parseWeightInput('NaN'), null);
});

// ============================================================================
// 2. DECIMAL ROUND-TRIP AUDIT & STORAGE PRECISION (Prompt Section 21 & 33)
// ============================================================================

test('round trip: 72.5 kg save -> load -> display 72.5', () => {
  localStorage.clear();
  const inputDisplay = 72.5;
  const parsedKg = parseDisplayWeight(inputDisplay, 'metric');
  assert.equal(parsedKg, 72.5);

  saveBodyweightEntry(parsedKg, '2026-09-24');
  const stored = getStoredBodyweight();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].weightKg, 72.5);

  const displayed = displayWeight(stored[0].weightKg, 'metric');
  assert.equal(displayed, 72.5);
  assert.equal(formatWeightValue(displayed), '72.5');
});

test('round trip: 72 kg save -> load -> display 72 integer', () => {
  localStorage.clear();
  const inputDisplay = 72;
  const parsedKg = parseDisplayWeight(inputDisplay, 'metric');
  assert.equal(parsedKg, 72);

  saveBodyweightEntry(parsedKg, '2026-09-24');
  const stored = getStoredBodyweight();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].weightKg, 72);

  const displayed = displayWeight(stored[0].weightKg, 'metric');
  assert.equal(displayed, 72);
  assert.equal(formatWeightValue(displayed), '72');
});

test('round trip: 152.5 lb save -> load -> display 152.5 without imperial precision drift', () => {
  localStorage.clear();
  const inputDisplay = 152.5;
  const parsedKg = parseDisplayWeight(inputDisplay, 'imperial');
  // 152.5 / 2.20462262185 ~= 69.17284 kg
  assert.ok(Math.abs(parsedKg - 69.17284) < 0.001);

  saveBodyweightEntry(parsedKg, '2026-09-24');
  const stored = getStoredBodyweight();
  assert.equal(stored.length, 1);
  // Stored with 5 decimals precision rather than truncated to 0.1 kg
  assert.equal(stored[0].weightKg, parsedKg);

  const displayed = displayWeight(stored[0].weightKg, 'imperial');
  assert.equal(displayed, 152.5);
  assert.equal(formatWeightValue(displayed), '152.5');
});

test('round trip: 160 lb integer save -> load -> display 160 remains visually stable', () => {
  localStorage.clear();
  const inputDisplay = 160;
  const parsedKg = parseDisplayWeight(inputDisplay, 'imperial');

  saveBodyweightEntry(parsedKg, '2026-09-24');
  const stored = getStoredBodyweight();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].weightKg, parsedKg);

  const displayed = displayWeight(stored[0].weightKg, 'imperial');
  assert.equal(displayed, 160);
  assert.equal(formatWeightValue(displayed), '160');
});

test('round trip: target weight preserves metric and imperial decimal precision', () => {
  localStorage.clear();
  // Metric target 72.5 kg
  saveStoredTargetWeight(parseDisplayWeight(72.5, 'metric'));
  const storedMetric = getStoredTargetWeight();
  assert.equal(storedMetric, 72.5);
  assert.equal(displayWeight(storedMetric!, 'metric'), 72.5);

  // Imperial target 152.5 lb
  saveStoredTargetWeight(parseDisplayWeight(152.5, 'imperial'));
  const storedImperial = getStoredTargetWeight();
  assert.ok(storedImperial !== null);
  assert.equal(displayWeight(storedImperial!, 'imperial'), 152.5);
});

// ============================================================================
// 3. COMPONENT & MODAL RENDERING CONTRACT (Prompt Section 32)
// ============================================================================

test('weight-widget: renders slider semantics, current value and unit', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      label: 'Pesaje actual',
      onChange: () => {}
    })
  );

  assert.match(html, /role="slider"/);
  assert.match(html, /aria-label="Pesaje actual"/);
  assert.match(html, /aria-valuenow="72\.5"/);
  assert.match(html, /aria-valuemin="20"/);
  assert.match(html, /aria-valuemax="300"/);
  assert.match(html, /72\.5/);
  assert.match(html, /kg/);
});

test('bodyweight-modal: renders WeightWidget in log mode with correct initial value and no legacy +/- controls', () => {
  const html = renderWithProviders(
    React.createElement(BodyweightModal, {
      isOpen: true,
      onClose: () => {},
      currentGoal: 70,
      currentWeightKg: 72.5,
      initialMode: 'log',
      onSaveWeight: () => {},
      onSaveGoal: () => {}
    })
  );

  // Verify slider widget is rendered
  assert.match(html, /role="slider"/);
  // Verify legacy -0.5 / +0.5 buttons are NOT present
  assert.doesNotMatch(html, />-0\.5</);
  assert.doesNotMatch(html, />\+0\.5</);
  assert.doesNotMatch(html, />-1</);
  assert.doesNotMatch(html, />\+1</);
  // Verify value 72.5 is rendered
  assert.match(html, /72\.5/);
});

test('bodyweight-modal: renders WeightWidget in goal mode with currentGoal', () => {
  const html = renderWithProviders(
    React.createElement(BodyweightModal, {
      isOpen: true,
      onClose: () => {},
      currentGoal: 68.5,
      currentWeightKg: 74,
      initialMode: 'goal',
      onSaveWeight: () => {},
      onSaveGoal: () => {}
    })
  );

  assert.match(html, /role="slider"/);
  assert.match(html, /68\.5/);
});

test('bodyweight-modal: fallback initial value hierarchy when currentWeightKg is missing', () => {
  // 1. If currentWeightKg is null, use currentGoal
  const htmlWithGoal = renderWithProviders(
    React.createElement(BodyweightModal, {
      isOpen: true,
      onClose: () => {},
      currentGoal: 71.2,
      currentWeightKg: null,
      initialMode: 'log',
      onSaveWeight: () => {},
      onSaveGoal: () => {}
    })
  );
  assert.match(htmlWithGoal, /71\.2/);

  // 2. If both are null, use neutral fallback 75 kg
  const htmlDefault = renderWithProviders(
    React.createElement(BodyweightModal, {
      isOpen: true,
      onClose: () => {},
      currentGoal: null,
      currentWeightKg: null,
      initialMode: 'log',
      onSaveWeight: () => {},
      onSaveGoal: () => {}
    })
  );
  assert.match(htmlDefault, /75/);
});
