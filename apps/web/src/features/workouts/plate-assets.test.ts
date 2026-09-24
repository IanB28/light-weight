import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { poundsToKilograms, type Exercise, type Routine } from '@light-weight/domain';
import {
  METRIC_PLATE_ASSETS,
  IMPERIAL_PLATE_ASSETS,
  STANDARD_METRIC_PLATES_KG,
  STANDARD_IMPERIAL_PLATES_KG,
  getStandardPlateCatalogKg,
  resolvePlateAsset,
  preloadPlateAssets,
  _resetPreloadCache
} from '../../lib/plate-assets.js';
import { WeightPlate } from './WeightPlate.js';
import { weightsMatch, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import { SettingsSheet } from '../../components/SettingsSheet.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import {
  DEFAULT_APP_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  type AppPreferences
} from '../../lib/preferences.js';
import { AuthProvider } from '../../lib/auth-context.js';
import { RoutineDetailSheet } from '../routines/RoutineDetailSheet.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRootDir = path.resolve(__dirname, '../../..');
const publicDir = path.join(webRootDir, 'public');

test('plate-assets: all metric plate assets point to existing /discos/kg/ PNG files', () => {
  assert.equal(METRIC_PLATE_ASSETS.length, 7);
  for (const entry of METRIC_PLATE_ASSETS) {
    assert.match(entry.assetPath, /^\/discos\/kg\/[^/]+\.png$/);
    const fullPath = path.join(publicDir, entry.assetPath.replace(/^\//, ''));
    assert.ok(fs.existsSync(fullPath), `Metric plate asset file must exist: ${entry.assetPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 1000, `Asset file ${entry.assetPath} must not be empty`);
  }
});

test('plate-assets: all imperial plate assets point to existing /discos/lbs/ PNG files', () => {
  assert.equal(IMPERIAL_PLATE_ASSETS.length, 7);
  for (const entry of IMPERIAL_PLATE_ASSETS) {
    assert.match(entry.assetPath, /^\/discos\/lbs\/[^/]+\.png$/);
    const fullPath = path.join(publicDir, entry.assetPath.replace(/^\//, ''));
    assert.ok(fs.existsSync(fullPath), `Imperial plate asset file must exist: ${entry.assetPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 1000, `Asset file ${entry.assetPath} must not be empty`);
  }
});

test('plate-assets: decimal filename mappings respect exact comma convention', () => {
  // Metric: 1.25 -> 1,25.png and 2.5 -> 2,5.png
  assert.equal(resolvePlateAsset(1.25, 'metric'), '/discos/kg/1,25.png');
  assert.equal(resolvePlateAsset(2.5, 'metric'), '/discos/kg/2,5.png');

  // Imperial: 2.5 lb -> 2,5.png
  const twoPointFiveLbInKg = poundsToKilograms(2.5);
  assert.equal(resolvePlateAsset(twoPointFiveLbInKg, 'imperial'), '/discos/lbs/2,5.png');
});

test('plate-assets: resolvePlateAsset resolves metric plates correctly', () => {
  assert.equal(resolvePlateAsset(25, 'metric'), '/discos/kg/25.png');
  assert.equal(resolvePlateAsset(20, 'metric'), '/discos/kg/20.png');
  assert.equal(resolvePlateAsset(15, 'metric'), '/discos/kg/15.png');
  assert.equal(resolvePlateAsset(10, 'metric'), '/discos/kg/10.png');
  assert.equal(resolvePlateAsset(5, 'metric'), '/discos/kg/5.png');
  assert.equal(resolvePlateAsset(2.5, 'metric'), '/discos/kg/2,5.png');
  assert.equal(resolvePlateAsset(1.25, 'metric'), '/discos/kg/1,25.png');
});

test('plate-assets: resolvePlateAsset resolves imperial plates correctly', () => {
  assert.equal(resolvePlateAsset(poundsToKilograms(45), 'imperial'), '/discos/lbs/45.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(35), 'imperial'), '/discos/lbs/35.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(25), 'imperial'), '/discos/lbs/25.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(15), 'imperial'), '/discos/lbs/15.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(10), 'imperial'), '/discos/lbs/10.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(5), 'imperial'), '/discos/lbs/5.png');
  assert.equal(resolvePlateAsset(poundsToKilograms(2.5), 'imperial'), '/discos/lbs/2,5.png');
});

test('plate-assets: getStandardPlateCatalogKg provides active catalog without cross-unit contamination', () => {
  const metric = getStandardPlateCatalogKg('metric');
  assert.equal(metric.length, 7);
  assert.deepEqual(metric, STANDARD_METRIC_PLATES_KG);

  const imperial = getStandardPlateCatalogKg('imperial');
  assert.equal(imperial.length, 7);
  assert.deepEqual(imperial, STANDARD_IMPERIAL_PLATES_KG);
});

test('plate-assets: missing asset fallback returns null for unknown weights', () => {
  assert.equal(resolvePlateAsset(0, 'metric'), null);
  assert.equal(resolvePlateAsset(-5, 'metric'), null);
  assert.equal(resolvePlateAsset(7.5, 'metric'), null);
  assert.equal(resolvePlateAsset(50, 'metric'), null);
  assert.equal(resolvePlateAsset(poundsToKilograms(100), 'imperial'), null);
});

test('WeightPlate: renders real PNG image with object-contain and decorative alt text', () => {
  const html = ReactDOMServer.renderToString(
    React.createElement(WeightPlate, {
      weightKg: 20,
      units: 'metric',
      count: 0,
      addLabel: 'Add 20 kg',
      removeLabel: 'Remove 20 kg',
      onAdd: () => {},
      onRemove: () => {}
    })
  );

  // Must render real PNG
  assert.ok(html.includes('src="/discos/kg/20.png"'));
  assert.ok(html.includes('alt=""'));
  assert.ok(html.includes('object-contain'));

  // Old generic SVG circles MUST be removed
  assert.ok(!html.includes('<circle'));
  assert.ok(!html.includes('viewBox="0 0 100 100"'));

  // Button accessibility attributes preserved
  assert.ok(html.includes('aria-label="Add 20 kg"'));
  assert.ok(html.includes('aria-pressed="false"'));

  // When count is 0, no ×count badge and remove button is disabled
  assert.ok(!html.includes('×'));
  assert.ok(html.includes('disabled=""'));
});

test('WeightPlate: selected state renders count badge, subtle aura, and NO persistent colored border', () => {
  const html = ReactDOMServer.renderToString(
    React.createElement(WeightPlate, {
      weightKg: poundsToKilograms(45),
      units: 'imperial',
      count: 2,
      addLabel: 'Add 45 lb',
      removeLabel: 'Remove 45 lb',
      onAdd: () => {},
      onRemove: () => {}
    })
  );

  assert.ok(html.includes('src="/discos/lbs/45.png"'));
  assert.ok(html.includes('aria-pressed="true"'));

  // CRITICAL: Persistent colored selected border / ring / frame is REMOVED
  assert.ok(!html.includes('border-accent'), 'Selected plate button must NOT have persistent border-accent');
  assert.ok(!html.includes('shadow-accent'), 'Selected plate button must NOT have heavy shadow-accent frame');

  // CRITICAL: Keyboard focus indication remains preserved
  assert.ok(html.includes('focus-visible:ring-accent'), 'Keyboard focus-visible ring must remain preserved');

  // CRITICAL: Dynamic semantic aura using var(--accent-glow)
  assert.ok(html.includes('var(--accent-glow)'), 'Aura must use runtime CSS var --accent-glow');
  assert.ok(html.includes('opacity-100'), 'Aura must be active (opacity-100) when selected');

  // CRITICAL: No hardcoded orange or literal RGB glow
  assert.ok(!html.includes('rgba(230,81,0'), 'Must NOT contain hardcoded orange rgba');
  assert.ok(!html.includes('drop-shadow-[0_0_8px'), 'Must NOT use expensive CSS drop-shadow filter');

  // CRITICAL: Count badge uses semantic accent tokens and entrance animation
  assert.ok(html.includes('bg-accent'), 'Count badge must use semantic bg-accent');
  assert.ok(html.includes('text-accent-fg'), 'Count badge must use semantic text-accent-fg');
  assert.ok(!html.includes('text-white'), 'Count badge must NOT hardcode text-white');
  assert.ok(html.includes('animate-badge-pop'), 'Count badge must use entrance animation');
  assert.ok(html.includes('×2'), 'Count badge must display current count');

  // CRITICAL: Image performance attributes and no transition-all
  assert.ok(html.includes('loading="eager"'), 'Picker images must load eagerly');
  assert.ok(html.includes('decoding="async"'), 'Picker images must decode asynchronously');
  assert.ok(html.includes('scale-[1.03]'), 'Subtle scale feedback on PNG');
  assert.ok(!html.includes('transition-all'), 'Must NOT use transition-all');

  // Remove button must not be disabled when count > 0
  assert.ok(!html.includes('disabled=""'));
  assert.ok(html.includes('aria-label="Remove 45 lb"'));
});

test('WeightPlate: missing asset fallback renders compact numeric representation without broken img', () => {
  const html = ReactDOMServer.renderToString(
    React.createElement(WeightPlate, {
      weightKg: 7.77,
      units: 'metric',
      count: 1,
      addLabel: 'Add 7.77 kg',
      removeLabel: 'Remove 7.77 kg',
      onAdd: () => {},
      onRemove: () => {}
    })
  );

  // Must NOT render img tag
  assert.ok(!html.includes('<img'));
  // Must render compact numeric fallback
  assert.ok(html.includes('7.77'));
  assert.ok(html.includes('kg'));
  // Must still render count badge and accessibility attributes
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes('×1'));
});

function renderSettingsWithPreferences(prefs: AppPreferences): string {
  const store = new Map<string, string>();
  store.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, data: prefs }));
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: store.size
  };

  return ReactDOMServer.renderToString(
    React.createElement(AuthProvider, null,
      React.createElement(PreferencesProvider, null,
        React.createElement(SettingsSheet, {
          isOpen: true,
          target: 'training',
          onClose: () => {},
          profile: { displayName: 'Athlete', username: 'athlete', gender: 'male', units: prefs.units } as any,
          onSaveProfile: () => {},
          onLogout: () => {}
        })
      )
    )
  );
}

