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

test('StrengthRankBadge: renders image referencing /ranks/<rank>.png', () => {
  for (const rank of ['novato', 'gladiador', 'elite', 'dios'] as const) {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(StrengthRankBadge, { rank, size: 'lg', showGlow: true })
    );

    assert.ok(html.includes(`/ranks/${rank}.png`));
    assert.ok(html.includes(STRENGTH_RANK_VISUALS[rank].name));
    assert.ok(html.includes('drop-shadow(0 0 10px'), 'The glow is applied to transparent badge artwork, not its container');
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
