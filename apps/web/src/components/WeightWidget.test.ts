import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  snapWeightValue,
  clampWeightValue,
  formatWeightValue,
  parseWeightInput,
  getBodyweightBounds,
  CANONICAL_MIN_BODYWEIGHT_KG,
  CANONICAL_MAX_BODYWEIGHT_KG,
  WeightWidget
} from './WeightWidget.js';
import { BodyweightModal } from './BodyweightModal.js';
import {
  saveBodyweightEntry,
  getStoredBodyweight,
  saveStoredTargetWeight,
  getStoredTargetWeight
} from '../lib/storage.js';
import { displayWeight, parseDisplayWeight } from '../lib/weight-units.js';
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
// 1. PURE VALUE LOGIC & LOCALE FORMATTING (Prompt Section 1 & 2)
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

test('locale formatting: formatWeightValue respects active locale and integer rules', () => {
  // Integers remain integers in both locales without trailing .0
  assert.equal(formatWeightValue(72, 'es'), '72');
  assert.equal(formatWeightValue(72, 'en'), '72');
  assert.equal(formatWeightValue(152, 'es'), '152');
  assert.equal(formatWeightValue(152, 'en'), '152');

  // Spanish formatting uses comma decimal separator
  assert.equal(formatWeightValue(72.5, 'es'), '72,5');
  assert.equal(formatWeightValue(72.7, 'es'), '72,7');
  assert.equal(formatWeightValue(152.5, 'es'), '152,5');

  // English formatting uses dot decimal separator
  assert.equal(formatWeightValue(72.5, 'en'), '72.5');
  assert.equal(formatWeightValue(72.7, 'en'), '72.7');
  assert.equal(formatWeightValue(152.5, 'en'), '152.5');

  // Fallbacks
  assert.equal(formatWeightValue(Number.NaN, 'es'), '0');
});

test('parsing: parseWeightInput accepts both comma and dot decimal input', () => {
  assert.equal(parseWeightInput('72'), 72);
  assert.equal(parseWeightInput('72.5'), 72.5);
  assert.equal(parseWeightInput('72,5'), 72.5);
  assert.equal(parseWeightInput(' 152,4 '), 152.4);
  assert.equal(parseWeightInput(''), null);
  assert.equal(parseWeightInput('abc'), null);
  assert.equal(parseWeightInput('NaN'), null);
});

// ============================================================================
// 2. RANGE HARDENING & CANONICAL BOUNDS (Prompt Section 3)
// ============================================================================

test('range hardening: canonical metric bounds define single source of truth', () => {
  assert.equal(CANONICAL_MIN_BODYWEIGHT_KG, 20);
  assert.equal(CANONICAL_MAX_BODYWEIGHT_KG, 300);

  const metricBounds = getBodyweightBounds('metric');
  assert.equal(metricBounds.min, 20);
  assert.equal(metricBounds.max, 300);

  const imperialBounds = getBodyweightBounds('imperial');
  // 20 kg in lb = 44.1, 300 kg in lb = 661.4
  assert.equal(imperialBounds.min, 44.1);
  assert.equal(imperialBounds.max, 661.4);
});

// ============================================================================
// 3. DECIMAL ROUND-TRIP AUDIT & STORAGE PRECISION (Prompt Section 21 & 33)
// ============================================================================

test('round trip: 72.5 kg save -> load -> display 72,5 in es and 72.5 in en', () => {
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
  assert.equal(formatWeightValue(displayed, 'es'), '72,5');
  assert.equal(formatWeightValue(displayed, 'en'), '72.5');
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
  assert.equal(formatWeightValue(displayed, 'es'), '72');
  assert.equal(formatWeightValue(displayed, 'en'), '72');
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
  assert.equal(formatWeightValue(displayed, 'en'), '152.5');
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
  assert.equal(formatWeightValue(displayed, 'en'), '160');
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
// 4. TYPOGRAPHY & VISUAL METAPHOR CONTRACT (Prompt Section 1 & 4)
// ============================================================================

test('typography hardening: primary readout uses font-sans and tabular-nums, never font-mono', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      label: 'Pesaje actual',
      locale: 'es',
      onChange: () => {}
    })
  );

  // Central button and text must use font-sans
  assert.match(html, /font-sans/);
  // Central readout must NOT use font-mono
  assert.doesNotMatch(html, /font-mono/);
  // Numeric values must preserve tabular-nums for vertical alignment
  assert.match(html, /tabular-nums/);
  // Spanish formatted decimal
  assert.match(html, /72,5/);
});

test('scale visual metaphor: renders scale faceplate with status header, reticle notch, and measurement track', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      unit: 'kg',
      label: 'Pesaje actual',
      locale: 'es',
      icon: 'scale',
      onChange: () => {}
    })
  );

  // Scale faceplate precision badge
  assert.match(html, /±0\.1 kg/);
  // Slider semantics
  assert.match(html, /role="slider"/);
  assert.match(html, /aria-label="Pesaje actual"/);
  assert.match(html, /aria-valuenow="72\.5"/);
  assert.match(html, /aria-valuetext="72,5 kg"/);
});

// ============================================================================
// 5. MODAL INTEGRATION & STATE SEPARATION (Prompt Section 5 & 8)
// ============================================================================

test('bodyweight-modal: header/title hierarchy matches intended sheet styling', () => {
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

  // Title styling hierarchy: h2 with text-lg font-extrabold text-text-primary
  assert.match(html, /<h2[^>]*class="[^"]*text-lg[^"]*font-extrabold[^"]*text-text-primary[^"]*">Peso corporal<\/h2>/);
  // Legacy buttons removed
  assert.doesNotMatch(html, />-0\.5</);
  assert.doesNotMatch(html, />\+0\.5</);
  // Formatted value in es
  assert.match(html, /72,5/);
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
  assert.match(html, /68,5/);
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
  assert.match(htmlWithGoal, /71,2/);

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
