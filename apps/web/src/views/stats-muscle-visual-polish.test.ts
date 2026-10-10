import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  type WorkoutSession,
  type Exercise,
  ALL_MUSCLE_GROUPS,
  type MuscleGroup,
  type StrengthEvaluation,
  type StrengthRank
} from '@light-weight/domain';
import type { UserProfile, BodyweightEntry } from '../lib/storage.js';
import { PreferencesProvider } from '../lib/preferences-context.js';
import { DEFAULT_APP_PREFERENCES, saveStoredPreferences } from '../lib/preferences.js';
import { I18nProvider } from '../lib/i18n.js';
import { StatsView } from './StatsView.js';
import { AnatomicalBodyMap, type MuscleAnalytics } from '../components/charts/AnatomicalBodyMap.js';
import { STRENGTH_RANK_VISUALS } from '../lib/strength-rank-visuals.js';
import type { BalanceBodyPathData } from '../lib/balance-anatomy.js';
import type { FatigueBodyPathData } from '../lib/fatigue-anatomy.js';

const source = (relPath: string) => {
  const direct = resolve(process.cwd(), 'src', relPath);
  if (existsSync(direct)) return readFileSync(direct, 'utf8');
  return readFileSync(resolve(process.cwd(), 'apps/web/src', relPath), 'utf8');
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
  weightKg: 80
};

function renderStats(overrides: Partial<React.ComponentProps<typeof StatsView>> = {}, lang: 'es' | 'en' = 'es') {
  saveStoredPreferences({ ...DEFAULT_APP_PREFERENCES, language: lang });
  const props: React.ComponentProps<typeof StatsView> = {
    history: overrides.history ?? [sampleSession],
    exercises: overrides.exercises ?? [sampleExercise],
    bodyweightEntries: overrides.bodyweightEntries ?? [sampleBodyweight],
    targetWeight: overrides.targetWeight ?? 78,
    profile: overrides.profile ?? sampleProfile,
    onSaveProfile: overrides.onSaveProfile ?? (() => {}),
    onSaveBodyweight: overrides.onSaveBodyweight ?? (() => {}),
    onSaveTargetWeight: overrides.onSaveTargetWeight ?? (() => {}),
    onOpenSettings: overrides.onOpenSettings ?? (() => {}),
    onNavigateToWorkout: overrides.onNavigateToWorkout ?? (() => {}),
    isWorkoutActive: overrides.isWorkoutActive ?? false,
    activeWorkoutDuration: overrides.activeWorkoutDuration ?? '00:00',
    ...overrides
  };

  return renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        React.createElement(StatsView, props)
      )
    )
  );
}

function renderMap(props: React.ComponentProps<typeof AnatomicalBodyMap>, lang: 'es' | 'en' = 'es') {
  saveStoredPreferences({ ...DEFAULT_APP_PREFERENCES, language: lang });
  return renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        React.createElement(AnatomicalBodyMap, props)
      )
    )
  );
}

// ============================================================================
// STAGE B1 TESTS: ANALYTICAL CONTROLS (BIOMETRICS, MODE SWITCHER, WINDOW)
// ============================================================================

test('VP.4-B1: Biometrics bar renders standards label, gender badge and current bodyweight', () => {
  const statsSrc = source('views/StatsView.tsx');
  // Source invariants: biometrics bar uses semantic classes and min-h-11 targets
  assert.ok(statsSrc.includes("t('stats.strengthStandards')"));
  assert.ok(statsSrc.includes("t('stats.male')"));
  assert.ok(statsSrc.includes("t('stats.female')"));
  assert.ok(statsSrc.includes("t('stats.configureGender')"));
  assert.ok(statsSrc.includes('border border-border-subtle bg-surface-input'));
  assert.ok(statsSrc.includes('min-h-11'));
});

