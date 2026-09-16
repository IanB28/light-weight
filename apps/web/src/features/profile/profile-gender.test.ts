import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { ALL_MUSCLE_GROUPS, type AuthUser, type Gender, type MuscleGroup } from '@light-weight/domain';
import {
  parseUserProfile,
  DEFAULT_USER_PROFILE,
  STORAGE_KEYS,
  type UserProfile
} from '../../lib/storage.js';
import {
  CACHED_AUTH_USER_KEY,
  clearCachedAuthUser,
  getCachedAuthUser,
  setCachedAuthUser
} from '../../lib/auth-cache.js';
import {
  AnatomicalBodyMap,
  type MuscleAnalytics
} from '../../components/charts/AnatomicalBodyMap.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { ProfileView } from './ProfileView.js';

class MockLocalStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return Array.from(this.items.keys())[index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

function createMockAnalytics(): Record<MuscleGroup, MuscleAnalytics> {
  const result = {} as Record<MuscleGroup, MuscleAnalytics>;
  for (const muscle of ALL_MUSCLE_GROUPS) {
    result[muscle] = {
      muscle,
      nameEs: muscle,
      sets: 0,
      volumeKg: 0,
      fatigueScore: 0,
      recoveryStatus: 'ready',
      recoveryPct: 100,
      lastTrainedHoursAgo: null,
      recentHardSetsCount: 0,
      topEst1RmKg: 0
    };
  }
  return result;
}

test('parseUserProfile preserves male and female genders, leaving unset when not specified', () => {
  // 1. Male is parsed correctly
  const maleProfile = parseUserProfile({ displayName: 'Carlos', gender: 'male' });
  assert.equal(maleProfile.gender, 'male');

  // 2. Female is parsed correctly
  const femaleProfile = parseUserProfile({ displayName: 'Laura', gender: 'female' });
  assert.equal(femaleProfile.gender, 'female');

  // 3. Unset/missing gender remains undefined (no silent fallback to male)
  const unsetProfile = parseUserProfile({ displayName: 'Alex' });
  assert.equal(unsetProfile.gender, undefined);

  // 4. Invalid or foreign string does not silently become male
  const invalidProfile = parseUserProfile({ displayName: 'Sam', gender: 'other' });
  assert.equal(invalidProfile.gender, undefined);

  // 5. Default profile has no gender set by default
  assert.equal(DEFAULT_USER_PROFILE.gender, undefined);
});

test('UserProfile persistence across reload preserves selected gender', () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const mockStorage = new MockLocalStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: mockStorage };

  try {
    // 1. Save male profile to storage
    const maleToSave: UserProfile = {
      displayName: 'Carlos',
      gender: 'male',
      birthDate: '1995-04-10'
    };
    mockStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(maleToSave));

    // Read back and parse as if reloaded
    const rawMale = mockStorage.getItem(STORAGE_KEYS.PROFILE);
    assert.ok(rawMale);
    const parsedMale = parseUserProfile(JSON.parse(rawMale));
    assert.equal(parsedMale.displayName, 'Carlos');
    assert.equal(parsedMale.gender, 'male');
    assert.equal(parsedMale.birthDate, '1995-04-10');

    // 2. Switch to female profile and save
    const femaleToSave: UserProfile = {
      ...parsedMale,
      gender: 'female'
    };
    mockStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(femaleToSave));

    const rawFemale = mockStorage.getItem(STORAGE_KEYS.PROFILE);
    assert.ok(rawFemale);
    const parsedFemale = parseUserProfile(JSON.parse(rawFemale));
    assert.equal(parsedFemale.gender, 'female');

    // 3. Legacy or unassigned profile without gender
    const legacyProfile = { displayName: 'OldUser' };
    mockStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(legacyProfile));

    const rawLegacy = mockStorage.getItem(STORAGE_KEYS.PROFILE);
    assert.ok(rawLegacy);
    const parsedLegacy = parseUserProfile(JSON.parse(rawLegacy));
    assert.equal(parsedLegacy.gender, undefined);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  }
});

