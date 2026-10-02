import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { FriendProfileProjection, FriendshipSummary } from '@light-weight/domain';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { dictionaries } from '../../lib/i18n.js';
import { FriendsContent } from '../friends/FriendsPanel.js';
import { classifyFriendProfileError, FriendProfileContent } from './FriendProfileView.js';
import { formatPublicFeaturedPrLoad } from './featured-pr-presentation.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

function friendship(direction: FriendshipSummary['direction'], id: string): FriendshipSummary {
  return {
    id: `friendship-${id}`,
    status: direction === 'friend' ? 'accepted' : 'pending',
    direction,
    createdAt: '2026-09-01T00:00:00Z',
    user: { id, displayName: `${id} Athlete`, username: id }
  };
}

function renderFriendProfile(profile: FriendProfileProjection): string {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, React.createElement(FriendProfileContent, { profile }))
  );
}

const publicProfile: FriendProfileProjection = {
  user: { id: 'friend-a', displayName: 'Taylor Athlete', username: 'taylor', avatarUrl: 'https://example.com/avatar.jpg' },
  stats: { totalWorkouts: 42, weeklyStreak: 7 },
  strength: {
    overall: {
      rank: 'gladiador',
      overallScore: 3.45,
      nextRank: 'elite',
      progressPctToNextRank: 45,
      ratedMuscleCount: 2,
      totalMuscleCount: 11,
      coveragePct: 18,
      isComplete: false
    },
    muscleRanks: { chest: 'gladiador', back: 'principiante' },
    anatomy: 'male'
  },
  strengthRank: 'gladiador',
  featuredPrs: [
    { slot: 1, exercise: { id: 'bench', name: 'Bench Press' }, load: { type: 'weight', weightKg: 100, loadMode: 'total' }, reps: 5, strengthRank: 'gladiador', available: true },
    { slot: 2, exercise: { id: 'weighted-pull-up', name: 'Weighted Pull-Up' }, load: { type: 'added_weight', weightKg: 20 }, reps: 8, strengthRank: 'principiante', available: true },
    { slot: 3, exercise: { id: 'custom-missing', name: 'Private Custom Lift' }, load: { type: 'bodyweight' }, strengthRank: null, available: false }
  ]
};

