import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveSelectedFeaturedPrVariant, type Exercise, type FeaturedPrVariant } from '@light-weight/domain';
import { REP_BADGE_ASSET_PATH, RepBadge } from '../../components/RepBadge.js';
import { ProfilePrRow } from './ProfilePrRow.js';
import {
  completeFeaturedPrDraft,
  createFeaturedPrDraft,
  filterFeaturedPrExerciseOptions,
  nextFeaturedPrSlot
} from './FeaturedPrSheet.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { formatFeaturedVariantLoad } from './featured-pr-presentation.js';

const exercise: Exercise = { id: 'bench', name: 'Barbell Bench Press', category: 'barbell', primaryMuscle: 'chest' };
const variant = (loadWeightKg: number, reps: number): FeaturedPrVariant => ({
  exerciseId: exercise.id,
  loadWeightKg,
  reps,
  set: { setIndex: 1, weightKg: loadWeightKg, reps, completed: true, setType: 'working' },
  effectiveLoadKg: loadWeightKg,
  performedDate: '2026-01-01',
  source: 'workout'
});

test('RepBadge renders the user medal asset with real localized DOM text for one, two, and three digits', () => {
  for (const reps of [1, 8, 12, 45, 120]) {
    const html = renderToStaticMarkup(React.createElement(RepBadge, { repCount: reps }));
    assert.match(html, new RegExp(`aria-label="${reps} repeticiones"`));
    assert.match(html, new RegExp(`>${reps}<`));
    assert.match(html, new RegExp(`src="${REP_BADGE_ASSET_PATH}"`));
    assert.match(html, /data-testid="rep-badge-number"/);
  }
  for (const invalid of [0, -1, 1.5]) {
    assert.equal(renderToStaticMarkup(React.createElement(RepBadge, { repCount: invalid })), '');
  }
});

test('RepBadge follows the production medal prototype geometry and four-digit scaling', () => {
  const oneDigit = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 8 }));
  const twoDigits = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 12 }));
  const threeDigits = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 120 }));
  const fourDigits = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 1200 }));

  assert.equal(REP_BADGE_ASSET_PATH, '/badges/medal.png');
  assert.match(oneDigit, /aspect-\[420\/554\].*w-5/);
  assert.match(oneDigit, /container-type:size/);
  assert.match(oneDigit, /--rep-badge-plate-x:50%/);
  assert.match(oneDigit, /--rep-badge-plate-y:61%/);
  assert.match(oneDigit, /--rep-badge-plate-diameter:47\.6cqw/);
  assert.match(oneDigit, /left-\[var\(--rep-badge-plate-x\)\]/);
  assert.match(oneDigit, /top-\[var\(--rep-badge-plate-y\)\]/);
  assert.match(oneDigit, /text-\[38cqw\]/);
  assert.match(twoDigits, /text-\[32cqw\]/);
  assert.match(threeDigits, /text-\[26cqw\]/);
  assert.match(fourDigits, /text-\[20cqw\]/);
  assert.match(oneDigit, /text-\[#6b3f0e\]/);
  assert.match(oneDigit, /line-height:1/);
  assert.match(oneDigit, /0 0\.028em 0 rgba\(255, 238, 180, 0\.75\)/);
  assert.doesNotMatch(oneDigit, /brightness\(|saturate\(/);
  assert.doesNotMatch(oneDigit, /object-contain/);
});

test('RepBadge uses the exact final production artwork without regeneration', () => {
  const artwork = readFileSync(new URL('../../../public/badges/medal.png', import.meta.url));
  assert.equal(createHash('sha256').update(artwork).digest('hex'), '019273ab315432c19a77c3c74ba2be664bc4e666cbb9697ecd9bc5740f667ae1');
  assert.equal(artwork.readUInt32BE(16), 420);
  assert.equal(artwork.readUInt32BE(20), 554);
});

test('RepBadge supports reusable numeric widths without changing the medal ratio', () => {
  for (const size of [64, 96, 120, 160]) {
    const html = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 12, size }));
    assert.match(html, /aspect-\[420\/554\]/);
    assert.match(html, new RegExp(`width:${size}px`));
    assert.match(html, /aria-label="12 repeticiones"/);
  }
});

test('RepBadge derives a silhouette mask from canonical rank visuals without a rectangular shadow', () => {
  const immortal = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 8, rank: 'inmortal' }));
  assert.match(immortal, /data-testid="rep-badge-aura"/);
  assert.match(immortal, /mask-image:url\(&quot;\/badges\/medal\.png&quot;\)/);
  assert.match(immortal, /background-color:#C93C7A/i);
  assert.doesNotMatch(immortal, /box-shadow/);

  const novice = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 8, rank: 'novato' }));
  const unranked = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 8, rank: null }));
  assert.doesNotMatch(novice, /data-testid="rep-badge-aura"/);
  assert.doesNotMatch(unranked, /data-testid="rep-badge-aura"/);
  assert.match(novice, new RegExp(`src="${REP_BADGE_ASSET_PATH}"`));
  assert.match(unranked, new RegExp(`src="${REP_BADGE_ASSET_PATH}"`));
});

test('RepBadge keeps its shaped aura materially quieter than the canonical rank signal', () => {
  const html = renderToStaticMarkup(React.createElement(RepBadge, { repCount: 8, rank: 'inmortal' }));
  assert.match(html, /data-testid="rep-badge-aura-outer" class="pointer-events-none absolute -inset-px blur-\[2px\]" style="opacity:0.063"/);
  assert.match(html, /data-testid="rep-badge-aura-inner" class="pointer-events-none absolute inset-0 blur-\[1px\]" style="opacity:0.231"/);
});

