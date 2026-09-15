import React, { useCallback, useState } from 'react';
import { Dumbbell, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { Button, PasswordField } from '../../components/ui/index.js';
import { GoogleSignInButton } from './GoogleSignInButton.js';

type AuthMode = 'login' | 'register';

export function AuthScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (mode === 'register' && password !== confirmPassword) {
      setError('auth.passwordMismatch');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = mode === 'login'
      ? await auth.login(email, password)
      : await auth.register({ displayName, username, email, password });

    setSubmitting(false);

    if (!result.ok) {
      setError(`auth.error.${result.error.code}` as TranslationKey);
    }
  };

  const handleGoogleSuccess = useCallback(async (credential: string) => {
    setSubmitting(true);
    setError(null);

    const result = await auth.loginWithGoogle(credential);
    setSubmitting(false);

    if (!result.ok) {
      const errCode = result.error.code;
      if (errCode === 'account_linking_required') {
        setError('auth.error.account_linking_required');
        // Prompt user to log in with password
        setMode('login');
      } else {
        setError(`auth.error.${errCode}` as TranslationKey);
      }
    }
  }, [auth]);

  const handleGoogleError = useCallback((errorKey: string) => {
    setError(errorKey as TranslationKey);
  }, []);

  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden p-4 sm:p-6 font-sans text-text-primary selection:bg-accent selection:text-accent-fg">
      {/* Background orbs */}
      <div
        className="pointer-events-none fixed -top-24 left-1/2 -z-10 h-[28rem] w-[38rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-1)' }}
      />
      <div
        className="pointer-events-none fixed top-[30%] -left-28 -z-10 size-[32rem] rounded-full blur-[170px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-2)' }}
      />
      <div
        className="pointer-events-none fixed top-[55%] -right-24 -z-10 size-[32rem] rounded-full blur-[170px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-3)' }}
      />
      <div
        className="pointer-events-none fixed top-[20%] left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-brand, rgba(48, 209, 88, 0.08))' }}
      />

      <main className="w-full max-w-md my-auto py-6">
        {/* Brand header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/15 text-accent shadow-sm">
            <Dumbbell className="size-6" aria-hidden="true" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
            Light Weight
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {mode === 'login' ? t('auth.welcomeBack') : t('auth.registerTitle')}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            {mode === 'login' ? t('auth.welcomeSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

        {/* Card */}
        <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle p-6 sm:p-8 shadow-card transition-all">
          {/* Google Sign In */}
          {hasGoogleClientId && (
            <div className="space-y-4">
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={submitting}
              />

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-border-subtle" />
                <span className="relative bg-surface px-3 text-[11px] font-medium text-text-muted uppercase">
                  {t('auth.or')}
                </span>
              </div>
            </div>
          )}

          {/* Email / Password form */}
          <form onSubmit={handleEmailSubmit} className={`space-y-3.5 ${hasGoogleClientId ? 'mt-4' : ''}`}>
            {mode === 'register' && (
              <>
                <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
                  <span>{t('profile.displayName')}</span>
                  <input
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
                    required
                  />
                </label>

                <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
                  <span>{t('profile.username')}</span>
                  <div className="relative flex items-center">
                    <span className="pointer-events-none absolute left-3 select-none text-sm font-semibold text-text-muted">
                      @
                    </span>
                    <input
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={30}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
                      required
                    />
                  </div>
                </label>
              </>
            )}

            <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
              <span>{t('auth.email')}</span>
              <input
                type="email"
                autoComplete="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
                required
              />
            </label>

            <PasswordField
              label={t('auth.password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {mode === 'register' && (
              <PasswordField
                label={t('auth.confirmPassword')}
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            )}

            {error && (
              <p
                role="alert"
                className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger leading-relaxed"
              >
                {t(error)}
              </p>
            )}

            {auth.status === 'offline' && (
              <p
                role="status"
                className="rounded-ui-md border border-border-subtle bg-surface-input p-3 text-xs text-text-secondary"
              >
                {t('auth.offline')}
              </p>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              loading={submitting}
              disabled={submitting}
            >
              {mode === 'login' ? <LogIn className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
              <span>{submitting ? t('auth.submitting') : mode === 'login' ? t('auth.login') : t('auth.createAccount')}</span>
            </Button>
          </form>

          {/* Switch mode footer */}
          <div className="mt-6 pt-4 border-t border-border-subtle text-center">
            {mode === 'login' ? (
              <p className="text-xs text-text-secondary">
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1 py-0.5"
                >
                  {t('auth.createAccount')}
                </button>
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                {t('auth.hasAccount')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1 py-0.5"
                >
                  {t('auth.login')}
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
