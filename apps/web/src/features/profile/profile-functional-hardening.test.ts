import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthUser } from '@light-weight/domain';
import type { ApiErrorCode, OperationResult } from '../../lib/api-errors.js';
import type { UserProfile } from '../../lib/storage.js';
import { restoreProfileFromBackup } from './profile-backup.js';
import { resolveEffectiveProfile } from './profile-authority.js';
import { createProfileDraft } from './ProfileView.js';
import { saveProfileUpdate, submitProfileDraft, type RemoteProfilePatch } from './profile-save.js';

const source = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), 'src', relativePath), 'utf8');

const authUser: AuthUser = {
  id: 'user-1',
  email: 'ian@example.com',
  username: 'ian',
  displayName: 'Ian',
  gender: 'male',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

function failure(code: ApiErrorCode): OperationResult<AuthUser> {
  return { ok: false, error: { code, retryable: false } };
}

test('authenticated profile save includes username and persists only canonical server values', async () => {
  let request: RemoteProfilePatch | undefined;
  const persisted: UserProfile[] = [];
  const canonical = { ...authUser, username: 'normalized.user', displayName: 'Ian Normalized' };

  const error = await saveProfileUpdate({
    currentProfile: { displayName: 'Ian', username: 'ian', gender: 'male' },
    patch: { displayName: ' Ian Draft ', username: 'NORMALIZED.USER' },
    authStatus: 'authenticated',
    authUser,
    updateRemote: async (next) => { request = next; return { ok: true, data: canonical }; },
    persistLocal: (profile) => { persisted.push(profile); return profile; },
    translateError: (code) => code
  });

  assert.equal(error, undefined);
  assert.equal(request?.username, 'NORMALIZED.USER');
  assert.deepEqual(persisted, [{
    displayName: 'Ian Normalized',
    username: 'normalized.user',
    gender: 'male',
    birthDate: undefined,
    avatarUrl: undefined
  }]);
});

for (const code of ['username_already_exists', 'invalid_username', 'validation'] as const) {
  test(`authenticated profile save returns ${code} and never persists rejected values`, async () => {
    const persisted: UserProfile[] = [];
    const error = await saveProfileUpdate({
      currentProfile: { displayName: 'Ian', username: 'ian' },
      patch: { displayName: 'Rejected', username: 'rejected' },
      authStatus: 'authenticated',
      authUser,
      updateRemote: async () => failure(code),
      persistLocal: (profile) => { persisted.push(profile); return profile; },
      translateError: (nextCode) => `translated:${nextCode}`
    });

    assert.equal(error, `translated:${code}`);
    assert.deepEqual(persisted, []);
  });
}

test('Profile edit submission stays open when the remote save returns an error', async () => {
  const failed = await submitProfileDraft(async () => 'Ese nombre de usuario ya está ocupado.', {
    displayName: 'Rejected',
    username: 'rejected'
  });
  assert.deepEqual(failed, { error: 'Ese nombre de usuario ya está ocupado.', shouldClose: false });

  const succeeded = await submitProfileDraft(async () => undefined, { displayName: 'Accepted', username: 'accepted' });
  assert.deepEqual(succeeded, { error: null, shouldClose: true });
});

test('offline profile edits intentionally use local persistence without calling the remote PATCH', async () => {
  let remoteCalls = 0;
  const persisted: UserProfile[] = [];
  await saveProfileUpdate({
    currentProfile: { displayName: 'Cached', username: 'cached' },
    patch: { displayName: 'Offline edit' },
    authStatus: 'offline',
    authUser,
    updateRemote: async () => { remoteCalls += 1; return { ok: true, data: authUser }; },
    persistLocal: (profile) => { persisted.push(profile); return profile; },
    translateError: (code) => code
  });

  assert.equal(remoteCalls, 0);
  assert.equal(persisted[0]?.displayName, 'Offline edit');
});

test('backup profile restoration uses the canonical profile store and Settings refreshes app data', () => {
  const calls: Partial<UserProfile>[] = [];
  const restored = restoreProfileFromBackup(
    { displayName: 'Imported athlete', username: 'imported' },
    (profile) => { calls.push(profile); return { displayName: String(profile.displayName), username: profile.username }; }
  );

  assert.equal(restored?.displayName, 'Imported athlete');
  assert.deepEqual(calls, [{ displayName: 'Imported athlete', username: 'imported' }]);
  const settings = source('components/SettingsSheet.tsx');
  const profileScreen = source('features/profile/ProfileScreen.tsx');
  assert.ok(settings.includes('restoreProfileFromBackup(data.profile, saveStoredProfile)'));
  assert.ok(settings.includes('onDataRestored?.()'));
  assert.ok(profileScreen.includes('profile={profile}'), 'ProfileScreen forwards refreshed App profile props without a second profile store');
});

test('anonymous backup profile is the visible local identity', () => {
  const restored = restoreProfileFromBackup(
    { displayName: 'Imported athlete', username: 'imported' },
    (profile) => ({ displayName: String(profile.displayName), username: profile.username })
  );

  assert.deepEqual(resolveEffectiveProfile(restored!, null, 'anonymous'), {
    displayName: 'Imported athlete',
    username: 'imported'
  });
});

test('authenticated online backup data remains local while the canonical AuthUser stays visible', () => {
  const restored = restoreProfileFromBackup(
    { displayName: 'Backup name', username: 'backup-user', gender: 'female' },
    (profile) => ({
      displayName: String(profile.displayName),
      username: profile.username,
      gender: profile.gender
    })
  );

  assert.deepEqual(resolveEffectiveProfile(restored!, authUser, 'authenticated'), {
    displayName: 'Ian',
    username: 'ian',
    gender: 'male',
    birthDate: undefined,
    avatarUrl: undefined
  });
});

test('cached offline account keeps backup identity local and never invokes the remote profile PATCH', () => {
  const restored = restoreProfileFromBackup(
    { displayName: 'Offline backup', username: 'offline-backup' },
    (profile) => ({ displayName: String(profile.displayName), username: profile.username })
  );
  const settings = source('components/SettingsSheet.tsx');
  const sync = source('lib/sync.ts');

  assert.deepEqual(resolveEffectiveProfile(restored!, authUser, 'offline'), {
    displayName: 'Offline backup',
    username: 'offline-backup'
  });
  assert.ok(!settings.includes('auth.updateProfile'));
  const syncPayload = sync.slice(sync.indexOf('const payload = {'), sync.indexOf('const data = await requestJson'));
  assert.ok(!syncPayload.includes('profile:'), 'The follow-up sync payload must not turn a backup profile into a remote identity update');
});

test('an explicit later Profile edit is the only path that invokes the remote update', async () => {
  let calls = 0;
  await saveProfileUpdate({
    currentProfile: { displayName: 'Local fallback', username: 'local' },
    patch: { displayName: 'Explicit edit', username: 'explicit' },
    authStatus: 'authenticated',
    authUser,
    updateRemote: async () => { calls += 1; return { ok: true, data: authUser }; },
    persistLocal: (profile) => profile,
    translateError: (code) => code
  });
  assert.equal(calls, 1);
});

test('opening Profile edit always builds a fresh draft from the latest profile props', () => {
  const first = createProfileDraft({ displayName: 'Old', username: 'old' }, 'Old');
  const latest = createProfileDraft({ displayName: 'Canonical', username: 'canonical' }, 'Canonical');
  assert.equal(first.username, 'old');
  assert.deepEqual(latest, { displayName: 'Canonical', username: 'canonical' });
});

test('strength configuration uses semantic gender intent and an honest bodyweight state', () => {
  const profileView = source('features/profile/ProfileView.tsx');
  const profileScreen = source('features/profile/ProfileScreen.tsx');
  const settings = source('components/SettingsSheet.tsx');
  const strength = source('features/profile/ProfileStrengthSection.tsx');
  assert.ok(profileView.includes('onConfigureGender={onConfigureGender}'));
  assert.ok(profileScreen.includes("onConfigureGender={() => onOpenSettings('profile')}"));
  assert.ok(settings.includes('const handleGenderChange = async'));
  assert.ok(settings.includes('await onSaveProfile({ gender })'));
  assert.ok(strength.includes('onConfigureGender?: () => void'));
  assert.ok(strength.includes('onConfigureBodyweight?: () => void'));
  assert.ok(strength.includes("t('profile.bodyweightEntryHint')"));
  assert.ok(!strength.includes('onOpenSettings'));
});