test('SettingsSheet: REAL metric → imperial → metric UI transition switches plate artwork cleanly', () => {
  // 1. Initial Metric State
  const metricPrefs: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    units: 'metric',
    defaultBarWeightKg: 20,
    availablePlatesKg: [...WEIGHT_UNIT_PRESETS.metric.platesKg]
  };
  const metricHtml = renderSettingsWithPreferences(metricPrefs);

  // Metric artwork must be present
  assert.ok(metricHtml.includes('/discos/kg/25.png'), 'Must render metric 25 kg');
  assert.ok(metricHtml.includes('/discos/kg/20.png'), 'Must render metric 20 kg');
  assert.ok(metricHtml.includes('/discos/kg/15.png'), 'Must render metric 15 kg');
  assert.ok(metricHtml.includes('/discos/kg/10.png'), 'Must render metric 10 kg');
  assert.ok(metricHtml.includes('/discos/kg/5.png'), 'Must render metric 5 kg');
  assert.ok(metricHtml.includes('/discos/kg/2,5.png'), 'Must render metric 2.5 kg with comma');
  assert.ok(metricHtml.includes('/discos/kg/1,25.png'), 'Must render metric 1.25 kg with comma');
  // Imperial artwork must be completely absent in metric
  assert.ok(!metricHtml.includes('/discos/lbs/'), 'Imperial images must NOT appear when units=metric');

  // 2. Transition to Imperial State
  const imperialPrefs: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    units: 'imperial',
    defaultBarWeightKg: WEIGHT_UNIT_PRESETS.imperial.barWeightKg,
    availablePlatesKg: [...WEIGHT_UNIT_PRESETS.imperial.platesKg]
  };
  const imperialHtml = renderSettingsWithPreferences(imperialPrefs);

  // Imperial artwork must be present
  assert.ok(imperialHtml.includes('/discos/lbs/45.png'), 'Must render imperial 45 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/35.png'), 'Must render imperial 35 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/25.png'), 'Must render imperial 25 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/15.png'), 'Must render imperial 15 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/10.png'), 'Must render imperial 10 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/5.png'), 'Must render imperial 5 lb');
  assert.ok(imperialHtml.includes('/discos/lbs/2,5.png'), 'Must render imperial 2.5 lb with comma');
  // Metric artwork must be completely absent in imperial
  assert.ok(!imperialHtml.includes('/discos/kg/'), 'Metric images must NOT appear when units=imperial');

  // 3. Transition Back to Metric State
  const backToMetricHtml = renderSettingsWithPreferences(metricPrefs);
  assert.ok(backToMetricHtml.includes('/discos/kg/25.png'));
  assert.ok(backToMetricHtml.includes('/discos/kg/1,25.png'));
  assert.ok(!backToMetricHtml.includes('/discos/lbs/'));
});

