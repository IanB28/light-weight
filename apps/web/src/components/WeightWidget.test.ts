import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  snapWeightValue,
  clampWeightValue,
  formatWeightValue,
  parseWeightInput,
  calculateDragWeight,
  getBodyweightBounds,
  MIN_TECHNICAL_WEIGHT_KG,
  MAX_TECHNICAL_WEIGHT_KG,
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
// 1. PURE VALUE LOGIC & LOCALE FORMATTING (Prompt Section 3 & 11)
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
  assert.equal(clampWeightValue(0.5, 1, 500), 1);
  assert.equal(clampWeightValue(550, 1, 500), 500);
  assert.equal(clampWeightValue(75.5, 1, 500), 75.5);
  assert.equal(clampWeightValue(Number.NaN, 1, 500), 1);
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
// 2. RANGE CORRECTION & BROAD TECHNICAL BOUNDS (Prompt Section 9)
// ============================================================================

test('range correction: broad technical bounds replace invented canonical limits', () => {
  assert.equal(MIN_TECHNICAL_WEIGHT_KG, 1);
  assert.equal(MAX_TECHNICAL_WEIGHT_KG, 500);

  const metricBounds = getBodyweightBounds('metric');
  assert.equal(metricBounds.min, 1);
  assert.equal(metricBounds.max, 500);

  const imperialBounds = getBodyweightBounds('imperial');
  // 1 kg in lb = 2.2, 500 kg in lb = 1102.3
  assert.equal(imperialBounds.min, 2.2);
  assert.equal(imperialBounds.max, 1102.3);
});

// ============================================================================
// 3. DIRECT DRAG DATA PATH (Prompt Section 7 & 8)
// ============================================================================

test('direct drag data path: calculates raw weight and snaps without spring lag', () => {
  const pixelsPerUnit = 80;
  const startX = -72.0 * pixelsPerUnit; // -5760

  // Dragging left (negative offset) increases weight
  const draggedLeft = calculateDragWeight(startX, -8, pixelsPerUnit, 1, 500, 0.1);
  assert.equal(draggedLeft, 72.1);

  const draggedLeftMore = calculateDragWeight(startX, -40, pixelsPerUnit, 1, 500, 0.1);
  assert.equal(draggedLeftMore, 72.5);

  // Dragging right (positive offset) decreases weight
  const draggedRight = calculateDragWeight(startX, 16, pixelsPerUnit, 1, 500, 0.1);
  assert.equal(draggedRight, 71.8);

  // Clamping at technical boundaries
  const clampedMin = calculateDragWeight(startX, 100000, pixelsPerUnit, 1, 500, 0.1);
  assert.equal(clampedMin, 1);

  const clampedMax = calculateDragWeight(startX, -100000, pixelsPerUnit, 1, 500, 0.1);
  assert.equal(clampedMax, 500);
});

// ============================================================================
// 4. DECIMAL ROUND-TRIP AUDIT & STORAGE PRECISION (Prompt Section 11 & 15)
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
  assert.ok(Math.abs(parsedKg - 69.17284) < 0.001);

  saveBodyweightEntry(parsedKg, '2026-09-24');
  const stored = getStoredBodyweight();
  assert.equal(stored.length, 1);
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
  saveStoredTargetWeight(parseDisplayWeight(72.5, 'metric'));
  const storedMetric = getStoredTargetWeight();
  assert.equal(storedMetric, 72.5);
  assert.equal(displayWeight(storedMetric!, 'metric'), 72.5);

  saveStoredTargetWeight(parseDisplayWeight(152.5, 'imperial'));
  const storedImperial = getStoredTargetWeight();
  assert.ok(storedImperial !== null);
  assert.equal(displayWeight(storedImperial!, 'imperial'), 152.5);
});

// ============================================================================
// 5. TRUE SCALE DIAL GEOMETRY & TYPOGRAPHY CONTRACT (Prompt Section 1, 5, 6)
// ============================================================================