test('VP.4-B1: Mode switcher renders all 3 modes with w-3.5 h-3.5 icons, aria-pressed, and >=44px touch targets', () => {
  const statsSrc = source('views/StatsView.tsx');
  // Check exact icon preservation
  assert.ok(statsSrc.includes('<Scale className="w-3.5 h-3.5" />'));
  assert.ok(statsSrc.includes('<Flame className="w-3.5 h-3.5" />'));
  assert.ok(statsSrc.includes('<Shield className="w-3.5 h-3.5" />'));
  // Check min-h-11 (44px) touch target on segmented buttons
  assert.ok(statsSrc.includes('min-h-11'));
  // Check aria-pressed for accessibility
  assert.ok(statsSrc.includes("aria-pressed={muscleAnalysisMode === 'balance'}"));
  assert.ok(statsSrc.includes("aria-pressed={muscleAnalysisMode === 'fatigue'}"));
  assert.ok(statsSrc.includes("aria-pressed={muscleAnalysisMode === 'strength'}"));
  // Semantic switcher container
  assert.ok(statsSrc.includes('p-1 rounded-ui-xl bg-surface-input border border-border-subtle'));
});

test('VP.4-B1: Balance period selector renders 7d, 90d, and full history options with semantic tokens', () => {
  const statsSrc = source('views/StatsView.tsx');
  assert.ok(statsSrc.includes("days: 7, label: '7d'"));
  assert.ok(statsSrc.includes("days: 90, label: '90d'"));
  assert.ok(statsSrc.includes("days: 0, label: t('stats.allTime')"));
  assert.ok(statsSrc.includes('aria-pressed={muscleWindow === opt.days}'));
  assert.ok(statsSrc.includes("t('stats.window')"));
  assert.ok(statsSrc.includes('min-h-11'));
});

// ============================================================================
// STAGE B2 TESTS: ANATOMICAL BODY MAP PRESENTATION & LEGENDS
// ============================================================================

test('VP.4-B2: AnatomicalBodyMap container uses semantic tokens and preserves front and back views', () => {
  const mapSrc = source('components/charts/AnatomicalBodyMap.tsx');
  assert.ok(mapSrc.includes('bg-surface-input'));
  assert.ok(mapSrc.includes('border-border-subtle'));
  assert.ok(!mapSrc.includes('bg-gradient-to-b from-white/[0.07] to-white/[0.02]'));

  const html = renderMap({
    mode: 'balance',
    gender: 'male',
    data: {}
  });

  assert.ok(html.includes('Frente'));
  assert.ok(html.includes('Dorso'));
  assert.ok(html.includes('role="img"'));
});

test('VP.4-B2: All 9 strength ranks exist in the strength legend with badge images and break-words', () => {
  const html = renderMap({
    mode: 'strength',
    gender: 'male',
    data: {}
  });

  for (const rank of Object.keys(STRENGTH_RANK_VISUALS) as StrengthRank[]) {
    assert.ok(html.includes(`/ranks/${rank}.png`), `Must contain badge image for ${rank}`);
  }
  assert.ok(html.includes('Novato'));
  assert.ok(html.includes('Principiante'));
  assert.ok(html.includes('Gladiador'));
  assert.ok(html.includes('Élite'));
  assert.ok(html.includes('Maestro'));
  assert.ok(html.includes('Leyenda'));
  assert.ok(html.includes('Inmortal'));
  assert.ok(html.includes('Semidiós'));
  assert.ok(html.includes('Dios'));
});

test('VP.4-B2: Fatigue legend preserves 4 states with semantic container', () => {
  const html = renderMap({
    mode: 'fatigue',
    gender: 'male',
    data: {}
  });

  assert.ok(html.includes('Fatigado'));
  assert.ok(html.includes('Recuperando'));
  assert.ok(html.includes('Listo'));
  assert.ok(html.includes('Fresco'));
});

// ============================================================================
// STAGE B3 TESTS: GROUPED INSET ROWS & UNDEREXPOSED REGIONS
// ============================================================================

