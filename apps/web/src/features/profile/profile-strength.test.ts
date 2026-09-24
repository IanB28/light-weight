import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  ALL_MUSCLE_GROUPS,
  type Exercise,
  type LoggedSet,
  type MuscleGroup,
  type WorkoutSession
} from '@light-weight/domain';
import { ProfileStrengthSection } from './ProfileStrengthSection.js';
import { ProfileView } from './ProfileView.js';
import { StrengthRankBadge } from '../../components/StrengthRankBadge.js';
import { AnatomicalBodyMap } from '../../components/charts/AnatomicalBodyMap.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { DEFAULT_USER_PROFILE } from '../../lib/storage.js';
import { STRENGTH_RANK_VISUALS } from '../../lib/strength-rank-visuals.js';

function s(weightKg: number, reps: number): LoggedSet {
  return {
    setIndex: 1,
    weightKg,
    reps,
    completed: true,
    setType: 'working',
    isWarmup: false
  };
}

const mockBenchExercise: Exercise = {
  id: 'ex-bench',
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

const all11Exercises: Exercise[] = [
  { id: 'ex-bench', name: 'Bench Press', category: 'barbell', primaryMuscle: 'chest', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-pullup', name: 'Pull Up', category: 'bodyweight', primaryMuscle: 'back', loading: { mechanism: 'bodyweight', loadMode: 'added_weight', bodyweightFactor: 1, supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false } },
  { id: 'ex-ohp', name: 'Overhead Press', category: 'barbell', primaryMuscle: 'shoulders', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-curl', name: 'Barbell Curl', category: 'barbell', primaryMuscle: 'biceps', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-dips', name: 'Dips', category: 'bodyweight', primaryMuscle: 'triceps', loading: { mechanism: 'bodyweight', loadMode: 'added_weight', bodyweightFactor: 1, supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false } },
  { id: 'ex-wrist-curl', name: 'Wrist Curl', category: 'barbell', primaryMuscle: 'forearms', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-squat', name: 'Squat', category: 'barbell', primaryMuscle: 'quadriceps', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-rdl', name: 'RDL', category: 'barbell', primaryMuscle: 'hamstrings', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-hip-thrust', name: 'Hip Thrust', category: 'barbell', primaryMuscle: 'glutes', loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true } },
  { id: 'ex-calf-raise', name: 'Calf Raise', category: 'machine', primaryMuscle: 'calves', loading: { mechanism: 'selectorized', loadMode: 'total', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false } },
  { id: 'ex-cable-crunch', name: 'Cable Crunch', category: 'cable', primaryMuscle: 'core', loading: { mechanism: 'cable', loadMode: 'total', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false } }
];

test('ProfileStrengthSection: renders empty state when no history is present', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileStrengthSection, {
        history: [],
        exercises: [mockBenchExercise],
        bodyweightKg: 80,
        gender: 'male',
        bodyweightEntries: [{ date: '2026-08-31', weightKg: 80 }]
      })
    )
  );

  assert.ok(html.includes('Sin datos de fuerza'));
  assert.ok(!html.includes('Overall completo'));
  assert.ok(!html.includes('Overall provisional'));
});

test('ProfileStrengthSection: shows prompt when gender is unset', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileStrengthSection, {
        history: [],
        exercises: [mockBenchExercise],
        bodyweightKg: 80,
        gender: null,
        onConfigureGender: () => {}
      })
    )
  );

  assert.ok(html.includes('Configurar género'));
});

test('ProfileStrengthSection: explains the legitimate bodyweight entry surfaces instead of opening Training settings', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileStrengthSection, {
        history: [],
        exercises: [mockBenchExercise],
        bodyweightKg: null,
        gender: 'male'
      })
    )
  );

  assert.ok(html.includes('Falta tu peso corporal'));
  assert.ok(html.includes('Regístralo desde Inicio o Progreso'));
  assert.ok(!html.includes('Preferencias de entrenamiento'));
});

test('ProfileStrengthSection: renders provisional Overall card when 1-10 muscles are rated', () => {
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [s(100, 8)]
      }
    }
  ];

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileStrengthSection, {
        history,
        exercises: [mockBenchExercise],
        bodyweightKg: 80,
        gender: 'male',
        bodyweightEntries: [{ date: '2026-08-31', weightKg: 80 }]
      })
    )
  );

  // Overall hero should be rendered with provisional badge
  assert.ok(html.includes('Overall'));
  assert.ok(html.includes('Overall provisional'));
  assert.ok(!html.includes('Overall completo'));
  assert.ok(html.includes('1 / 11 grupos evaluados'));
  assert.ok(html.includes('Maestro'));
  assert.ok(html.includes('/ranks/maestro.png'));
});