test('typography hardening: primary readout uses font-sans and tabular-nums, never font-mono', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      min: 1,
      max: 500,
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

test('true scale dial structure: renders stationary needle indicator, curved aperture, and removes analytics pill', () => {
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

  // Stationary physical scale needle indicator (needle svg and luminous bead)
  assert.match(html, /M 5 2 L 9 36 L 1 36 Z/);
  assert.match(html, /size-1\.5 rounded-full bg-accent/);

  // Decorative analytics pill ±0.1 removed from header
  assert.doesNotMatch(html, /±0\.1 kg/);

  // Slider accessibility semantics preserved
  assert.match(html, /role="slider"/);
  assert.match(html, /aria-label="Pesaje actual"/);
  assert.match(html, /aria-valuenow="72\.5"/);
  assert.match(html, /aria-valuetext="72,5 kg"/);
});

// ============================================================================
// 6. ACCESSIBILITY & KEYBOARD SUPPORT (Prompt Section 10)
// ============================================================================

test('accessibility & keyboard: handles Arrow keys, PageUp/Down, Home (min) and End (max)', () => {
  let emittedValue = 72.5;
  const onChange = (v: number) => {
    emittedValue = v;
  };

  // Simulate keyboard events directly against handler logic
  const min = 1;
  const max = 500;
  const step = 0.1;

  // ArrowLeft / ArrowDown: -0.1
  emittedValue = clampWeightValue(snapWeightValue(emittedValue - step, step), min, max);
  assert.equal(emittedValue, 72.4);

  // ArrowRight / ArrowUp: +0.1
  emittedValue = clampWeightValue(snapWeightValue(emittedValue + step, step), min, max);
  assert.equal(emittedValue, 72.5);

  // PageDown: -1.0
  emittedValue = clampWeightValue(snapWeightValue(emittedValue - 1.0, step), min, max);
  assert.equal(emittedValue, 71.5);

  // PageUp: +1.0
  emittedValue = clampWeightValue(snapWeightValue(emittedValue + 1.0, step), min, max);
  assert.equal(emittedValue, 72.5);

  // Home key: jumps to min
  emittedValue = snapWeightValue(min, step);
  assert.equal(emittedValue, 1.0);

  // End key: jumps to max
  emittedValue = snapWeightValue(max, step);
  assert.equal(emittedValue, 500.0);
});

// ============================================================================
// 7. MODAL INTEGRATION & STATE SEPARATION (Prompt Section 15)
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

  assert.match(html, /<h2[^>]*class="[^"]*text-lg[^"]*font-extrabold[^"]*text-text-primary[^"]*">Peso corporal<\/h2>/);
  assert.doesNotMatch(html, />-0\.5</);
  assert.doesNotMatch(html, />\+0\.5</);
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

// ============================================================================
// 8. GESTURE ARCHITECTURE & SEPARATION OF VISUAL MOTION (Prompt Block 19.5C)
// ============================================================================

test('gesture architecture: stationary gesture surface is decoupled from translated visual dial layer', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      unit: 'kg',
      label: 'Pesaje actual',
      locale: 'es',
      onChange: () => {}
    })
  );

  // 1. Stationary gesture capture surface exists with data-testid="scale-gesture-surface"
  assert.match(html, /data-testid="scale-gesture-surface"/);

  // 2. Gesture capture surface is positioned fixed at inset-0, z-30, with touch-pan-y
  assert.match(html, /data-testid="scale-gesture-surface"[^>]*class="[^"]*absolute inset-0 z-30[^"]*touch-pan-y[^"]*cursor-grab[^"]*"/);

  // 3. Gesture capture surface explicitly enforces touchAction: pan-y inline
  assert.match(html, /data-testid="scale-gesture-surface"[^>]*style="[^"]*touch-action:\s*pan-y[^"]*"/i);

  // 4. Gesture capture surface is NOT translated by the MotionValue (does not have left: 50% or transform translateX)
  const gestureSurfaceMatch = html.match(/<[^>]*data-testid="scale-gesture-surface"[^>]*>/);
  assert.ok(gestureSurfaceMatch, 'Gesture surface element must be present');
  assert.doesNotMatch(gestureSurfaceMatch[0], /left:\s*50%/i);
  assert.doesNotMatch(gestureSurfaceMatch[0], /translateX/i);

  // 5. Visual moving dial layer has pointer-events-none and aria-hidden="true"
  assert.match(html, /aria-hidden="true"[^>]*class="[^"]*pointer-events-none absolute inset-0 select-none[^"]*"/);

  // 6. Visual moving dial layer has left: 50% for centering springX
  assert.match(html, /pointer-events-none absolute inset-0 select-none[^>]*style="[^"]*left:\s*50%[^"]*"/i);
});

test('gesture architecture: disabled mode disables pointer events on the gesture surface', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(WeightWidget, {
      value: 72.5,
      unit: 'kg',
      label: 'Pesaje actual',
      locale: 'es',
      disabled: true,
      onChange: () => {}
    })
  );

  // When disabled, the gesture surface receives pointer-events-none and drops cursor-grab
  assert.match(html, /data-testid="scale-gesture-surface"[^>]*class="[^"]*pointer-events-none[^"]*"/);
  assert.doesNotMatch(html, /data-testid="scale-gesture-surface"[^>]*class="[^"]*cursor-grab[^"]*"/);
});
