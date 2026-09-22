import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { ViewHeader } from '../../components/ViewHeader.js';
import { dictionaries } from '../../lib/i18n.js';
import { ProfileIdentityProvider, getProfileInitials } from './ProfileIdentityButton.js';
import { appSurfaceReducer, INITIAL_APP_SURFACE_STATE } from './profile-surface-state.js';
import { countAcceptedFriends } from './profile-friends.js';
import type { FriendshipSummary } from '@light-weight/domain';

const source = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), 'src', relativePath), 'utf8');

test('Profile is an app-level surface that preserves and restores the underlying tab', () => {
  const onStats = appSurfaceReducer(INITIAL_APP_SURFACE_STATE, { type: 'select_tab', tab: 'stats' });
  const withProfile = appSurfaceReducer(onStats, { type: 'open_profile' });
  assert.equal(withProfile.currentTab, 'stats');
  assert.equal(withProfile.profileOpen, true);

  const closed = appSurfaceReducer(withProfile, { type: 'close_profile' });
  assert.equal(closed.currentTab, 'stats');
  assert.equal(closed.profileOpen, false);
});

test('Bottom navigation selection closes secondary surfaces and navigates normally', () => {
  const withProfileAndSettings = {
    ...INITIAL_APP_SURFACE_STATE,
    currentTab: 'stats' as const,
    profileOpen: true,
    settingsOpen: true,
    settingsTarget: 'training' as const
  };
  const next = appSurfaceReducer(withProfileAndSettings, { type: 'select_tab', tab: 'plan' });
  assert.deepEqual(next, {
    currentTab: 'plan',
    profileOpen: false,
    settingsOpen: false,
    settingsTarget: 'training'
  });
});

test('Profile to the direct Gender Settings panel keeps Profile underneath when Settings closes', () => {
  const profile = appSurfaceReducer(INITIAL_APP_SURFACE_STATE, { type: 'open_profile' });
  const settings = appSurfaceReducer(profile, { type: 'open_settings', target: 'gender' });
  assert.equal(settings.profileOpen, true);
  assert.equal(settings.settingsOpen, true);
  assert.equal(settings.settingsTarget, 'gender');

  const closedSettings = appSurfaceReducer(settings, { type: 'close_settings' });
  assert.equal(closedSettings.profileOpen, true);
  assert.equal(closedSettings.settingsOpen, false);
  assert.equal(closedSettings.currentTab, 'home');
});

test('ViewHeader exposes independent accessible Profile and Settings actions', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      ProfileIdentityProvider,
      {
        value: { displayName: 'Alex Athlete', onOpenProfile: () => {} },
        children: React.createElement(ViewHeader, { title: 'Progreso', onOpenSettings: () => {} })
      }
    )
  );
  assert.ok(html.includes('aria-label="Abrir perfil de Alex Athlete"'));
  assert.ok(html.includes('aria-label="Abrir ajustes"'));
  assert.ok(html.includes('AA'), 'Header profile action must render stable initials without an avatar');
});

test('profile identity initials are stable for empty, single and long display names', () => {
  assert.equal(getProfileInitials(''), 'LW');
  assert.equal(getProfileInitials('Ian'), 'I');
  assert.equal(getProfileInitials('Ian Benjamin Rodriguez Longname'), 'IB');
});

test('Settings exposes Gender directly and keeps Profile and Friends outside Settings', () => {
  const settings = source('components/SettingsSheet.tsx');
  assert.ok(!settings.includes("ProfileView"));
  assert.ok(!settings.includes("FriendsPanel"));
  assert.ok(settings.includes("panel === 'gender'"));
  assert.ok(settings.includes("setPanel('gender')"));
  assert.ok(!settings.includes("panel === 'profile'"));
  assert.ok(settings.includes('onSaveProfile'));
  assert.ok(settings.includes('onLogout'));
  assert.ok(!settings.includes('bodyweightEntries'));
  assert.match(settings, /target\?: SettingsTarget/);
  assert.match(settings, /if \(isOpen\) setPanel\(target\)/);
});

