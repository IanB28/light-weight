import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { HttpError, mapApiError } from '../../lib/api-errors.js';
import { resolveSessionRefreshFailure, type AuthStatus } from '../../lib/auth-session-state.js';
import { isValidUsername, normalizeUsername, type AuthUser } from '@light-weight/domain';
import { resolveAuthScreenTarget } from './auth-routing.js';
import {
  PasswordField,
  resolvePasswordInputType,
  togglePasswordVisibility
} from '../../components/ui/PasswordField.js';
import { dictionaries } from '../../lib/i18n.js';
import { ViewHeader } from '../../components/ViewHeader.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  CACHED_AUTH_USER_KEY,
  clearCachedAuthUser,
  getCachedAuthUser,
  setCachedAuthUser
} from '../../lib/auth-cache.js';

test('resolveAuthScreenTarget correctly routes all auth states using real production function', () => {
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
  assert.equal(resolveAuthScreenTarget({ status: 'loading', isAuthenticated: false, user: null }), 'loading');

  // 2. Unauthenticated anonymous user -> AuthScreen
  assert.equal(resolveAuthScreenTarget({ status: 'anonymous', isAuthenticated: false, user: null }), 'auth_screen');

  // 3. New user from Google without chosen username -> Onboarding
  assert.equal(
    resolveAuthScreenTarget({ status: 'authenticated', isAuthenticated: true, user: googleNewUserWithoutUsername }),
    'onboarding'
  );

  // 4. Fully registered user -> Main App
  assert.equal(
    resolveAuthScreenTarget({ status: 'authenticated', isAuthenticated: true, user: fullUser }),
    'main_app'
  );

  // 5. Offline previously authenticated user -> Main App
  assert.equal(
    resolveAuthScreenTarget({ status: 'offline', isAuthenticated: true, user: fullUser }),
    'main_app'
  );
});

test('PasswordField real component renders, toggles password -> text -> password and preserves value', () => {
  const rawSecret = 'SuperSecret123!@#';

  // 1. Verify toggle transition primitives
  assert.equal(togglePasswordVisibility(false), true);
  assert.equal(togglePasswordVisibility(true), false);
  assert.equal(resolvePasswordInputType(false), 'password');
  assert.equal(resolvePasswordInputType(true), 'text');

  // 2. Render real PasswordField in masked state (password)
  const maskedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PasswordField, {
      label: 'Contraseña',
      value: rawSecret,
      visible: false,
      readOnly: true
    })
  );

  assert.ok(maskedHtml.includes('type="password"'), 'Input must have type="password" when masked');
  assert.ok(maskedHtml.includes(`value="${rawSecret}"`), 'Input must preserve the exact value');
  assert.ok(maskedHtml.includes('aria-label="Mostrar contraseña"'), 'Button must indicate show password action');

  // 3. Render real PasswordField in revealed state (text)
  const revealedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PasswordField, {
      label: 'Contraseña',
      value: rawSecret,
      visible: true,
      readOnly: true
    })
  );

  assert.ok(revealedHtml.includes('type="text"'), 'Input must have type="text" when revealed');
  assert.ok(revealedHtml.includes(`value="${rawSecret}"`), 'Input must preserve the exact same value when toggled');
  assert.ok(revealedHtml.includes('aria-label="Ocultar contraseña"'), 'Button must indicate hide password action');

  // 4. Toggle back to masked state (password)
  const remaskedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PasswordField, {
      label: 'Contraseña',
      value: rawSecret,
      visible: false,
      readOnly: true
    })
  );

  assert.ok(remaskedHtml.includes('type="password"'), 'Input must return to type="password"');
  assert.ok(remaskedHtml.includes(`value="${rawSecret}"`), 'Input must preserve the exact value on remasking');

  // NOTE on testing limits:
  // Node.js runner executes in a headless Node environment without JSDOM or browser window.
  // Full mouse-click event simulation on live DOM tree nodes is omitted here to avoid adding
  // heavy testing libraries (e.g. jsdom / @testing-library), as verified by SSR HTML rendering above.
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