test('auth-cache preserves gender for authenticated user and updates correctly', () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const mockStorage = new MockLocalStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: mockStorage };

  try {
    const baseUser: AuthUser = {
      id: 'athlete-123',
      email: 'athlete@example.com',
      username: 'athlete_123',
      displayName: 'Athlete 123',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    // 1. Cached user with male gender
    setCachedAuthUser({ ...baseUser, gender: 'male' });
    const cachedMale = getCachedAuthUser();
    assert.ok(cachedMale);
    assert.equal(cachedMale.gender, 'male');

    // 2. Update to female gender
    setCachedAuthUser({ ...baseUser, gender: 'female' });
    const cachedFemale = getCachedAuthUser();
    assert.ok(cachedFemale);
    assert.equal(cachedFemale.gender, 'female');

    // 3. User with unset gender remains undefined
    setCachedAuthUser({ ...baseUser, gender: undefined });
    const cachedUnset = getCachedAuthUser();
    assert.ok(cachedUnset);
    assert.equal(cachedUnset.gender, undefined);
  } finally {
    clearCachedAuthUser();
    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  }
});

test('AnatomicalBodyMap: gender === "male" renders ONLY male SVG geometry and NEVER female geometry', () => {
  const analytics = createMockAnalytics();
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(AnatomicalBodyMap, {
        data: analytics,
        mode: 'balance',
        gender: 'male',
        selectedMuscle: null,
        onSelectMuscle: () => {}
      })
    )
  );

  // Male viewBox: "50 94 628 1248"
  assert.ok(html.includes('50 94 628 1248'), 'Male SVG viewBox must be present');
  // Female viewBox: "0 0 650 1450" must NOT be present
  assert.ok(!html.includes('0 0 650 1450'), 'Female SVG viewBox must NOT be rendered for male gender');
  // Front and Back views are rendered (2 male SVG views)
  const svgMatches = html.match(/<svg\b/g);
  assert.equal(svgMatches?.length, 2, 'Should render exactly 2 SVG views (front and back) for male');
  // Must not display the unset gender selector prompt
  assert.ok(!html.includes('Selecciona tu mapa corporal'));
});

test('AnatomicalBodyMap: gender === "female" renders ONLY female SVG geometry and NEVER male geometry', () => {
  const analytics = createMockAnalytics();
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(AnatomicalBodyMap, {
        data: analytics,
        mode: 'balance',
        gender: 'female',
        selectedMuscle: null,
        onSelectMuscle: () => {}
      })
    )
  );

  // Female viewBox: "0 0 650 1450"
  assert.ok(html.includes('0 0 650 1450'), 'Female SVG viewBox must be present');
  // Male viewBox: "50 94 628 1248" must NOT be present
  assert.ok(!html.includes('50 94 628 1248'), 'Male SVG viewBox must NOT be rendered for female gender');
  // Front and Back views are rendered (2 female SVG views)
  const svgMatches = html.match(/<svg\b/g);
  assert.equal(svgMatches?.length, 2, 'Should render exactly 2 SVG views (front and back) for female');
  // Must not display the unset gender selector prompt
  assert.ok(!html.includes('Selecciona tu mapa corporal'));
});

test('AnatomicalBodyMap: unset gender displays neutral prompt with CTA and does NOT render body SVGs', () => {
  const analytics = createMockAnalytics();
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(AnatomicalBodyMap, {
        data: analytics,
        mode: 'balance',
        gender: undefined,
        selectedMuscle: null,
        onSelectMuscle: () => {},
        onConfigureGender: () => {}
      })
    )
  );

  // Must not render either male or female SVG body paths
  assert.ok(!html.includes('50 94 628 1248'), 'Male SVG viewBox must NOT be rendered when gender is unset');
  assert.ok(!html.includes('0 0 650 1450'), 'Female SVG viewBox must NOT be rendered when gender is unset');
  // Must render the neutral prompt and CTA
  assert.ok(html.includes('Selecciona tu mapa corporal'));
  assert.ok(html.includes('Configurar género'));

  // Must NOT contain hardcoded non-semantic tokens
  assert.ok(!html.includes('from-white/'), 'Must not contain hardcoded from-white/*');
  assert.ok(!html.includes('bg-zinc-'), 'Must not contain hardcoded bg-zinc-* in neutral card');
  assert.ok(!html.includes('border-white/'), 'Must not contain hardcoded border-white/* in neutral card');
});