test('VP.4-B3: Underexposed regions list uses grouped inset rows and native button triggers', () => {
  const statsSrc = source('views/StatsView.tsx');
  // Grouped inset list container
  assert.ok(statsSrc.includes('divide-y divide-amber-500/20 rounded-ui-lg border border-amber-500/25 bg-amber-500/5'));
  // Native button row with min-h-12 (>=44px touch target)
  assert.ok(statsSrc.includes('w-full min-h-12 px-3 py-2.5 flex items-center justify-between text-left hover:bg-amber-500/15'));
  assert.ok(statsSrc.includes('stats.viewOnMap'));
});

test('VP.4-B3: Rankings accordion uses grouped inset list with subtle dividers and button rows', () => {
  const statsSrc = source('views/StatsView.tsx');
  // Grouped inset list
  assert.ok(statsSrc.includes('divide-y divide-border-subtle rounded-ui-lg border border-border-subtle bg-surface-input overflow-hidden'));
  // Button rows with touch target >=44px (min-h-12 = 48px) and focus visible ring
  assert.ok(statsSrc.includes('min-h-12 px-3 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'));
  // aria-pressed is present on selection buttons
  assert.ok(statsSrc.includes('aria-pressed={isSelected}'));
});

test('VP.4-B3: Balance ranking row preserves path name, exposure count, hard count, and role', () => {
  const statsSrc = source('views/StatsView.tsx');
  assert.ok(statsSrc.includes('Rol: {ROLE_DISPLAY_NAMES[pathData.strongestRole]?.es ?? pathData.strongestRole}'));
  assert.ok(statsSrc.includes('workout.sets'));
  assert.ok(statsSrc.includes('({hardCount} duras)'));
});

test('VP.4-B3: Fatigue ranking row preserves FEU, state, time elapsed, and uncertainty warnings', () => {
  const statsSrc = source('views/StatsView.tsx');
  assert.ok(statsSrc.includes('({residualFeu.toFixed(2)} FEU)'));
  assert.ok(statsSrc.includes('Esfuerzo sin registrar'));
  assert.ok(statsSrc.includes('s/ esfuerzo'));
  assert.ok(statsSrc.includes("`Certeza: ${pathData.confidence === 'moderate' ? 'moderada' : 'baja'}`"));
});

test('VP.4-B3: Strength ranking row preserves rank badge, ratio, e1RM, next-rank delta, and max-rank', () => {
  const statsSrc = source('views/StatsView.tsx');
  assert.ok(statsSrc.includes('StrengthRankBadge rank={item.strengthEvaluation.rank} size="sm"'));
  assert.ok(statsSrc.includes('item.strengthEvaluation.currentRatio.toFixed(2)}× BW'));
  assert.ok(statsSrc.includes('stats.maxRank'));
  assert.ok(statsSrc.includes('kgToNextRank'));
});

// ============================================================================
// STAGE B4 TESTS: SELECTED-MUSCLE DETAIL PANELS
// ============================================================================

test('VP.4-B4: Selected balance path detail renders 3-column metric strip and contributor chips', () => {
  const mockBalance: Partial<Record<string, BalanceBodyPathData>> = {
    chest: {
      pathKey: 'chest' as any,
      exposureCount: 10,
      hardExposureCount: 6,
      contributors: [{ kind: 'anatomical', entity: 'pectoralis_major' }],
      roles: ['prime'],
      strongestRole: 'prime',
      lastExposedAt: '2026-10-01T12:00:00Z',
      sources: ['semantic_v2']
    }
  };

  const html = renderMap({
    mode: 'balance',
    gender: 'male',
    balanceByPath: mockBalance as any,
    selectedPath: 'chest' as any,
    onSelectPath: () => {}
  });

  assert.ok(html.includes('Series de exposición'));
  assert.ok(html.includes('10 series'));
  assert.ok(html.includes('Series duras'));
  assert.ok(html.includes('6 series'));
  assert.ok(html.includes('Rol dominante'));
  assert.ok(html.includes('Pectoral mayor'));
  assert.ok(html.includes('Cerrar'));
});

