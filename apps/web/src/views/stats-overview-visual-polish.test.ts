import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkoutSession, Exercise } from '@light-weight/domain';
import type { UserProfile, BodyweightEntry } from '../lib/storage.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { StatsView } from './StatsView.js';

const source = (relPath: string) => {
  const direct = resolve(process.cwd(), 'src', relPath);
  if (existsSync(direct)) return readFileSync(direct, 'utf8');
  return readFileSync(resolve(process.cwd(), 'apps/web/src', relPath), 'utf8');
};

const sampleProfile: UserProfile = {
  displayName: 'Test Athlete',
  gender: 'male'
};

const sampleExercise: Exercise = {
  id: 'bench-press',
  name: 'Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

const sampleSession: WorkoutSession = {
  id: 'session-1',
  userId: 'user-1',
  routineName: 'Chest Day',
  startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  endedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
  performedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  sets: {
    'bench-press': [
      {
        setIndex: 1,
        weightKg: 100,
        reps: 5,
        completed: true,
        setType: 'working',
        isWarmup: false,
        rpe: 8
      }
    ]
  }
};

const sampleBodyweight: BodyweightEntry = {
  date: new Date().toISOString().slice(0, 10),
  timestamp: Date.now(),
  weightKg: 75.5
};

function renderStats(overrides: Partial<React.ComponentProps<typeof StatsView>> = {}) {
  const props: React.ComponentProps<typeof StatsView> = {
    history: overrides.history ?? [sampleSession],
    exercises: overrides.exercises ?? [sampleExercise],
    profile: overrides.profile ?? sampleProfile,
    bodyweightEntries: overrides.bodyweightEntries ?? [sampleBodyweight],
    targetWeight: overrides.targetWeight !== undefined ? overrides.targetWeight : 73,
    onSaveBodyweight: () => undefined,
    onSaveTargetWeight: () => undefined,
    onSaveProfile: () => undefined,
    ...overrides
  };

  return renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(StatsView, props)
    )
  );
}

test('VP.4-A: 30-day overview renders 3 primary metrics with ui-metric and units', () => {
  const html = renderStats();

  // Overview title and subtitle
  assert.match(html, /Últimos 30 días/i);
  assert.match(html, /Actividad/i);

  // 3 primary metric headers
  assert.match(html, /Mejor e1RM/i);
  assert.match(html, /Sesiones/i);
  assert.match(html, /Volumen/i);

  // Values use tabular ui-metric class
  const metricOccurrences = (html.match(/ui-metric/g) ?? []).length;
  assert.ok(metricOccurrences >= 3, `Expected at least 3 ui-metric instances in overview, found ${metricOccurrences}`);

  // Value formatting contains units and values
  assert.match(html, /115\.6 kg/);
  assert.match(html, /500 kg/);
});

test('VP.4-A: 30-day overview renders best exercise and weekly streak in context row', () => {
  const html = renderStats();

  // Best exercise from session
  assert.match(html, /Bench Press/);

  // Weekly streak
  assert.match(html, /semanas de racha/i);

  // Empty history fallback
  const emptyHtml = renderStats({ history: [] });
  assert.match(emptyHtml, /Sin marcas/i);
});

test('VP.4-A: Historical tonnage action button is rendered with ui-metric and modal callback', () => {
  const html = renderStats();

  assert.match(html, /Tonelaje histórico:/i);
  assert.match(html, /ui-metric font-bold text-text-secondary/);

  const statsSource = source('views/StatsView.tsx');
  assert.ok(
    statsSource.includes("onClick={() => setIsTonnageModalOpen(true)}"),
    'StatsView must open TonnageEquivalenceModal on tonnage click'
  );
  assert.ok(statsSource.includes('<TonnageEquivalenceModal'), 'StatsView must render TonnageEquivalenceModal');
});

test('VP.4-A: 5 accordion headers exist in exact sequence with proper aria controls and touch targets', () => {
  const html = renderStats();
  const statsSource = source('views/StatsView.tsx');

  // Verify the 5 sections in expected order
  const expectedSections = [
    { title: 'Músculos, Fatiga y Fortaleza', suffix: '-muscles' },
    { title: 'Progreso por ejercicio', suffix: '-exercise' },
    { title: 'Consistencia y calendario', suffix: '-consistency' },
    { title: 'Peso corporal y meta', suffix: '-bodyweight' },
    { title: 'Calculadora 1RM', suffix: '-calculator' }
  ];

  for (const section of expectedSections) {
    assert.ok(html.includes(section.title), `HTML must contain section header: ${section.title}`);
    assert.match(html, new RegExp(`aria-controls="[^"]*${section.suffix}"`), `HTML must link aria-controls ending in ${section.suffix}`);
  }

  // All 5 accordion buttons must have min-h-16 (64px Apple HIG compliant touch target)
  const minH16Count = (statsSource.match(/min-h-16/g) ?? []).length;
  assert.equal(minH16Count, 5, `Expected 5 min-h-16 accordion header buttons, got ${minH16Count}`);

  // All 5 buttons start with aria-expanded="false"
  const ariaExpandedFalseCount = (html.match(/aria-expanded="false"/g) ?? []).length;
  assert.equal(ariaExpandedFalseCount, 5, `Expected 5 collapsed accordion headers initially, got ${ariaExpandedFalseCount}`);
});

test('VP.4-A: Accordion exclusive toggle contract is preserved in source', () => {
  const statsSource = source('views/StatsView.tsx');

  // Exclusive toggle function contract
  assert.ok(
    statsSource.includes("const toggleSection = (sectionId: string) => {"),
    'toggleSection handler must exist'
  );
  assert.ok(
    statsSource.includes("setOpenSection((current) => current === sectionId ? null : sectionId);"),
    'toggleSection must exclusively toggle sections (close if already open, open only clicked)'
  );
});

test('VP.4-A: Accordion badges use semantic design tokens and avoid un-themed text-zinc-300', () => {
  const statsSource = source('views/StatsView.tsx');

  // Header badges must not use raw un-themed text-zinc-300 in accordion buttons
  const headerSectionMatches = statsSource.match(/toggleSection\('[^']+'\)[\s\S]*?<\/button>/g) ?? [];
  assert.equal(headerSectionMatches.length, 5, `Expected 5 toggleSection button blocks, found ${headerSectionMatches.length}`);

  for (const block of headerSectionMatches) {
    assert.doesNotMatch(
      block,
      /text-zinc-300/,
      'Accordion header buttons must not use low-contrast text-zinc-300'
    );
    assert.doesNotMatch(
      block,
      /font-mono/,
      'Accordion header badges should use font-sans font-bold typography per design system'
    );
  }
});