test('ProfileStrengthSection: renders complete Overall card when all 11 muscles are rated', () => {
  const sets: Record<string, LoggedSet[]> = {};
  for (const ex of all11Exercises) {
    sets[ex.id] = [s(100, 5)];
  }

  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets
    }
  ];

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileStrengthSection, {
        history,
        exercises: all11Exercises,
        bodyweightKg: 80,
        gender: 'male',
        bodyweightEntries: [{ date: '2026-08-31', weightKg: 80 }]
      })
    )
  );

  assert.ok(html.includes('Overall completo'));
  assert.ok(!html.includes('Overall provisional'));
  assert.ok(html.includes('11 / 11 grupos evaluados'));
});

test('StrengthRankBadge: renders image referencing /ranks/<rank>.png and dual silhouette aura layers when showGlow is true', () => {
  for (const rank of ['novato', 'gladiador', 'elite', 'dios'] as const) {
    const visual = STRENGTH_RANK_VISUALS[rank];
    const htmlWithGlow = ReactDOMServer.renderToStaticMarkup(
      React.createElement(StrengthRankBadge, { rank, size: 'lg', showGlow: true })
    );

    // Image reference and name
    assert.ok(htmlWithGlow.includes(visual.assetPath));
    assert.ok(htmlWithGlow.includes(visual.name));

    // showGlow creates dual silhouette aura layers using visual.assetPath as mask
    assert.ok(htmlWithGlow.includes('data-testid="strength-rank-aura"'), 'Aura container must be created when showGlow is true');
    assert.ok(htmlWithGlow.includes('data-testid="strength-rank-aura-inner"'), 'Inner contour aura layer must be created');
    assert.ok(htmlWithGlow.includes('data-testid="strength-rank-aura-outer"'), 'Outer atmospheric halo aura layer must be created');

    assert.ok(htmlWithGlow.includes(`mask-image:url(&quot;${visual.assetPath}&quot;)`), 'Standard mask-image must use visual.assetPath');
    assert.ok(htmlWithGlow.includes(`-webkit-mask-image:url(&quot;${visual.assetPath}&quot;)`), 'WebKit mask-image must use visual.assetPath');
    assert.ok(htmlWithGlow.includes('mask-repeat:no-repeat'), 'Standard mask-repeat must be no-repeat');
    assert.ok(htmlWithGlow.includes('-webkit-mask-repeat:no-repeat'), 'WebKit mask-repeat must be no-repeat');
    assert.ok(htmlWithGlow.includes('mask-position:center'), 'Standard mask-position must be center');
    assert.ok(htmlWithGlow.includes('-webkit-mask-position:center'), 'WebKit mask-position must be center');
    assert.ok(htmlWithGlow.includes('mask-size:contain'), 'Standard mask-size must be contain');
    assert.ok(htmlWithGlow.includes('-webkit-mask-size:contain'), 'WebKit mask-size must be contain');
    assert.ok(htmlWithGlow.includes('blur('), 'Aura must use blur');

    // No drop-shadow on image, no generic rectangular or circular orb
    assert.ok(!htmlWithGlow.includes('drop-shadow'), 'Native drop-shadow must be replaced by mask-based aura');
    assert.ok(!htmlWithGlow.includes('rounded-full bg-'), 'No generic orb background');

    // Original PNG remains rendered above/after aura in DOM order
    const auraIndex = htmlWithGlow.indexOf('data-testid="strength-rank-aura"');
    const imgIndex = htmlWithGlow.indexOf('<img');
    assert.ok(auraIndex !== -1 && imgIndex > auraIndex, 'Original PNG must be rendered above the aura in stacking order');

    // showGlow=false does not render aura
    const htmlWithoutGlow = ReactDOMServer.renderToStaticMarkup(
      React.createElement(StrengthRankBadge, { rank, size: 'lg', showGlow: false })
    );
    assert.ok(!htmlWithoutGlow.includes('data-testid="strength-rank-aura"'), 'Aura must not be rendered when showGlow is false');
    assert.ok(!htmlWithoutGlow.includes('mask-image'), 'No mask layer when showGlow is false');
  }
});

