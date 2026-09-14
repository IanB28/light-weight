import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { Routine, RoutineShareSummary } from '@light-weight/domain';
import { Button, SectionHeader } from '../../components/ui/index.js';
import { mapApiError } from '../../lib/api-errors.js';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { routineSharesApi } from '../../lib/social-api.js';

export function ReceivedRoutines({ onImport }: { onImport: (routine: Routine) => void }) {
  const auth = useAuth();
  const { t } = useI18n();
  const [shares, setShares] = useState<RoutineShareSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setShares([]);
      setError(null);
      return;
    }
    void routineSharesApi.received()
      .then((result) => { setShares(result.shares); setError(null); })
      .catch((cause) => setError(`auth.error.${mapApiError(cause).code}` as TranslationKey));
  }, [auth.isAuthenticated]);

  if (!auth.isAuthenticated || (shares.length === 0 && !error)) return null;

  const importShare = async (share: RoutineShareSummary) => {
    if (busyId) return;
    setBusyId(share.id);
    try {
      const result = await routineSharesApi.import(share.id);
      onImport(result.routine);
      setShares((current) => current.filter((item) => item.id !== share.id));
      setError(null);
    } catch (cause) {
      setError(`auth.error.${mapApiError(cause).code}` as TranslationKey);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (share: RoutineShareSummary) => {
    if (busyId) return;
    setBusyId(share.id);
    try {
      await routineSharesApi.dismiss(share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      setError(null);
    } catch (cause) {
      setError(`auth.error.${mapApiError(cause).code}` as TranslationKey);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-2.5">
      <SectionHeader title={t('sharing.received')} meta={String(shares.length)} />
      {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{t(error)}</p>}
      <div className="space-y-2">
        {shares.map((share) => (
          <div key={share.id} className="rounded-ui-xl border border-border-subtle bg-surface p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text-primary">{share.routineName}</p>
                <p className="mt-0.5 text-xs text-text-muted">{t('sharing.from', { name: share.sender.displayName })} · {share.exerciseIds.length} {t('library.exercises')}</p>
              </div>
              <button type="button" disabled={busyId !== null} className="flex size-11 shrink-0 items-center justify-center rounded-ui-lg text-text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" aria-label={t('sharing.dismiss')} onClick={() => void dismiss(share)}>
                <X className="size-4" />
              </button>
            </div>
            <Button size="sm" className="mt-3 w-full" disabled={busyId !== null} onClick={() => void importShare(share)}>
              <Download className="size-4" />{t('sharing.import')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
