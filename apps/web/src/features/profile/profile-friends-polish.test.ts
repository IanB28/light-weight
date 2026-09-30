import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { FriendshipSummary } from '@light-weight/domain';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { DEFAULT_USER_PROFILE } from '../../lib/storage.js';
import { dictionaries } from '../../lib/i18n.js';
import type { UserSearchResult } from '../../lib/social-api.js';
import { FriendsContent } from '../friends/FriendsPanel.js';
import { ProfileView } from './ProfileView.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

function friendship(direction: FriendshipSummary['direction'], name: string): FriendshipSummary {
  return { id: direction, status: direction === 'friend' ? 'accepted' : 'pending', direction, createdAt: '2026-09-01T00:00:00Z', user: { id: `${direction}-user`, displayName: name, username: direction } };
}

function renderFriends(items: FriendshipSummary[], results: UserSearchResult[] = [], loading = false): string {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(FriendsContent, {
    items, results, loading, busyId: null,
    error: null,
    onAdd: () => {}, onAccept: () => {}, onRemove: () => {}
  }));
}

test('A: profile summary avatar is 112px mobile and 128px at sm without growing identity typography', () => {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(PreferencesProvider, null,
    React.createElement(ProfileView, {
      profile: DEFAULT_USER_PROFILE,
      userInfo: { id: 'athlete', name: 'Alex', email: 'alex@example.com' },
      history: [], exercises: [], onSave: () => {}
    })
  ));
  assert.match(html, /size-28 text-2xl shadow-accent sm:size-32 sm:text-3xl/);
  assert.match(html, /break-words text-lg font-extrabold/);
});

test('B: edit avatar is 96px mobile / 112px sm, smaller than the summary avatar', () => {
  const profileView = source('features/profile/ProfileView.tsx');
  assert.match(profileView, /className="size-24 text-2xl shadow-accent sm:size-28"/);
  assert.match(profileView, /className="size-28 text-2xl shadow-accent sm:size-32 sm:text-3xl"/);
  assert.match(profileView, /t\('profile.changePhoto'\)/);
});

test('C: accepted friends precede incoming, which precede outgoing in rendered DOM', () => {
  const html = renderFriends([
    friendship('incoming', 'Incoming Athlete'),
    friendship('outgoing', 'Outgoing Athlete'),
    friendship('friend', 'Accepted Athlete')
  ]);
  const accepted = html.indexOf('Accepted Athlete');
  const incoming = html.indexOf('Incoming Athlete');
  const outgoing = html.indexOf('Outgoing Athlete');
  assert.ok(accepted >= 0 && accepted < incoming && incoming < outgoing);
});

test('D: search results render before accepted friends', () => {
  const html = renderFriends([friendship('friend', 'Accepted Athlete')], [
    { id: 'searched', displayName: 'Searched Athlete', username: 'searched', relationship: 'none' }
  ]);
  assert.ok(html.indexOf('Searched Athlete') < html.indexOf('Accepted Athlete'));
  assert.match(html, /aria-label="Resultados"/);
});

test('E: friends heading and compact empty state precede pending requests', () => {
  const html = renderFriends([friendship('incoming', 'Incoming Athlete'), friendship('outgoing', 'Outgoing Athlete')]);
  assert.ok(html.indexOf('Amigos') < html.indexOf('Incoming Athlete'));
  assert.ok(html.indexOf('Incoming Athlete') < html.indexOf('Outgoing Athlete'));
  assert.ok(html.includes(dictionaries.es['friends.empty']));
});

test('F: search/send, incoming accept/reject, outgoing cancel and friend remove remain wired', () => {
  const html = renderFriends([
    friendship('incoming', 'Incoming Athlete'),
    friendship('outgoing', 'Outgoing Athlete'),
    friendship('friend', 'Accepted Athlete')
  ], [{ id: 'searched', displayName: 'Searched Athlete', username: 'searched', relationship: 'none' }]);
  for (const key of ['friends.add', 'friends.accept', 'friends.reject', 'friends.cancel', 'friends.remove'] as const) {
    const label = dictionaries.es[key];
    assert.ok(html.includes(`aria-label="${label}"`) || html.includes(`>${label}</button>`), `${key} must remain available`);
  }
  const panel = source('features/friends/FriendsPanel.tsx');
  for (const action of ['friendsApi.search(', 'friendsApi.send(', 'friendsApi.accept(', 'friendsApi.remove(']) {
    assert.ok(panel.includes(action), `${action} must remain connected`);
  }
});

test('G: own-profile Friends shortcut remains compact and removes duplicate label in ES/EN', () => {
  const screen = source('features/profile/ProfileScreen.tsx');
  assert.match(screen, /className="flex justify-center"/);
  assert.match(screen, /className="inline-flex min-h-11/);
  assert.ok(!screen.includes('w-full'));
  assert.equal(dictionaries.es['profile.friendSummary'], '{{count}} amigos');
  assert.equal(dictionaries.en['profile.friendSummary'], '{{count}} friends');
  assert.equal(dictionaries.es['profile.friendSummaryOne'], '1 amigo');
  assert.equal(dictionaries.en['profile.friendSummaryOne'], '1 friend');
});