test('RoutineDetailSheet: replaces numeric order with exercise thumbnail and fallback icon', () => {
  const mockExercises: Exercise[] = [
    {
      id: 'ex-bench',
      name: 'Press de banca con barra',
      category: 'barbell',
      primaryMuscle: 'chest',
      img: '/exercises/bench.webp',
      loading: {
        mechanism: 'barbell',
        loadMode: 'total',
        supportsKeyboard: true,
        supportsPlates: true,
        supportsExternalLoad: true,
        includeBarWeight: true
      }
    },
    {
      id: 'ex-pullup',
      name: 'Dominadas',
      category: 'bodyweight',
      primaryMuscle: 'back',
      loading: {
        mechanism: 'bodyweight',
        loadMode: 'added_weight',
        supportsKeyboard: true,
        supportsPlates: false,
        supportsExternalLoad: true,
        includeBarWeight: false
      }
    }
  ];

  const mockRoutine: Routine = {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Torso Fuerza',
    exerciseIds: ['ex-bench', 'ex-pullup'],
    description: 'Torso workout'
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(AuthProvider, null,
      React.createElement(RoutineDetailSheet, {
        routine: mockRoutine,
        exercises: mockExercises,
        onClose: () => {},
        onStart: () => {},
        onDelete: () => {}
      })
    )
  );

  // 1. Must render thumbnail image for exercise with img
  assert.ok(html.includes('bench.webp"'), 'Must render exercise thumbnail img');
  assert.ok(html.includes('object-cover'), 'Exercise image must use object-cover');

  // 2. Must render neutral Dumbbell fallback for exercise without img
  assert.ok(html.includes('lucide-dumbbell'), 'Must render Dumbbell icon fallback when no image');

  // 3. Must NOT render numeric order indicators [1] or [2] in leading circles
  assert.ok(!html.includes('bg-accent-soft font-mono text-xs font-bold text-accent">1<'), 'Order number 1 must NOT render');
  assert.ok(!html.includes('bg-accent-soft font-mono text-xs font-bold text-accent">2<'), 'Order number 2 must NOT render');

  // 4. Must render exercise name and muscle · category subtitle
  assert.ok(html.includes('Press de banca con barra'));
  assert.ok(html.includes('Dominadas'));
  assert.ok(html.includes('chest · barbell'));
  assert.ok(html.includes('back · bodyweight'));
});