test('ProfilePrRow passes one rank authority to both shaped badge auras', () => {
  const html = renderToStaticMarkup(React.createElement(ProfilePrRow, {
    exercise,
    name: exercise.name,
    rank: 'inmortal',
    repCount: 8,
    displayLoad: '100 kg'
  }));
  assert.match(html, /data-testid="strength-rank-aura"/);
  assert.match(html, /data-testid="rep-badge-aura"/);
  assert.match(html, /alt="Inmortal"/);
  assert.match(html, /aria-label="8 repeticiones"/);
});

test('ProfilePrRow makes the rank badge larger than the repetition medal and calms selected rows', () => {
  const html = renderToStaticMarkup(React.createElement(ProfilePrRow, {
    exercise,
    name: exercise.name,
    rank: 'inmortal',
    repCount: 8,
    displayLoad: '170 kg',
    selected: true,
    onSelect: () => undefined
  }));
  assert.match(html, /w-6 h-6/);
  assert.match(html, /aspect-\[420\/554\].*width:18px/);
  assert.match(html, /border-border-active bg-surface-active/);
  assert.doesNotMatch(html, /border-accent bg-accent-soft/);
});

test('featured PR draft persists a real load variant and supports at most three slots', () => {
  assert.deepEqual(createFeaturedPrDraft([]), [{ slot: 1 }]);
  const one = [{ slot: 1 as const, exerciseId: 'bench', loadWeightKg: 100 }];
  assert.equal(nextFeaturedPrSlot(one), 2);
  const two = [...one, { slot: 2 as const, exerciseId: 'row', loadWeightKg: 80 }];
  assert.equal(nextFeaturedPrSlot(two), 3);
  const three = [...two, { slot: 3 as const, exerciseId: 'curl', loadWeightKg: 20 }];
  assert.equal(nextFeaturedPrSlot(three), null);
  assert.deepEqual(completeFeaturedPrDraft(two), two);
  assert.deepEqual(completeFeaturedPrDraft([{ slot: 1, exerciseId: 'pull-up', loadWeightKg: 0 }]), [{ slot: 1, exerciseId: 'pull-up', loadWeightKg: 0 }]);
  assert.equal(completeFeaturedPrDraft([{ slot: 1 }]), null);
});

test('exercise search prevents duplicate featured exercises while retaining the slot being edited', () => {
  const row: Exercise = { ...exercise, id: 'row', name: 'Barbell Row' };
  const options = [
    { exercise, variants: [variant(100, 8)], rank: null },
    { exercise: row, variants: [{ ...variant(80, 10), exerciseId: row.id }], rank: null }
  ];
  const draft = [{ slot: 1 as const, exerciseId: 'bench', loadWeightKg: 100 }, { slot: 2 as const }];
  assert.deepEqual(filterFeaturedPrExerciseOptions(options, draft, 2, '').map((item) => item.exercise.id), ['row']);
  assert.deepEqual(filterFeaturedPrExerciseOptions(options, draft, 1, 'bench').map((item) => item.exercise.id), ['bench']);
});

test('profile and picker share ProfilePrRow and the obsolete 1..12 manual grid is gone', () => {
  const profile = readFileSync(new URL('../../../src/features/profile/ProfileView.tsx', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../../../src/features/profile/FeaturedPrSheet.tsx', import.meta.url), 'utf8');
  const row = readFileSync(new URL('../../../src/features/profile/ProfilePrRow.tsx', import.meta.url), 'utf8');
  assert.match(profile, /<ProfilePrRow/);
  assert.match(sheet, /<ProfilePrRow/);
  assert.doesNotMatch(sheet, /Array\.from\(\{ length: 12 \}/);
  assert.doesNotMatch(sheet, /featuredRepetitions/);
  assert.match(sheet, /candidate\.variants\.map/);
  assert.match(row, /aria-pressed/);
});

test('featured load formatting preserves logged load semantics rather than effective load', () => {
  assert.equal(formatFeaturedVariantLoad(exercise, variant(100, 8), 'metric'), '100 kg');
  const weighted: Exercise = {
    ...exercise,
    id: 'weighted-pull-up',
    category: 'bodyweight',
    loading: { mechanism: 'bodyweight', loadMode: 'added_weight', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false, bodyweightFactor: 1 }
  };
  const assisted = { ...weighted, id: 'assisted', loading: { ...weighted.loading!, loadMode: 'assisted' as const } };
  assert.equal(formatFeaturedVariantLoad(weighted, variant(20, 12), 'metric'), '+20 kg');
  assert.equal(formatFeaturedVariantLoad(weighted, variant(0, 12), 'metric'), 'BW');
  assert.equal(formatFeaturedVariantLoad(assisted, variant(20, 10), 'metric'), '-20 kg');
});

test('a persisted load selection resolves newer reps without changing the selection', () => {
  const selection = { slot: 1 as const, exerciseId: exercise.id, loadWeightKg: 100 };
  assert.equal(resolveSelectedFeaturedPrVariant(selection, [variant(100, 8)])?.reps, 8);
  assert.equal(resolveSelectedFeaturedPrVariant(selection, [variant(100, 10)])?.reps, 10);
  assert.deepEqual(selection, { slot: 1, exerciseId: exercise.id, loadWeightKg: 100 });
});

test('failed save keeps the sheet open and reports an explicit error', () => {
  const source = readFileSync(new URL('../../../src/features/profile/FeaturedPrSheet.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(saved\) onClose\(\)/);
  assert.match(source, /else setError\(t\('profile\.featuredSaveError'\)\)/);
});
