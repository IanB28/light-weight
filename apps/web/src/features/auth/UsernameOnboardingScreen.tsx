import React, { useState } from 'react';
import { UserCheck, Sparkles } from 'lucide-react';
import { isValidUsername, normalizeUsername, type AuthUser } from '@light-weight/domain';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { Button } from '../../components/ui/index.js';

interface UsernameOnboardingScreenProps {
  user: AuthUser;
}

export function UsernameOnboardingScreen({ user }: UsernameOnboardingScreenProps) {
  const auth = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(user.displayName || 'Atleta');
  const [rawUsername, setRawUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const normalized = normalizeUsername(rawUsername);
    if (!isValidUsername(normalized)) {
      setError('auth.error.invalid_username');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await auth.updateProfile({
      username: normalized,
      displayName: displayName.trim() || 'Atleta'
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(`auth.error.${result.error.code}` as TranslationKey);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden overflow-y-auto p-4 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] font-sans text-text-primary">
      {/* Background orbs */}
      <div
        className="pointer-events-none fixed -top-24 left-1/2 -z-10 h-[26rem] w-[36rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-1)' }}
      />
      <div
        className="pointer-events-none fixed top-[35%] -left-28 -z-10 size-[30rem] rounded-full blur-[170px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-2)' }}
      />
      <div
        className="pointer-events-none fixed top-[20%] left-1/2 -z-10 size-[26rem] -translate-x-1/2 rounded-full blur-[160px] transition-colors duration-700"
        style={{ backgroundColor: 'var(--orb-brand, rgba(48, 209, 88, 0.1))' }}
      />

      <main className="w-full max-w-md my-auto py-4 sm:py-6">
        <div className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle p-6 sm:p-7 shadow-card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-sm">
              <Sparkles className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
              {t('auth.completeProfile')}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-text-muted leading-relaxed">
              {t('auth.onboardingSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <span>{t('auth.chooseUsername')}</span>
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
                  placeholder="tu_usuario"
                  value={rawUsername}
                  onChange={(e) => setRawUsername(e.target.value)}
                  className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
                  required
                />
              </div>
              <span className="block text-[11px] font-normal text-text-muted">
                {t('profile.invalidUsername')}
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger leading-relaxed"
              >
                {t(error)}
              </p>
            )}

            <Button
              type="submit"
              className="mt-2 w-full"
              loading={submitting}
              disabled={submitting || !rawUsername.trim()}
            >
              <UserCheck className="size-4" aria-hidden="true" />
              <span>{t('auth.saveAndContinue')}</span>
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
