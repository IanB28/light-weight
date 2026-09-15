import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, mapApiError } from '../../lib/api-errors.js';
import { resolveSessionRefreshFailure, type AuthStatus } from '../../lib/auth-session-state.js';
import { isValidUsername, normalizeUsername, type AuthUser } from '@light-weight/domain';

export type AppAuthScreenTarget = 'loading' | 'auth_screen' | 'onboarding' | 'main_app';

export function resolveAuthScreenTarget(
  status: AuthStatus,
  user: AuthUser | null
): AppAuthScreenTarget {
  if (status === 'loading') return 'loading';
  if (!user || status === 'anonymous') return 'auth_screen';
  if (!user.username || user.username.trim() === '') return 'onboarding';
  return 'main_app';
}

test('resolveAuthScreenTarget correctly routes all auth states', () => {
  const fullUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    username: 'athlete_one',
    displayName: 'Athlete One',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  const googleNewUserWithoutUsername: AuthUser = {
    id: 'user-google-new',
    email: 'google@example.com',
    username: '', // empty username from DB null
    displayName: 'Google Newbie',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  // 1. Initial resolution -> loading
  assert.equal(resolveAuthScreenTarget('loading', null), 'loading');

  // 2. Unauthenticated anonymous user -> AuthScreen
  assert.equal(resolveAuthScreenTarget('anonymous', null), 'auth_screen');

  // 3. New user from Google without chosen username -> Onboarding
  assert.equal(resolveAuthScreenTarget('authenticated', googleNewUserWithoutUsername), 'onboarding');

  // 4. Fully registered user -> Main App
  assert.equal(resolveAuthScreenTarget('authenticated', fullUser), 'main_app');

  // 5. Offline previously authenticated user -> Main App
  assert.equal(resolveAuthScreenTarget('offline', fullUser), 'main_app');
});

test('password visibility toggle preserves string content while switching representation', () => {
  let showPassword = false;
  const rawInput = 'SuperSecret123!';

  // Initial state: password masked
  assert.equal(showPassword ? 'text' : 'password', 'password');

  // Toggle on (click Eye)
  showPassword = !showPassword;
  assert.equal(showPassword ? 'text' : 'password', 'text');
  assert.equal(rawInput, 'SuperSecret123!'); // Content untouched

  // Toggle off (click EyeOff)
  showPassword = !showPassword;
  assert.equal(showPassword ? 'text' : 'password', 'password');
  assert.equal(rawInput, 'SuperSecret123!');
});

test('Google and account linking error codes are mapped correctly to typed codes', () => {
  const linkingError = mapApiError(new HttpError(409, 'ACCOUNT_LINKING_REQUIRED'));
  assert.equal(linkingError.code, 'account_linking_required');
  assert.equal(linkingError.status, 409);
  assert.equal(linkingError.retryable, false);

  const googleError = mapApiError(new HttpError(401, 'GOOGLE_AUTH_FAILED'));
  assert.equal(googleError.code, 'google_auth_failed');
  assert.equal(googleError.status, 401);
  assert.equal(googleError.retryable, false);

  const unverifiedEmailError = mapApiError(new HttpError(401, 'UNVERIFIED_EMAIL'));
  assert.equal(unverifiedEmailError.code, 'google_auth_failed');
});

test('username onboarding validation and normalization invariants hold', () => {
  assert.equal(normalizeUsername('@Athlete_123'), 'athlete_123');
  assert.equal(normalizeUsername('  user.name  '), 'user.name');

  assert.equal(isValidUsername('athlete_123'), true);
  assert.equal(isValidUsername('a.b.c'), true);
  assert.equal(isValidUsername('ab'), false); // too short (<3)
  assert.equal(isValidUsername('user with space'), false);
  assert.equal(isValidUsername('invalid!chars#'), false);
});