test('ProfileScreen owns Friends and places its presentation accessory below metrics', () => {
  const profileScreen = source('features/profile/ProfileScreen.tsx');
  assert.ok(profileScreen.includes("import { FriendsPanel }"));
  assert.ok(!profileScreen.includes("onOpenSettings('training')"));
  assert.ok(profileScreen.includes("onOpenSettings('gender')"));
  assert.ok(profileScreen.includes('summaryAccessory={isAuthenticated ?'));
  assert.ok(!profileScreen.includes('onLogout: () => void;'));
  assert.ok(!profileScreen.includes('profile.social'));
  assert.ok(!profileScreen.includes('profile.account'));
  assert.ok(profileScreen.includes("authStatus === 'offline'"));
  assert.ok(profileScreen.includes('disabled={!friendsAvailable}'));
});

test('App owns independent Profile/Settings orchestration and preserves auth routing', () => {
  const app = source('App.tsx');
  assert.ok(app.includes('useReducer(appSurfaceReducer, INITIAL_APP_SURFACE_STATE)'));
  assert.ok(app.includes('profileOpen ? <ProfileScreen'));
  assert.ok(app.includes("dispatchSurface({ type: 'open_profile' })"));
  assert.ok(app.includes('target={settingsTarget}'));
  assert.ok(app.includes('onOpenSettings={openSettings}'));
  assert.ok(app.includes('saveProfileUpdate'));
  assert.match(app, /if \(authTarget === 'auth_screen'\)/);
  assert.match(app, /if \(authTarget === 'onboarding' && auth\.user\)/);
});

test('ProfileView delegates social/account ownership and shares avatar fallback presentation', () => {
  const profileView = source('features/profile/ProfileView.tsx');
  assert.ok(profileView.includes('<ProfileAvatar'));
  assert.ok(!profileView.includes('onOpenFriends'));
  assert.ok(!profileView.includes('onLogout'));
  assert.ok(!profileView.includes('isRemote'));
  assert.ok(!profileView.includes('SegmentedControl'));
  assert.ok(profileView.includes('aria-label={t(\'profile.edit\')}'));
  assert.ok(profileView.includes('className="absolute right-0 top-0 size-11"'));
  assert.ok(profileView.includes('{summaryAccessory}'));
  assert.ok(profileView.includes('type="file"'));
  assert.ok(profileView.includes('normalizeAvatarFile'));
});

test('friend summary counts accepted friendships only', () => {
  const friendships: FriendshipSummary[] = [
    { id: 'accepted', status: 'accepted', direction: 'friend', user: { id: '1', username: 'one', displayName: 'One' }, createdAt: '2026-01-01' },
    { id: 'incoming', status: 'pending', direction: 'incoming', user: { id: '2', username: 'two', displayName: 'Two' }, createdAt: '2026-01-01' },
    { id: 'outgoing', status: 'pending', direction: 'outgoing', user: { id: '3', username: 'three', displayName: 'Three' }, createdAt: '2026-01-01' },
    { id: 'invalid-direction', status: 'pending', direction: 'friend', user: { id: '4', username: 'four', displayName: 'Four' }, createdAt: '2026-01-01' }
  ];
  assert.equal(countAcceptedFriends(friendships), 1);
});

test('new Profile surface labels are complete in Spanish and English', () => {
  const keys = [
    'header.openProfile',
    'header.profileTitle',
    'profile.close',
    'profile.backToProfile',
    'profile.friendSummary',
    'profile.friendsDescription',
    'profile.friendsOffline',
    'profile.offlineAvailable',
    'profile.account',
    'profile.accountDescription',
    'profile.bodyweightRequired',
    'profile.bodyweightEntryHint',
    'profile.addBodyweight'
    ,'profile.changePhoto',
    'profile.avatarUnsupportedType',
    'profile.avatarTooLarge'
  ] as const;
  for (const key of keys) {
    assert.ok(dictionaries.es[key], `Missing Spanish translation for ${key}`);
    assert.ok(dictionaries.en[key], `Missing English translation for ${key}`);
  }
});