test('auth.welcomeBack is simplified to "Bienvenido" (ES) and "Welcome" (EN)', () => {
  assert.equal(dictionaries.es['auth.welcomeBack'], 'Bienvenido');
  assert.equal(dictionaries.en['auth.welcomeBack'], 'Welcome');
  assert.equal(dictionaries.es['auth.welcomeSubtitle'], 'Inicia sesión para continuar');
  assert.equal(dictionaries.en['auth.welcomeSubtitle'], 'Sign in to continue');
});

test('ViewHeader renders clean flex layout without brittle absolute padding and supports touch target for settings', () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ViewHeader, {
      title: 'LightWeight',
      subtitle: 'Martes, 15 de septiembre',
      onOpenSettings: () => {}
    })
  );

  assert.ok(!html.includes('pr-[5.5rem]'), 'ViewHeader must not use hardcoded right padding');
  assert.ok(html.includes('justify-between'), 'ViewHeader must use flex justify-between');
  assert.ok(html.includes('gap-3'), 'ViewHeader must have proper gap');
  assert.ok(html.includes('truncate'), 'Title must be truncatable cleanly');
  assert.ok(html.includes('aria-label="Abrir ajustes"'), 'Settings button must have accessible label');
});

test('App.tsx strictly eliminates preview bypass query params in production code', () => {
  const appPath = path.resolve(process.cwd(), 'src', 'App.tsx');
  assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
  const appSource = fs.readFileSync(appPath, 'utf8');

  // Verify no preview query param or bypass logic exists
  assert.ok(!appSource.includes('preview=home'), 'App.tsx must not contain preview=home');
  assert.ok(!appSource.includes('isPreviewMode'), 'App.tsx must not declare or use isPreviewMode');
  assert.ok(!appSource.includes('window.location.search'), 'App.tsx must not inspect window.location.search');

  // Verify unconditional gating
  assert.match(appSource, /if \(authTarget === 'loading'\) \{\s*return <AuthLoadingScreen \/>;\s*\}/);
  assert.match(appSource, /if \(authTarget === 'auth_screen'\) \{\s*return <AuthScreen \/>;\s*\}/);
  assert.match(appSource, /if \(authTarget === 'onboarding' && auth\.user\) \{\s*return <UsernameOnboardingScreen user=\{auth\.user\} \/>;\s*\}/);
});

class MockLocalStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return Array.from(this.items.keys())[index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

test('auth-cache persists only safe AuthUser profile metadata and sanitizes forbidden secrets', () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const mockStorage = new MockLocalStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: mockStorage };

  try {
    assert.equal(CACHED_AUTH_USER_KEY, 'lightweight_cached_auth_user_v1');

    // 1. Initial state is empty
    assert.equal(getCachedAuthUser(), null);

    // 2. Setting user with forbidden/dangerous secrets must sanitize them out
    const userWithSecrets = {
      id: 'athlete-007',
      email: 'athlete@example.com',
      username: 'agent007',
      displayName: 'James Bond',
      birthDate: '1990-05-15',
      gender: 'male' as const,
      avatarUrl: 'https://cdn.example.com/avatar.png',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      // Prohibited attributes that must NOT be persisted:
      password: 'PlainSecretPassword123!',
      sessionCookie: 'lw_session=secret_token',
      csrfToken: 'lw_csrf=csrf_secret',
      googleCredential: 'jwt.id_token.payload'
    };

    setCachedAuthUser(userWithSecrets as unknown as AuthUser);

    // Verify localStorage content directly
    const storedRaw = mockStorage.getItem(CACHED_AUTH_USER_KEY);
    assert.ok(storedRaw, 'Cached auth user must be present in localStorage');
    assert.ok(!storedRaw.includes('PlainSecretPassword123!'), 'Passwords must never be stored in localStorage');
    assert.ok(!storedRaw.includes('secret_token'), 'Session cookies must never be stored in localStorage');
    assert.ok(!storedRaw.includes('csrf_secret'), 'CSRF tokens must never be stored in localStorage');
    assert.ok(!storedRaw.includes('jwt.id_token.payload'), 'Google credentials must never be stored in localStorage');

    // Verify retrieval matches valid AuthUser structure
    const retrieved = getCachedAuthUser();
    assert.ok(retrieved);
    assert.equal(retrieved.id, 'athlete-007');
    assert.equal(retrieved.email, 'athlete@example.com');
    assert.equal(retrieved.username, 'agent007');
    assert.equal(retrieved.displayName, 'James Bond');
    assert.equal(retrieved.birthDate, '1990-05-15');
    assert.equal(retrieved.gender, 'male');
    assert.equal(retrieved.avatarUrl, 'https://cdn.example.com/avatar.png');
    assert.equal((retrieved as unknown as Record<string, unknown>).password, undefined);

    // 3. Corrupted or invalid JSON in storage must gracefully return null and clean up
    mockStorage.setItem(CACHED_AUTH_USER_KEY, '{"invalid_json": true, incomplete');
    assert.equal(getCachedAuthUser(), null);

    // 4. Missing required fields in storage must gracefully return null and clean up
    mockStorage.setItem(CACHED_AUTH_USER_KEY, JSON.stringify({ id: '', email: '' }));
    assert.equal(getCachedAuthUser(), null);
    assert.equal(mockStorage.getItem(CACHED_AUTH_USER_KEY), null);

    // 5. Explicit clearCachedAuthUser removes the item
    setCachedAuthUser(userWithSecrets as unknown as AuthUser);
    assert.ok(mockStorage.getItem(CACHED_AUTH_USER_KEY));
    clearCachedAuthUser();
    assert.equal(mockStorage.getItem(CACHED_AUTH_USER_KEY), null);
    assert.equal(getCachedAuthUser(), null);
  } finally {
    if (previousWindow !== undefined) {
      (globalThis as unknown as { window: unknown }).window = previousWindow;
    } else {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  }
});

test('cold start session resolution differentiates offline with cached identity vs anonymous without identity', () => {
  const cachedUser: AuthUser = {
    id: 'user-cached-1',
    email: 'runner@example.com',
    username: 'fast_runner',
    displayName: 'Fast Runner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  const networkFailure = { code: 'network' as const, retryable: true };
  const unauthorizedFailure = { code: 'unauthorized' as const, retryable: false };

  // Case 1: Cold start offline WITH cached identity
  // When /api/auth/me fails with network error, identity is preserved, status is 'offline', and user enters main_app
  const offlineResult = resolveSessionRefreshFailure(cachedUser, networkFailure);
  assert.equal(offlineResult.user?.id, cachedUser.id);
  assert.equal(offlineResult.status, 'offline');
  assert.equal(
    resolveAuthScreenTarget({ status: offlineResult.status, isAuthenticated: true, user: offlineResult.user }),
    'main_app'
  );

  // Case 2: Cold start offline WITHOUT cached identity (anonymous first visit offline)
  // When /api/auth/me fails with network error and user is null, status is 'anonymous' and user sees auth_screen
  const anonResult = resolveSessionRefreshFailure(null, networkFailure);
  assert.equal(anonResult.user, null);
  assert.equal(anonResult.status, 'anonymous');
  assert.equal(
    resolveAuthScreenTarget({ status: anonResult.status, isAuthenticated: false, user: null }),
    'auth_screen'
  );

  // Case 3: Confirmed 401 unauthenticated response
  // Explicit unauthenticated discards even cached identity and redirects to auth_screen
  const unauthResult = resolveSessionRefreshFailure(cachedUser, unauthorizedFailure);
  assert.equal(unauthResult.user, null);
  assert.equal(unauthResult.status, 'anonymous');
  assert.equal(
    resolveAuthScreenTarget({ status: unauthResult.status, isAuthenticated: false, user: null }),
    'auth_screen'
  );
});