test('AnatomicalBodyMap: renders 9-rank colors in strength mode with profile presentation', () => {
  const dummyAnalytics: any = {};
  for (const m of ALL_MUSCLE_GROUPS) {
    dummyAnalytics[m] = {
      muscle: m,
      topEst1RmKg: 100,
      strengthEvaluation: {
        version: 2,
        rank: 'leyenda',
        rankIndex: 6,
        strengthScore: 6.0,
        currentRatio: 1.7,
        oneRmKg: 100,
        bodyweightKg: 80,
        nextRank: 'inmortal',
        targetRatio: 1.9,
        targetOneRmKg: 152,
        kgToNextRank: 52,
        progressPctToNextRank: 0
      }
    };
  }

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(AnatomicalBodyMap, {
        data: dummyAnalytics,
        mode: 'strength',
        strengthPresentation: 'profile',
        gender: 'male',
        selectedMuscle: null,
        onSelectMuscle: () => {}
      })
    )
  );

  // Leyenda fill color #1E90A8 should be present on SVG paths
  assert.ok(html.includes('#1E90A8'));
  // The responsive legend carries a real rank badge, color dot, and full
  // localized name for each of the nine canonical ranks.
  for (const rank of Object.keys(STRENGTH_RANK_VISUALS) as Array<keyof typeof STRENGTH_RANK_VISUALS>) {
    assert.ok(html.includes(`/ranks/${rank}.png`));
    assert.ok(html.includes(STRENGTH_RANK_VISUALS[rank].name));
  }
  assert.ok(html.includes('grid-cols-2'));
  assert.ok(html.includes('min-[380px]:grid-cols-3'), 'Legend must use min-[380px] responsive breakpoint');
  assert.ok(!html.includes('whitespace-nowrap'), 'Legend must not use whitespace-nowrap');
  assert.ok(!html.includes('truncate leading-tight'), 'Legend must not truncate rank names — all 9 must be fully readable');
  assert.ok(html.includes('break-words'), 'Legend must use break-words to allow full names to wrap instead of clip');
});

test('STRENGTH_RANK_VISUALS: final canonical rank tokens match approved specification', () => {
  assert.equal(STRENGTH_RANK_VISUALS.novato.fill, '#4A4E57');
  assert.equal(STRENGTH_RANK_VISUALS.novato.accent, '#8A8F99');

  assert.equal(STRENGTH_RANK_VISUALS.principiante.fill, '#B5652D');
  assert.equal(STRENGTH_RANK_VISUALS.principiante.accent, '#E08A4F');

  assert.equal(STRENGTH_RANK_VISUALS.gladiador.fill, '#8A5A1F');
  assert.equal(STRENGTH_RANK_VISUALS.gladiador.accent, '#D99A3D');

  assert.equal(STRENGTH_RANK_VISUALS.elite.fill, '#D4A017');
  assert.equal(STRENGTH_RANK_VISUALS.elite.accent, '#FFD966');

  assert.equal(STRENGTH_RANK_VISUALS.maestro.fill, '#3B5A7A');
  assert.equal(STRENGTH_RANK_VISUALS.maestro.accent, '#5FA8D3');

  assert.equal(STRENGTH_RANK_VISUALS.leyenda.fill, '#1E90A8');
  assert.equal(STRENGTH_RANK_VISUALS.leyenda.accent, '#7FF0E8');

  assert.equal(STRENGTH_RANK_VISUALS.inmortal.fill, '#6B1F5C');
  assert.equal(STRENGTH_RANK_VISUALS.inmortal.accent, '#C93C7A');

  assert.equal(STRENGTH_RANK_VISUALS.semidios.fill, '#0D0D10');
  assert.equal(STRENGTH_RANK_VISUALS.semidios.secondaryFill, '#D4A017');
  assert.equal(STRENGTH_RANK_VISUALS.semidios.accent, '#FFD700');

  assert.equal(STRENGTH_RANK_VISUALS.dios.fill, '#F5F5FA');
  assert.equal(STRENGTH_RANK_VISUALS.dios.accent, '#FFD700');
});