test('plate-assets: preloadPlateAssets preloads current-unit catalog only, excludes set.png, and deduplicates', () => {
  _resetPreloadCache();

  // 1. Preload metric catalog
  const metricQueued = preloadPlateAssets('metric');
  assert.strictEqual(metricQueued.length, 7, 'Must queue exactly 7 metric plate assets');
  assert.ok(metricQueued.every((url) => url.startsWith('/discos/kg/')), 'All metric URLs must be in /discos/kg/');
  assert.ok(!metricQueued.some((url) => url.includes('set.png')), 'set.png must NOT be preloaded');

  // 2. Duplicate call should return empty array (deduplication)
  const metricQueuedAgain = preloadPlateAssets('metric');
  assert.strictEqual(metricQueuedAgain.length, 0, 'Subsequent call must deduplicate and queue 0 assets');

  // 3. Preload imperial catalog
  const imperialQueued = preloadPlateAssets('imperial');
  assert.strictEqual(imperialQueued.length, 7, 'Must queue exactly 7 imperial plate assets');
  assert.ok(imperialQueued.every((url) => url.startsWith('/discos/lbs/')), 'All imperial URLs must be in /discos/lbs/');
  assert.ok(!imperialQueued.some((url) => url.includes('set.png')), 'set.png must NOT be preloaded');

  // 4. Reset cache allows re-preloading
  _resetPreloadCache();
  const resetQueued = preloadPlateAssets('metric');
  assert.strictEqual(resetQueued.length, 7, 'After cache reset, assets can be queued again');
});

test('SettingsSheet: plate selection uses semantic accent classes and targeted transitions without transition-all', () => {
  const prefs: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    units: 'metric',
    availablePlatesKg: [25, 20]
  };
  const html = renderSettingsWithPreferences(prefs);

  // Must use semantic tokens for active plates
  assert.ok(html.includes('border-accent'), 'Active plate in Settings must use border-accent');
  assert.ok(html.includes('bg-accent-soft'), 'Active plate in Settings must use bg-accent-soft');
  assert.ok(html.includes('shadow-accent'), 'Active plate in Settings must use shadow-accent');

  // Must NOT use transition-all for plate selection buttons
  assert.ok(!html.includes('transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'), 'Settings plate button must NOT use transition-all');

  // Plate images must have eager loading and async decoding
  assert.ok(html.includes('loading="eager"'), 'Settings plate images must have loading=eager');
  assert.ok(html.includes('decoding="async"'), 'Settings plate images must have decoding=async');
});
