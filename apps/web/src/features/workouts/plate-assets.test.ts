import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { poundsToKilograms } from '@light-weight/domain';
import {
  METRIC_PLATE_ASSETS,
  IMPERIAL_PLATE_ASSETS,
  resolvePlateAsset
} from '../../lib/plate-assets.js';
import { WeightPlate } from './WeightPlate.js';
import { weightsMatch } from '../../lib/weight-units.js';

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

test('WeightPlate: selected state renders count badge and enables remove button', () => {
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
  assert.ok(html.includes('border-accent'));
  assert.ok(html.includes('×2'));
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

test('SettingsSheet: available plates toggle logic adds/removes plates cleanly', () => {
  const initialPlatesKg = [20, 10, 5];
  const toggle = (plates: number[], target: number) => {
    const active = plates.some((val) => weightsMatch(val, target));
    return active
      ? plates.filter((val) => !weightsMatch(val, target))
      : [...plates, target].sort((a, b) => b - a);
  };

  // Remove existing
  const afterRemove = toggle(initialPlatesKg, 10);
  assert.deepEqual(afterRemove, [20, 5]);

  // Add new
  const afterAdd = toggle(afterRemove, 15);
  assert.deepEqual(afterAdd, [20, 15, 5]);

  // Toggle imperial plates with conversion
  const imperialInitial = [poundsToKilograms(45), poundsToKilograms(25)];
  const imperialTarget = poundsToKilograms(35);
  const afterImperialAdd = toggle(imperialInitial, imperialTarget);
  assert.equal(afterImperialAdd.length, 3);
  assert.ok(afterImperialAdd.some((p) => weightsMatch(p, imperialTarget)));
});

test('SettingsSheet: source code imports resolvePlateAsset and renders real plate assets', () => {
  const settingsSource = fs.readFileSync(path.join(webRootDir, 'src/components/SettingsSheet.tsx'), 'utf8');
  assert.ok(settingsSource.includes("import { resolvePlateAsset } from '../lib/plate-assets.js'"));
  assert.ok(settingsSource.includes('resolvePlateAsset(plate, preferences.units)'));
  assert.ok(settingsSource.includes('formatDisplayWeight(plate, preferences.units)'));
  assert.ok(settingsSource.includes('aria-label={weightLabel}'));
  assert.ok(settingsSource.includes('aria-pressed={active}'));
});
