import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Exercise } from '@light-weight/domain';
import { RepBadge } from '../../components/RepBadge.js';
import {
  completeFeaturedPrDraft,
  createFeaturedPrDraft,
  FeaturedPrSheet,
  filterFeaturedPrExerciseOptions,
  nextFeaturedPrSlot
} from './FeaturedPrSheet.js';
import { readFileSync } from 'node:fs';

const exercise: Exercise = { id: 'bench', name: 'Barbell Bench Press', category: 'barbell', primaryMuscle: 'chest' };

test('RepBadge renders each valid exact-rep medallion and rejects out-of-range values', () => {
  for (let rep = 1; rep <= 12; rep += 1) {
    const html = renderToStaticMarkup(React.createElement(RepBadge, { repCount: rep }));
    assert.match(html, new RegExp(`aria-label="${rep}RM"`));
    assert.match(html, new RegExp(`>${rep}<`));
  }
  assert.equal(renderToStaticMarkup(React.createElement(RepBadge, { repCount: 13 })), '');
});

test('featured PR sheet exposes at most three slots and disables unavailable reps', () => {
  const html = renderToStaticMarkup(React.createElement(FeaturedPrSheet, {
    open: true,
    selections: [{ slot: 1, exerciseId: 'bench', repCount: 8 }],
    exercises: [{ exercise, availableRepCounts: [3, 5, 8, 10] }],
    saving: false,
    onClose: () => {},
    onSave: async () => true
  }));
  assert.match(html, /8RM/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="1RM"[^>]*disabled/);
  assert.match(html, /Barbell Bench Press/);
});

test('featured PR draft supports one, two, or three slots and never offers a fourth', () => {
  assert.deepEqual(createFeaturedPrDraft([]), [{ slot: 1 }]);
  const one = [{ slot: 1 as const, exerciseId: 'bench', repCount: 8 }];
  assert.equal(nextFeaturedPrSlot(one), 2);
  const two = [...one, { slot: 2 as const, exerciseId: 'row', repCount: 5 }];
  assert.equal(nextFeaturedPrSlot(two), 3);
  const three = [...two, { slot: 3 as const, exerciseId: 'curl', repCount: 10 }];
  assert.equal(nextFeaturedPrSlot(three), null);
  assert.deepEqual(completeFeaturedPrDraft(two), two);
  assert.equal(completeFeaturedPrDraft([{ slot: 1 }]), null);
});

test('exercise choices prevent duplicates while retaining the exercise being edited', () => {
  const row: Exercise = { ...exercise, id: 'row', name: 'Barbell Row' };
  const options = [
    { exercise, availableRepCounts: [8] },
    { exercise: row, availableRepCounts: [5] }
  ];
  const draft = [
    { slot: 1 as const, exerciseId: 'bench', repCount: 8 },
    { slot: 2 as const }
  ];
  assert.deepEqual(filterFeaturedPrExerciseOptions(options, draft, 2, '').map((item) => item.exercise.id), ['row']);
  assert.deepEqual(filterFeaturedPrExerciseOptions(options, draft, 1, 'bench').map((item) => item.exercise.id), ['bench']);
});

test('profile presentation keeps fallback, configured exact-rep rank, compact rows, and safe unavailable state', () => {
  const source = readFileSync(new URL('./ProfileView.tsx', import.meta.url), 'utf8');
  assert.match(source, /featuredPrSelections\.length > 0\s*\? configuredRecords\s*:\s*summary\.records/);
  assert.match(source, /evaluateRelativeStrength\(target, performance\.canonicalOneRmKg, performance\.bodyweightKg/);
  assert.match(source, /formatFeaturedPerformanceLoad\(exercise, performance, preferences\.units\)/);
  assert.match(source, /t\('profile\.featuredUnavailable'\)/);
  assert.match(source, /className="flex min-h-14 items-center/);
  assert.match(source, /record\.repCount !== undefined && <RepBadge/);
});

test('sheet only closes after a successful save and keeps an explicit error on failure', () => {
  const source = readFileSync(new URL('./FeaturedPrSheet.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(saved\) onClose\(\)/);
  assert.match(source, /else setError\(t\('profile\.featuredSaveError'\)\)/);
});
