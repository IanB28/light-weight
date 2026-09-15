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
