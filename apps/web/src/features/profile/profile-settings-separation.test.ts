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
  assert.ok(profileView.includes("aria-label={t('profile.edit')}"));
  assert.ok(profileView.includes('<Pencil aria-hidden="true" className="size-4" />'));
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

test('Block 19.3: Profile header uses sketch layout (X + title on left, Pencil on right, cardless identity)', () => {
  const profileScreen = source('features/profile/ProfileScreen.tsx');
  const profileView = source('features/profile/ProfileView.tsx');

  // No enclosing card or ElevatedSurface around the photo/identity block
  assert.ok(!profileView.includes('<ElevatedSurface'), 'ProfileView must not enclose photo/identity in an ElevatedSurface or card');
  assert.ok(!profileScreen.includes('<ElevatedSurface'), 'ProfileScreen must not use ElevatedSurface wrapper');

  // Header has X close button and title on the left
  assert.ok(profileView.includes("aria-label={t('profile.close')}"), 'ProfileView header must include X close button');
  assert.ok(profileView.includes("id=\"profile-screen-title\""), 'ProfileView header must include screen title');

  // Header has Pencil edit button on the right
  assert.ok(profileView.includes("aria-label={t('profile.edit')}"), 'ProfileView header must include edit pencil button');
  assert.ok(profileView.includes('<Pencil aria-hidden="true" className="size-4" />'), 'ProfileView header must use Pencil icon');

  // Identity is rendered directly without enclosing surface
  assert.ok(profileView.includes('className="flex flex-col items-center text-center"'), 'Athlete identity must be centered directly on page background');

  // No isolated app-bar strip or hard separator
  assert.ok(!profileScreen.includes('border-b border-border-subtle'), 'Header must not have border-b separator strip');
  assert.ok(!profileScreen.includes('bg-app/90'), 'Header must not have independent bg-app/90 strip');
  assert.ok(!profileScreen.includes('bg-black'), 'Header must not use bg-black');
  assert.ok(!profileScreen.includes('bg-zinc-9'), 'Header must not use hardcoded zinc-9xx surfaces');
  assert.ok(!profileScreen.includes('bg-neutral-9'), 'Header must not use hardcoded neutral-9xx');
});

test('Block 19.3: Profile top surface uses X close control and eliminates Settings button', () => {
  const profileScreen = source('features/profile/ProfileScreen.tsx');

  // No visible Settings button in Profile
  assert.ok(!profileScreen.includes('<Settings'), 'Visible Settings button must be removed from Profile');
  assert.ok(!profileScreen.includes('Settings,') && !profileScreen.includes(', Settings'), 'Unused Settings icon import must be removed');
  assert.ok(!profileScreen.includes('header.openSettings'), 'header.openSettings must not be used on a visible button in Profile');

  // onOpenSettings plumbing must be preserved for gender configuration
  assert.ok(profileScreen.includes("onConfigureGender={() => onOpenSettings('gender')}"), 'onOpenSettings gender flow must be preserved');

  // X icon is used as the close control in Profile summary and Friends panel
  assert.ok(profileScreen.includes('<X aria-hidden="true" className="size-5" />'), 'X icon must be used as close control');

  // ChevronLeft is NOT used as a top surface close control (no back icon before title)
  assert.ok(!profileScreen.includes('ChevronLeft aria-hidden="true" className="size-5"'), 'ChevronLeft must not be used as top close control');

  // Close semantics remain intact
  assert.ok(profileScreen.includes('onClose={onClose}'), 'Summary close control must pass onClose');
  assert.ok(profileScreen.includes("onClick={() => setPanel('summary')}"), 'Friends close control must return to summary panel');
});

test('Block 19.3B: Friends action is horizontally centered and remains content-sized', () => {
  const profileScreen = source('features/profile/ProfileScreen.tsx');
  // Wrapper must center the action
  assert.ok(profileScreen.includes('className="flex justify-center"'), 'Friends pill wrapper must center the action via justify-center');
  // The friends button must use rounded-full pill shape (inline, not full-width card)
  assert.ok(profileScreen.includes('rounded-full'), 'Friends action must use rounded-full pill shape');
  // Content-sized: inline-flex and not w-full
  assert.ok(profileScreen.includes('inline-flex'), 'Friends button must use inline-flex for compact sizing');
  assert.ok(!profileScreen.includes('w-full'), 'Friends button must not contain w-full');
});

test('Block 19.3: ProfileStrengthSection hero badge has no decorative background orb', () => {
  const strengthSection = source('features/profile/ProfileStrengthSection.tsx');
  // No orb divs at all behind the badge — glow comes exclusively from the badge PNG itself
  assert.ok(!strengthSection.includes('size-40'), 'Hero card must not use size-40 orb');
  assert.ok(!strengthSection.includes('size-20'), 'Hero card must not use size-20 orb either');
  assert.ok(!strengthSection.includes('blur-2xl'), 'No blur-2xl orb behind badge');
  assert.ok(!strengthSection.includes('blur-3xl'), 'No blur-3xl orb behind badge');
  // Glow must be via showGlow prop (drop-shadow on the transparent PNG image)
  assert.ok(strengthSection.includes('showGlow'), 'Badge glow must be applied via showGlow prop on the transparent PNG image');
});

test('Block 19.3: Rank legend shows all 9 names in full — no truncation or clipping', () => {
  const bodyMap = source('components/charts/AnatomicalBodyMap.tsx');
  assert.ok(!bodyMap.includes('whitespace-nowrap'), 'Legend must not use whitespace-nowrap');
  assert.ok(!bodyMap.includes('truncate leading-tight'), 'Legend must not truncate rank names');
  assert.ok(bodyMap.includes('break-words'), 'Legend must use break-words so long names wrap rather than clip');
  assert.ok(bodyMap.includes('min-[380px]:grid-cols-3'), 'Legend must use min-[380px] responsive breakpoint');
});
