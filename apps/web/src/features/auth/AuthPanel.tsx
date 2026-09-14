import React, { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { Button, SegmentedControl } from '../../components/ui/index.js';

type Mode = 'login' | 'register';

function fieldClass() {
  return 'h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25';
}

export function AuthPanel() {
  const auth = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (mode === 'register' && password !== confirm) { setError('auth.passwordMismatch'); return; }
    setSubmitting(true); setError(null);
    const result = mode === 'login'
      ? await auth.login(email, password)
      : await auth.register({ displayName, username, email, password });
    setSubmitting(false);
    if (!result.ok) setError(`auth.error.${result.error.code}` as TranslationKey);
  };

  return (
    <div className="space-y-4">
      <SegmentedControl value={mode} label={t('auth.mode')} options={[
        { value: 'login', label: t('auth.login') }, { value: 'register', label: t('auth.register') }
      ]} onChange={(next) => { setMode(next); setError(null); }} />
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && <>
          <label className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('profile.displayName')}</span><input autoComplete="name" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={fieldClass()} required /></label>
          <label className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('profile.username')}</span><input autoComplete="username" autoCapitalize="none" maxLength={30} value={username} onChange={(event) => setUsername(event.target.value)} className={fieldClass()} required /></label>
        </>}
        <label className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('auth.email')}</span><input type="email" autoComplete="email" maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass()} required /></label>
        <label className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('auth.password')}</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass()} required /></label>
        {mode === 'register' && <label className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('auth.confirmPassword')}</span><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} className={fieldClass()} required /></label>}
        {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{t(error)}</p>}
        {auth.status === 'offline' && <p role="status" className="rounded-ui-md border border-border-subtle bg-surface-input p-3 text-xs text-text-secondary">{t('auth.offline')}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {mode === 'login' ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
          {submitting ? t('auth.submitting') : mode === 'login' ? t('auth.login') : t('auth.createAccount')}
        </Button>
      </form>
    </div>
  );
}