test('ProfileView: renders ProfileStrengthSection within profile summary', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: { ...DEFAULT_USER_PROFILE, gender: 'male' },
        userInfo: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
        history: [],
        exercises: [mockBenchExercise],
        onSave: () => {},
        bodyweightKg: 80
      })
    )
  );

  // Profile should include Nivel de Fuerza section
  assert.ok(html.includes('Nivel de Fuerza'));
  assert.ok(html.includes('Sin datos de fuerza'));
});

test('ProfileView: Personal Records renders compact horizontal 4-zone row [thumb] [name] [rank] [PR weight]', () => {
  const mockSession: WorkoutSession = {
    id: 'ws-1',
    userId: 'u1',
    startedAt: '2026-09-20T10:00:00.000Z',
    endedAt: '2026-09-20T11:00:00.000Z',
    sets: {
      'ex-bench': [s(100, 5)]
    }
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: { ...DEFAULT_USER_PROFILE, gender: 'male' },
        userInfo: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
        history: [mockSession],
        exercises: [mockBenchExercise],
        onSave: () => {},
        bodyweightKg: 80
      })
    )
  );

  // Section heading
  assert.ok(html.includes('Récords personales'));
  // Zone 1: Compact exercise badge/icon thumbnail container
  assert.ok(html.includes('data-testid="pr-exercise-badge"'), 'Each PR row must include a compact exercise badge container');
  // Zone 2: Exercise name in flexible center zone
  assert.ok(html.includes('data-testid="pr-exercise-name"'), 'Each PR row must include flexible exercise name container');
  assert.ok(html.includes('Bench Press'));
  // Zone 3: Fixed rank badge slot with strength rank badge
  assert.ok(html.includes('data-testid="pr-rank-slot"'), 'Each PR row must include fixed rank slot');
  assert.ok(html.includes('w-7 shrink-0'), 'Rank slot must have fixed w-7 shrink-0 geometry');
  assert.ok(html.includes('/ranks/maestro.png') || html.includes('Maestro'), 'Bench press at 100x5 (80kg male) must render calculated strength rank badge');
  // Zone 4: Formatted PR weight in right zone
  assert.ok(html.includes('data-testid="pr-weight-slot"'), 'Each PR row must include fixed PR weight slot');
  assert.ok(html.includes('w-20 shrink-0 text-right'), 'PR weight slot must have fixed/stable width with text-right');
  assert.ok(html.includes('tabular-nums'), 'PR weight must format with tabular-nums');
  assert.ok(html.includes('112.5 kg') || html.includes('113 kg') || html.includes('kg'), 'PR weight with unit must be rendered');

  // DOM ordering: thumb < name < rank < weight
  const thumbIdx = html.indexOf('data-testid="pr-exercise-badge"');
  const nameIdx = html.indexOf('data-testid="pr-exercise-name"');
  const rankIdx = html.indexOf('data-testid="pr-rank-slot"');
  const weightIdx = html.indexOf('data-testid="pr-weight-slot"');
  assert.ok(thumbIdx < nameIdx, 'Thumbnail must precede name');
  assert.ok(nameIdx < rankIdx, 'Name must precede rank badge');
  assert.ok(rankIdx < weightIdx, 'Rank badge must precede PR weight');
});

test('ProfileView: Profile header title matches ViewHeader scale', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: { ...DEFAULT_USER_PROFILE, gender: 'male' },
        userInfo: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
        history: [],
        exercises: [],
        onSave: () => {}
      })
    )
  );

  assert.ok(html.includes('id="profile-screen-title"'), 'Header must render profile-screen-title');
  assert.ok(html.includes('text-[clamp(1.5rem,6.5vw,1.95rem)]'), 'Header title must use top-level ViewHeader fluid scale');
  assert.ok(html.includes('font-extrabold'), 'Header title must use font-extrabold');
  assert.ok(html.includes('leading-tight'), 'Header title must use leading-tight');
  assert.ok(html.includes('tracking-tight'), 'Header title must use tracking-tight');
});

test('ProfileView: Personal Records renders empty state when no records exist', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: { ...DEFAULT_USER_PROFILE, gender: 'male' },
        userInfo: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
        history: [],
        exercises: [mockBenchExercise],
        onSave: () => {},
        bodyweightKg: 80
      })
    )
  );

  assert.ok(html.includes('Récords personales'));
  assert.ok(html.includes('Completa entrenamientos para descubrir tus récords'));
  assert.ok(!html.includes('data-testid="pr-exercise-badge"'));
});