test('VP.4-B4: Selected fatigue path detail renders residual FEU, 7-day load, and incomplete-effort banner', () => {
  const mockFatigue: Partial<Record<string, FatigueBodyPathData>> = {
    chest: {
      pathKey: 'chest' as any,
      residualFeu: 2.85,
      rolling7DayFeu: 8.50,
      state: 'recovering',
      confidence: 'moderate',
      unknownEffortCount: 2,
      totalEligibleSets: 5,
      lastExposedAt: new Date(Date.now() - 14 * 3600000).toISOString(),
      reasons: [],
      contributors: [
        {
          target: { kind: 'anatomical', entity: 'pectoralis_major' },
          residualFeu: 2.85,
          rolling7DayFeu: 8.50,
          state: 'recovering',
          confidence: 'moderate',
          unknownEffortCount: 2,
          totalEligibleSets: 5
        }
      ]
    }
  };

  const html = renderMap({
    mode: 'fatigue',
    gender: 'male',
    fatigueByPath: mockFatigue as any,
    selectedPath: 'chest' as any,
    onSelectPath: () => {}
  });

  assert.ok(html.includes('Carga residual'));
  assert.ok(html.includes('2.85 FEU'));
  assert.ok(html.includes('Carga 7 días'));
  assert.ok(html.includes('8.50 FEU'));
  assert.ok(html.includes('En recuperación'));
  assert.ok(html.includes('Datos de esfuerzo incompletos: 2 de 5 series'));
  assert.ok(html.includes('Cerrar'));
});

test('VP.4-B4: Selected strength muscle detail renders relative ratio, 1RM, next-rank delta and progress bar', () => {
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

  const mockData: Partial<Record<MuscleGroup, MuscleAnalytics>> = {
    chest: {
      muscle: 'chest',
      nameEs: 'Pecho',
      sets: 10,
      volumeKg: 4000,
      fatigueScore: 0,
      recoveryStatus: 'ready',
      recoveryPct: 100,
      lastTrainedHoursAgo: 24,
      recentHardSetsCount: 6,
      topEst1RmKg: 104,
      topExerciseName: 'Bench Press',
      strengthEvaluation: chestEval
    }
  };

  const html = renderMap({
    mode: 'strength',
    gender: 'male',
    data: mockData,
    selectedMuscle: 'chest',
    onSelectMuscle: () => {}
  });

  assert.ok(html.includes('Fuerza Relativa'));
  assert.ok(html.includes('1.30× BW'));
  assert.ok(html.includes('4.25 / 9.00'));
  assert.ok(html.includes('1RM Estimado'));
  assert.ok(html.includes('104 kg'));
  assert.ok(html.includes('Bench Press'));
  assert.ok(html.includes('Siguiente Rango:'));
  assert.ok(html.includes('Maestro'));
  assert.ok(html.includes('Faltan ≈ +12 kg'));
  assert.ok(html.includes('Cerrar'));
});

// ============================================================================
// SHARED PROFILE & SOCIAL SAFETY TESTS
// ============================================================================

test('VP.4-B: Profile Strength presentation does not leak detail panels or custom stats containers', () => {
  const html = renderMap({
    mode: 'strength',
    strengthPresentation: 'profile',
    gender: 'male',
    data: {}
  });

  // Must NOT render detail card in profile presentation
  assert.ok(!html.includes('Siguiente Rango:'));
  assert.ok(!html.includes('Faltan ≈ +'));
  assert.ok(!html.includes('Cerrar'));
  // All 9 ranks in legend must still render
  assert.ok(html.includes('Novato'));
  assert.ok(html.includes('Dios'));
});

test('VP.4-B: Social presentation renders non-interactive SVG paths without selection handlers', () => {
  const html = renderMap({
    mode: 'strength',
    strengthPresentation: 'social',
    gender: 'male',
    data: {}
  });

  assert.ok(html.includes('data-interactive="false"'));
});
