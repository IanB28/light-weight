import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  type MuscleGroup,
  type StrengthEvaluation,
  resolveExerciseStrengthTarget,
  EXERCISE_SEMANTICS_REGISTRY
} from '@light-weight/domain';
import { AnatomicalBodyMap, type MuscleAnalytics } from './AnatomicalBodyMap.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { I18nProvider } from '../../lib/i18n.js';
import { DEFAULT_APP_PREFERENCES, saveStoredPreferences } from '../../lib/preferences.js';
import type { BalanceBodyPathData } from '../../lib/balance-anatomy.js';
import type { FatigueBodyPathData } from '../../lib/fatigue-anatomy.js';

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

const ALL_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'forearms', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'
];

function createMockMuscleData(overrides: Partial<Record<MuscleGroup, Partial<MuscleAnalytics>>> = {}): Record<MuscleGroup, MuscleAnalytics> {
  const result = {} as Record<MuscleGroup, MuscleAnalytics>;
  for (const group of ALL_GROUPS) {
    result[group] = {
      muscle: group,
      nameEs: group,
      sets: 0,
      volumeKg: 0,
      fatigueScore: 0,
      recoveryStatus: 'ready',
      recoveryPct: 100,
      lastTrainedHoursAgo: null,
      recentHardSetsCount: 0,
      topEst1RmKg: 0,
      ...overrides[group]
    };
  }
  return result;
}

test('1. Balance Legend uses Exposición and contains NO "Volumen bajo/medio/alto"', () => {
  const mockData = createMockMuscleData();
  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'balance',
      selectedMuscle: null,
      onSelectMuscle: () => {}
    })
  );

  // Assert canonical exposure legend titles are present
  assert.ok(html.includes('title="Sin exposición (l0)"'));
  assert.ok(html.includes('title="Exposición baja (l1)"'));
  assert.ok(html.includes('title="Exposición media (l2)"'));
  assert.ok(html.includes('title="Exposición alta (l3)"'));
  assert.ok(html.includes('title="Exposición máxima (l4)"'));

  // Prohibited legacy volume titles must NOT exist in the balance legend
  assert.ok(!html.includes('Volumen bajo'));
  assert.ok(!html.includes('Volumen medio'));
  assert.ok(!html.includes('Volumen alto'));
  assert.ok(!html.includes('Volumen máximo'));
});

test('2. Fatigue Legend renders canonical FatiguePolicyV1 states and NO prohibited strings', () => {
  const mockData = createMockMuscleData();
  const mockFatiguePaths: Partial<Record<string, FatigueBodyPathData>> = {
    chest: {
      pathKey: 'chest' as any,
      residualFeu: 3.5,
      rolling7DayFeu: 12.0,
      state: 'fatigued',
      confidence: 'high',
      unknownEffortCount: 0,
      totalEligibleSets: 10,
      lastExposedAt: null,
      reasons: [],
      contributors: []
    }
  };

  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      fatigueByPath: mockFatiguePaths,
      mode: 'fatigue',
      selectedMuscle: null,
      onSelectMuscle: () => {},
      selectedPath: 'chest' as any,
      onSelectPath: () => {}
    })
  );

  // Legend states
  assert.ok(html.includes('Fatigado'));
  assert.ok(html.includes('Recuperando'));
  assert.ok(html.includes('Listo'));
  assert.ok(html.includes('Fresco'));

  // Prohibited active strings must NOT exist
  assert.ok(!html.includes('Fatiga Real'), 'Must NOT contain "Fatiga Real"');
  assert.ok(!html.includes('Adaptando'), 'Must NOT contain "Adaptando"');
  assert.ok(!html.includes('Fatiga fisiológica'), 'Must NOT contain "Fatiga fisiológica"');
});