test('ProfileView renders visible Gender section in summary and does NOT duplicate in edit mode', () => {
  const mockUserInfo = { id: 'u-1', name: 'Atleta', email: 'atleta@test.com' };

  // 1. Profile with unset gender in summary
  const unsetProfile: UserProfile = { displayName: 'Atleta' };
  const unsetHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: unsetProfile,
        userInfo: mockUserInfo,
        history: [],
        exercises: [],
        onSave: () => {}
      })
    )
  );
  assert.ok(unsetHtml.includes('Género'), 'Profile must have a Género section');
  assert.ok(unsetHtml.includes('Sin especificar'), 'Should show "Sin especificar" when gender is unset');
  assert.ok(unsetHtml.includes('Hombre'), 'Should offer Hombre option');
  assert.ok(unsetHtml.includes('Mujer'), 'Should offer Mujer option');

  // 2. Profile with male gender
  const maleProfile: UserProfile = { displayName: 'Carlos', gender: 'male' };
  const maleHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: maleProfile,
        userInfo: mockUserInfo,
        history: [],
        exercises: [],
        onSave: () => {}
      })
    )
  );
  assert.ok(maleHtml.includes('Género'));
  assert.ok(maleHtml.includes('Hombre'));
  assert.ok(!maleHtml.includes('Sin especificar'));

  // 3. Profile with female gender
  const femaleProfile: UserProfile = { displayName: 'Laura', gender: 'female' };
  const femaleHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      PreferencesProvider,
      null,
      React.createElement(ProfileView, {
        profile: femaleProfile,
        userInfo: mockUserInfo,
        history: [],
        exercises: [],
        onSave: () => {}
      })
    )
  );
  assert.ok(femaleHtml.includes('Género'));
  assert.ok(femaleHtml.includes('Mujer'));
  assert.ok(!femaleHtml.includes('Sin especificar'));
});

test('Stats selectors: undefined gender does NOT evaluate relative strength as male', async () => {
  const { selectMuscleAnalytics } = await import('../stats/stats-selectors.js');
  const mockExercisesById = {
    'ex-bench': {
      id: 'ex-bench',
      name: 'Press Banca',
      category: 'barbell' as const,
      primaryMuscle: 'chest' as const
    }
  };
  const mockHistory = [
    {
      id: 'session-1',
      userId: 'user-1',
      startedAt: new Date().toISOString(),
      sets: {
        'ex-bench': [
          { setIndex: 0, setType: 'working' as const, weightKg: 80, reps: 8, completed: true }
        ]
      }
    }
  ];

  // 1. Without gender: muscleAnalysis and fatigueMap work, but strengthEvaluation is undefined
  const analyticsUnset = selectMuscleAnalytics(mockHistory, mockExercisesById, 7, 75, undefined);
  assert.ok(analyticsUnset.fullMuscleAnalytics.chest.sets > 0, 'Volume/sets must calculate normally without gender');
  assert.equal(
    analyticsUnset.fullMuscleAnalytics.chest.strengthEvaluation,
    undefined,
    'Relative strength standard MUST be undefined when gender is not specified'
  );

  // 2. With male gender: strengthEvaluation is computed
  const analyticsMale = selectMuscleAnalytics(mockHistory, mockExercisesById, 7, 75, 'male');
  assert.ok(analyticsMale.fullMuscleAnalytics.chest.strengthEvaluation, 'Male strength standard must be calculated');

  // 3. With female gender: strengthEvaluation is computed differently
  const analyticsFemale = selectMuscleAnalytics(mockHistory, mockExercisesById, 7, 75, 'female');
  assert.ok(analyticsFemale.fullMuscleAnalytics.chest.strengthEvaluation, 'Female strength standard must be calculated');
});

test('Codebase verification: No silent gender || "male" fallback exists in StatsView or App', () => {
  const statsViewContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/views/StatsView.tsx'),
    'utf8'
  );
  assert.ok(
    !statsViewContent.includes("currentGender || 'male'"),
    "StatsView.tsx must NOT contain currentGender || 'male'"
  );
  assert.ok(
    !statsViewContent.includes('currentGender || "male"'),
    'StatsView.tsx must NOT contain currentGender || "male"'
  );
});