test('friend profile renders only the public read-only projection in server order', () => {
  const html = renderFriendProfile(publicProfile);
  assert.match(html, /Taylor Athlete/);
  assert.match(html, /@taylor/);
  assert.match(html, />42</);
  assert.match(html, />7</);
  assert.match(html, /Gladiador/);
  assert.match(html, /3\.45/);
  assert.match(html, /2 \/ 11 grupos evaluados/);
  assert.match(html, /45% hacia Élite/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="45"/);
  assert.match(html, /Vista frontal anatómica/);
  assert.match(html, /Vista dorsal anatómica/);
  assert.match(html, /data-muscle="chest"[^>]*data-strength-rank="gladiador"[^>]*data-interactive="false"/);
  assert.match(html, /data-muscle="back"[^>]*data-strength-rank="principiante"[^>]*data-interactive="false"/);
  assert.match(html, /data-muscle="forearms"[^>]*data-interactive="false"/);
  assert.match(html, /fill="#8A5A1F"/, 'public Gladiador rank must drive the map color');
  assert.match(html, /fill="#B5652D"/, 'public Principiante rank must drive the map color');
  assert.match(html, /var\(--untrained-muscle-fill/, 'unevaluated regions must retain the neutral map treatment');
  assert.doesNotMatch(html, /data-interactive="true"|cursor-pointer/);
  assert.doesNotMatch(html, /Toca cualquier grupo muscular|Fuerza relativa|1RM estimado|Siguiente rango|Cerrar/);
  assert.ok(html.indexOf('Bench Press') < html.indexOf('Weighted Pull-Up'));
  assert.ok(html.indexOf('Weighted Pull-Up') < html.indexOf('Private Custom Lift'));
  assert.match(html, /100 kg/);
  assert.match(html, /\+20 kg/);
  assert.match(html, />BW</);
  assert.match(html, /No disponible/);
  assert.doesNotMatch(html, /Editar perfil|Cambiar foto|Peso corporal|Rutinas/);
});

test('friend Overall handles maximum rank and no-data states without fabricating strength', () => {
  const maxRank = renderFriendProfile({
    ...publicProfile,
    strengthRank: 'dios',
    strength: {
      ...publicProfile.strength,
      overall: {
        ...publicProfile.strength.overall!,
        rank: 'dios',
        overallScore: 9,
        nextRank: null,
        progressPctToNextRank: 100
      }
    }
  });
  assert.match(maxRank, /Dios/);
  assert.match(maxRank, /Rango máximo/);
  assert.doesNotMatch(maxRank, /role="progressbar"/);

  const noData = renderFriendProfile({
    ...publicProfile,
    strengthRank: null,
    strength: { overall: null, muscleRanks: {}, anatomy: 'female' }
  });
  assert.match(noData, /Sin nivel de fuerza disponible/);
  assert.doesNotMatch(noData, /data-testid="overall-strength-card"|Vista frontal anatómica/);
});

test('public load formatter respects safe load semantics and viewer units', () => {
  assert.equal(formatPublicFeaturedPrLoad({ type: 'bodyweight' }, 'metric'), 'BW');
  assert.equal(formatPublicFeaturedPrLoad({ type: 'added_weight', weightKg: 20 }, 'metric'), '+20 kg');
  assert.equal(formatPublicFeaturedPrLoad({ type: 'assisted', weightKg: 20 }, 'metric'), '-20 kg');
  assert.equal(formatPublicFeaturedPrLoad({ type: 'weight', weightKg: 100, loadMode: 'total' }, 'metric'), '100 kg');
  assert.equal(formatPublicFeaturedPrLoad({ type: 'added_weight', weightKg: 20 }, 'imperial'), '+44.1 lb');
  assert.equal(formatPublicFeaturedPrLoad({ type: 'assisted', weightKg: 20 }, 'imperial'), '-44.1 lb');
});

test('friend profile renders public showcase counts 0 through 3 without filler cards', () => {
  for (let count = 0; count <= 3; count += 1) {
    const html = renderFriendProfile({ ...publicProfile, featuredPrs: publicProfile.featuredPrs.slice(0, count) });
    assert.equal((html.match(/data-testid="pr-exercise-name"/g) ?? []).length, count);
    if (count === 0) assert.match(html, /Este amigo aún no tiene récords destacados/);
  }
});

test('friend profile error policy separates revoked access, auth expiry and retryable failures', () => {
  assert.equal(classifyFriendProfileError({ code: 'not_friends', status: 404, retryable: false }), 'unavailable');
  assert.equal(classifyFriendProfileError({ code: 'unauthorized', status: 401, retryable: false }), 'auth');
  assert.equal(classifyFriendProfileError({ code: 'network', retryable: true }), 'retryable');
  assert.equal(classifyFriendProfileError({ code: 'server', status: 500, retryable: true }), 'retryable');
});

test('only accepted friend identity is navigable and remove remains a separate action', () => {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(FriendsContent, {
    items: [friendship('friend', 'accepted'), friendship('incoming', 'incoming'), friendship('outgoing', 'outgoing')],
    results: [], error: null, loading: false, busyId: null,
    onOpenProfile: () => {}, onAdd: () => {}, onAccept: () => {}, onRemove: () => {}
  }));
  assert.equal((html.match(/Abrir perfil de/g) ?? []).length, 1);
  assert.match(html, /aria-label="Abrir perfil de accepted Athlete"/);
  assert.match(html, /aria-label="Eliminar amigo"/);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*<button/);
});

test('profile navigation is nested and friend fetch aborts stale requests', () => {
  const screen = source('features/profile/ProfileScreen.tsx');
  const view = source('features/profile/FriendProfileView.tsx');
  assert.match(screen, /type: 'friend-profile'; friend: PublicUserSummary/);
  assert.match(screen, /setPanel\(\{ type: 'friend-profile', friend: item\.user \}\)/);
  assert.match(screen, /onBack=\{\(\) => setPanel\(\{ type: 'friends' \}\)\}/);
  assert.match(view, /new AbortController\(\)/);
  assert.match(view, /friendsApi\.profile\(friend\.id, controller\.signal\)/);
  assert.match(view, /if \(!controller\.signal\.aborted\)/);
  assert.match(view, /return \(\) => controller\.abort\(\)/);
});

test('friend profile does not persist or consume private training fields', () => {
  const view = source('features/profile/FriendProfileView.tsx');
  for (const privateField of ['localStorage', 'sessionStorage', 'effectiveLoadKg', 'bodyweightKg', 'strengthEvaluation', '.history', '.sets', '.rpe', '.rir']) {
    assert.ok(!view.includes(privateField), `${privateField} must stay outside the friend profile boundary`);
  }
});

test('friend profile copy is complete in Spanish and English', () => {
  const keys = [
    'friends.openProfile', 'friends.profileTitle', 'friends.backToFriends', 'friends.profileLoading',
    'friends.profileUnavailable', 'friends.profileUnavailableDescription', 'friends.profileLoadError',
    'friends.profileLoadErrorDescription', 'friends.retryProfile', 'friends.strengthRank',
    'friends.strengthUnavailable', 'friends.strengthUnevaluated', 'friends.featuredRecords', 'friends.noRecords',
    'stats.front', 'stats.back', 'stats.frontAnatomy', 'stats.backAnatomy'
  ] as const;
  for (const key of keys) {
    assert.ok(dictionaries.es[key], `Missing Spanish translation for ${key}`);
    assert.ok(dictionaries.en[key], `Missing English translation for ${key}`);
  }
});