test('3. Strength Detail Card renders relative strength, 1RM, work in window and NO legacy fatigue', () => {
  const chestEval: StrengthEvaluation = {
    version: 2,
    rank: 'elite',
    rankIndex: 4,
    strengthScore: 4.25,
    currentRatio: 1.30,
    oneRmKg: 104,
    bodyweightKg: 80,
    nextRank: 'maestro',
    targetRatio: 1.45,
    targetOneRmKg: 116,
    kgToNextRank: 12,
    progressPctToNextRank: 40
  };

  const mockData = createMockMuscleData({
    chest: {
      sets: 12,
      volumeKg: 4200,
      topEst1RmKg: 104,
      topExerciseName: 'Barbell Bench Press',
      strengthEvaluation: chestEval
    }
  });

  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'strength',
      selectedMuscle: 'chest',
      onSelectMuscle: () => {}
    })
  );

  // Assert Strength Detail metrics are present
  assert.ok(html.includes('Fuerza Relativa'), 'Must render Fuerza Relativa');
  assert.ok(html.includes('1.30× BW'), 'Must render relative ratio');
  assert.ok(html.includes('4.25 / 9.00'), 'Must render strength score');
  assert.ok(html.includes('1RM Estimado'), 'Must render 1RM Estimado');
  assert.ok(html.includes('Barbell Bench Press'), 'Must render top exercise name');

  // CRITICAL: Must NOT render legacy workedMap metrics ("Trabajo", sets, volume)
  assert.ok(!html.includes('Trabajo'), 'Must NOT render legacy "Trabajo" card');
  assert.ok(!html.includes('12 series'), 'Must NOT display legacy sets in Strength mode');

  // CRITICAL: Must NOT render legacy fatigue metrics or prohibited strings
  assert.ok(!html.includes('Fatiga Real'), 'Must NOT contain "Fatiga Real"');
  assert.ok(!html.includes('Adaptando'), 'Must NOT contain "Adaptando"');
  assert.ok(!html.includes('Fatiga Alta'), 'Must NOT contain "Fatiga Alta"');
});

test('4. Strength Map projection transparency: granular subpaths display parent group projection', () => {
  const backEval: StrengthEvaluation = {
    version: 2,
    rank: 'maestro',
    rankIndex: 5,
    strengthScore: 5.0,
    currentRatio: 1.65,
    oneRmKg: 132,
    bodyweightKg: 80,
    nextRank: 'leyenda',
    targetRatio: 1.85,
    targetOneRmKg: 148,
    kgToNextRank: 16,
    progressPctToNextRank: 25
  };

  const mockData = createMockMuscleData({
    back: {
      sets: 8,
      volumeKg: 3000,
      topEst1RmKg: 132,
      topExerciseName: 'Barbell Row',
      strengthEvaluation: backEval
    }
  });

  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'strength',
      selectedMuscle: null,
      onSelectMuscle: () => {}
    })
  );

  // Trapezius and upper-back should indicate presentation projection of Espalda
  assert.ok(html.includes('Proyección: Espalda'), 'Subpaths must explicitly indicate projection of parent strength standard');
});

test('5. Mode switching and selection isolation: balance does not render strength cards and vice-versa', () => {
  const mockData = createMockMuscleData({
    chest: {
      sets: 5,
      volumeKg: 1000,
      topEst1RmKg: 100
    }
  });

  // Balance mode with selectedMuscle non-null should NOT render the strength detail card
  const balanceHtml = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'balance',
      selectedMuscle: 'chest',
      onSelectMuscle: () => {},
      selectedPath: null,
      onSelectPath: () => {}
    })
  );

  assert.ok(!balanceHtml.includes('Fuerza Relativa'), 'Balance mode must NOT render strength card from selectedMuscle');
  assert.ok(balanceHtml.includes('Toca cualquier región anatómica'), 'Must prompt for anatomical region tap');
});

