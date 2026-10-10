import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkoutSession, Exercise } from '@light-weight/domain';
import type { UserProfile, BodyweightEntry } from '../lib/storage.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { PREFERENCES_STORAGE_KEY } from '../lib/preferences.js';
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

const storageMap = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size; }
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

test('VP.4-A: 30-day overview renders 3 primary metrics with ui-metric and ui-unit in KG', () => {
  // Ensure default metric preferences
  storageMap.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, data: { units: 'metric', bodyweightUnits: 'metric' } }));

  const html = renderStats();

  // Overview title and subtitle
  assert.match(html, /Últimos 30 días/i);
  assert.match(html, /Actividad/i);

  // 3 primary metric headers
  assert.match(html, /Mejor e1RM/i);
  assert.match(html, /Sesiones/i);
  assert.match(html, /Volumen/i);

  // Tabular numbers and semantic units
  assert.match(html, /ui-metric/);
  assert.match(html, /ui-unit/);

  // Value formatting: number and unit are present without truncation
  assert.match(html, />115\.6</);
  assert.match(html, />500</);
  assert.match(html, />kg</);
});

test('VP.4-A: 30-day overview renders primary metrics with LB unit in imperial mode', () => {
  storageMap.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, data: { units: 'imperial', bodyweightUnits: 'imperial' } }));

  const html = renderStats();

  // In imperial mode, unit is lb
  assert.match(html, />lb</);
  // Numbers are converted to pounds and rendered
  assert.match(html, /ui-metric/);
  assert.match(html, /ui-unit/);

  // Restore metric
  storageMap.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, data: { units: 'metric', bodyweightUnits: 'metric' } }));
});

test('VP.4-A: 30-day overview displays large volume numbers without ellipsis truncation', () => {
  // Session with 125,500 kg volume
  const heavySession: WorkoutSession = {
    ...sampleSession,
    sets: {
      'bench-press': [
        {
          setIndex: 1,
          weightKg: 251,
          reps: 500,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const html = renderStats({ history: [heavySession] });

  // Volume value must be rendered in full (e.g. compact format like 125,5 mil or 126 mil with standard or non-breaking space)
  assert.match(html, />125,5[\s\u00a0]mil|126[\s\u00a0]mil/);
  assert.match(html, />kg</);

  // Must NOT contain ellipsis truncation on the metric
  assert.doesNotMatch(html, />12[56].*?\.\.\.</);
});

test('VP.4-A: Context row renders realistically long exercise name without clipping weekly streak', () => {
  const longNameExercise: Exercise = {
    ...sampleExercise,
    id: 'long-ex',
    name: 'Press de banca inclinado con mancuernas pesadas'
  };

  const longSession: WorkoutSession = {
    ...sampleSession,
    sets: {
      'long-ex': [
        {
          setIndex: 1,
          weightKg: 40,
          reps: 10,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const html = renderStats({
    exercises: [longNameExercise],
    history: [longSession]
  });

  // Long exercise name must be present in full
  assert.match(html, /Press de banca inclinado con mancuernas pesadas/);

  // Weekly streak must remain completely present
  assert.match(html, /semanas de racha/i);

  // Source inspection: context row has wrapping flex-wrap and strictly NO line-clamp or max-w- restriction
  const statsSource = source('views/StatsView.tsx');
  const contextRowSource = statsSource.match(/progressSummary\.bestExerciseName[\s\S]*?progressSummary\.weeklyStreak/)?.[0] ?? '';
  assert.doesNotMatch(contextRowSource, /line-clamp/, 'Context row exercise name must not use line-clamp to ensure full visibility');
  assert.doesNotMatch(contextRowSource, /max-w-/, 'Context row exercise name must not use artificial max-w constraint');
  assert.match(statsSource, /flex-wrap/, 'Context row must allow wrapping');
  assert.match(statsSource, /min-\[390px\]:text-base/, 'Overview metrics must scale to 16px at min-[390px]');
});

test('VP.4-A: Empty history displays — placeholder and noMarks text', () => {
  const emptyHtml = renderStats({ history: [] });

  assert.match(emptyHtml, />—</);
  assert.match(emptyHtml, />0</);
  assert.match(emptyHtml, /Sin marcas/i);
});

test('VP.4-A: Historical tonnage action button has >=44px touch target (min-h-11) and modal callback', () => {
  const html = renderStats();

  assert.match(html, /Tonelaje histórico:/i);
  assert.match(html, /ui-metric font-bold text-text-secondary/);

  // Verify >= 44px touch target class min-h-11 (44px)
  assert.match(html, /min-h-11/, 'Historical tonnage button must have min-h-11 for 44px Apple HIG touch target');

  const statsSource = source('views/StatsView.tsx');
  assert.ok(
    statsSource.includes("onClick={() => setIsTonnageModalOpen(true)}"),
    'StatsView must open TonnageEquivalenceModal on tonnage click'
  );
  assert.ok(statsSource.includes('<TonnageEquivalenceModal'), 'StatsView must render TonnageEquivalenceModal');
});

test('VP.4-A: 5 accordion headers exist in exact sequence with proper aria controls and 64px touch targets', () => {
  const html = renderStats();
  const statsSource = source('views/StatsView.tsx');

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