test('6. Metric Provenance Regression: Curated high_flared_row registry profile and UI workload isolation', () => {
  // Unmapped curated profile high_flared_row tested directly in registry:
  const profile = EXERCISE_SEMANTICS_REGISTRY.high_flared_row;
  assert.ok(profile, 'high_flared_row profile must exist in EXERCISE_SEMANTICS_REGISTRY');
  const primes = profile.contributions.filter((c) => c.role === 'prime');
  assert.equal(primes.length, 1, 'high_flared_row must have exactly one prime');
  assert.deepEqual(
    primes[0].target,
    { kind: 'anatomical', entity: 'posterior_deltoid' },
    'high_flared_row prime must be posterior_deltoid'
  );

  // UI Provenance & Isolation Check:
  // When shoulders Strength is displayed, verify the UI does not leak legacy back workload
  const shouldersEval: StrengthEvaluation = {
    version: 2,
    rank: 'elite',
    rankIndex: 4,
    strengthScore: 4.10,
    currentRatio: 0.95,
    oneRmKg: 76,
    bodyweightKg: 80,
    nextRank: 'maestro',
    targetRatio: 1.05,
    targetOneRmKg: 84,
    kgToNextRank: 8,
    progressPctToNextRank: 50
  };

  const mockData = createMockMuscleData({
    back: {
      sets: 6,
      volumeKg: 2400,
      topEst1RmKg: 0,
      strengthEvaluation: undefined
    },
    shoulders: {
      sets: 0,
      volumeKg: 0,
      topEst1RmKg: 76,
      topExerciseName: 'High Flared Row',
      strengthEvaluation: shouldersEval
    }
  });

  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'strength',
      selectedMuscle: 'shoulders',
      onSelectMuscle: () => {}
    })
  );

  // Assert Strength detail reflects canonical shoulders evaluation
  assert.ok(html.includes('Hombros'), 'Must display Spanish group name for shoulders');
  assert.ok(html.includes('Fuerza Relativa'), 'Must display Fuerza Relativa');
  assert.ok(html.includes('0.95× BW'), 'Must display relative ratio');
  assert.ok(html.includes('4.10 / 9.00'), 'Must display strength score');
  assert.ok(html.includes('1RM Estimado'), 'Must display 1RM Estimado');

  // CRITICAL PROVENANCE CHECK:
  // Must NOT display legacy back workload (2400 kg or 6 series) inside the shoulders Strength detail card
  assert.ok(!html.includes('2400'), 'Must NOT display legacy back volume in shoulder strength card');
  assert.ok(!html.includes('6 series'), 'Must NOT display legacy back sets in shoulder strength card');
  assert.ok(!html.includes('Trabajo'), 'Strength detail must have no Trabajo card');
});

test('7. Balance mode without balanceByPath does not color from legacy sets', () => {
  // Muscle data with heavy sets on chest
  const mockData = createMockMuscleData({
    chest: {
      sets: 25,
      volumeKg: 8000,
      topEst1RmKg: 120,
      topExerciseName: 'Barbell Bench Press'
    }
  });

  // Render in Balance mode WITHOUT balanceByPath
  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'balance',
      balanceByPath: undefined,
      selectedMuscle: null,
      onSelectMuscle: () => {}
    })
  );

  // The SVG body map MUST render in neutral/untrained state and NOT color paths from legacy sets
  // Verify that untrained muscle fill is used for muscle paths
  assert.ok(html.includes('fill="var(--untrained-muscle-fill'), 'Must use untrained muscle fill on paths');
  // SVG paths must NOT contain accent-color fills from legacy sets
  assert.ok(!html.includes('fill="var(--accent-color)"'), 'Must NOT color paths with max accent fill');
  assert.ok(!html.includes('fill="color-mix(in srgb, var(--accent-color)'), 'Must NOT color paths with tiered accent fill');
});

test('8. Production Balance with path data still colors from exposureCount', () => {
  const mockData = createMockMuscleData();
  const mockBalancePaths: Partial<Record<string, BalanceBodyPathData>> = {
    chest: {
      pathKey: 'chest' as any,
      exposureCount: 12,
      hardExposureCount: 8,
      contributors: [{ kind: 'anatomical', entity: 'pectoralis_major' }],
      roles: ['prime'],
      strongestRole: 'prime',
      lastExposedAt: '2026-09-01T10:00:00Z',
      sources: ['semantic_v2']
    }
  };

  const html = renderWithProviders(
    React.createElement(AnatomicalBodyMap, {
      gender: 'male',
      data: mockData,
      mode: 'balance',
      balanceByPath: mockBalancePaths as any,
      selectedMuscle: null,
      onSelectMuscle: () => {}
    })
  );

  // Must color active regions on SVG paths using accent color derived from exposureCount
  assert.ok(html.includes('fill="var(--accent-color)"'), 'Must color path with accent color from exposureCount');
  assert.ok(html.includes('Pecho (12 series)'), 'Must display exposure count in title');
});
