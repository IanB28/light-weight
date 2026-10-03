import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, X } from 'lucide-react';
import type { Exercise, Routine, RoutineShareSummary, WorkoutSetType } from '@light-weight/domain';
import { BottomSheet, Button, SectionHeader } from '../../components/ui/index.js';
import { mapApiError } from '../../lib/api-errors.js';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import type { AppPreferences } from '../../lib/preferences.js';
import { routineSharesApi } from '../../lib/social-api.js';
import { formatDisplayWeight } from '../../lib/weight-units.js';
import { ExerciseThumbnail } from '../../components/ExerciseThumbnail.js';

const setTypeKeys: Record<WorkoutSetType, TranslationKey> = {
  warmup: 'workout.warmupSet', working: 'workout.workingSet',
  drop: 'workout.dropSet', backoff: 'workout.backoffSet'
};

export const pendingReceivedShares = (shares: readonly RoutineShareSummary[]) =>
  shares.filter((share) => share.status === 'pending');

export function ReceivedRoutinePreview({ share, exercises, preferences, busy, onImport, onDismiss, onClose }: {
  share: RoutineShareSummary;
  exercises: Exercise[];
  preferences?: AppPreferences;
  busy: boolean;
  onImport: () => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const byId = new Map(exercises.filter((exercise) => !exercise.isCustom).map((exercise) => [exercise.id, exercise]));
  const templateById = new Map(share.template?.exercises.map((item) => [item.exerciseId, item]) ?? []);
  const exerciseIds = share.template?.exercises.map((item) => item.exerciseId) ?? share.exerciseIds;
  return <BottomSheet open onClose={onClose} title={share.routineName} description={t('sharing.preview')}>
    <div className="space-y-4">
      <p className="text-xs font-semibold text-text-secondary">{t('sharing.sharedBy', { username: share.sender.username })}</p>
      {share.routineDescription && <p className="text-sm text-text-secondary">{share.routineDescription}</p>}
      <div className="divide-y divide-border-subtle overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input">
        {exerciseIds.map((id, index) => {
          const exercise = byId.get(id);
          const sets = templateById.get(id)?.sets ?? [];
          return <div key={`${id}-${index}`} className="min-w-0 space-y-1.5 p-3">
            <div className="flex min-w-0 items-center gap-2.5"><ExerciseThumbnail exercise={exercise} size="sm" /><p className="min-w-0 break-words text-sm font-bold text-text-primary">{index + 1}. {exercise?.name ?? t('sharing.snapshotUnavailable', { id })}</p></div>
            {sets.length > 0 && <p className="text-xs text-text-muted">{t('sharing.setCount', { count: sets.length })}</p>}
            {sets.map((set, setIndex) => <p key={setIndex} className="text-xs text-text-secondary">
              {setIndex + 1}. {t(setTypeKeys[set.setType])} · {t('sharing.targetWeight', { weight: formatDisplayWeight(set.targetWeightKg, preferences?.units ?? 'metric') })}
            </p>)}
          </div>;
        })}
      </div>
      <Button className="w-full" disabled={busy} onClick={onImport}><Download className="size-4" />{t('sharing.import')}</Button>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={onDismiss}><X className="size-4" />{t('sharing.dismiss')}</Button>
    </div>
  </BottomSheet>;
}

export function ReceivedRoutines({ onImport, exercises, preferences }: {
  onImport: (routine: Routine) => void;
  exercises: Exercise[];
  preferences?: AppPreferences;
}) {
  const auth = useAuth();
  const { t } = useI18n();
  const [shares, setShares] = useState<RoutineShareSummary[]>([]);
  const [selected, setSelected] = useState<RoutineShareSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setShares([]);
      setSelected(null);
      setError(null);
      setNotice(null);
      return;
    }
    let cancelled = false;
    setShares([]);
    setSelected(null);
    setNotice(null);
    void routineSharesApi.received()
      .then((result) => { if (!cancelled) { setShares(pendingReceivedShares(result.shares)); setError(null); } })
      .catch((cause) => { if (!cancelled) setError(`auth.error.${mapApiError(cause).code}` as TranslationKey); });
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, auth.user?.id]);

  if (!auth.isAuthenticated || (shares.length === 0 && !error && !notice)) return null;

  const importShare = async (share: RoutineShareSummary) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(share.id);
    try {
      const result = await routineSharesApi.import(share.id);
      onImport(result.routine);
      setShares((current) => current.filter((item) => item.id !== share.id));
      setSelected(null);
      setNotice('sharing.imported');
      setError(null);
    } catch (cause) {
      setError(`auth.error.${mapApiError(cause).code}` as TranslationKey);
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const dismiss = async (share: RoutineShareSummary) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(share.id);
    try {
      await routineSharesApi.dismiss(share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      setSelected(null);
      setError(null);
    } catch (cause) {
      setError(`auth.error.${mapApiError(cause).code}` as TranslationKey);
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  return <section className="space-y-2.5">
    {shares.length > 0 && <SectionHeader title={t('sharing.received')} meta={String(shares.length)} />}
    {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{t(error)}</p>}
    {notice && <p role="status" className="rounded-ui-md border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">{t(notice)}</p>}
    <div className="space-y-2">
      {shares.map((share) => <div key={share.id} className="rounded-ui-xl border border-border-subtle bg-surface p-3">
        <p className="truncate text-sm font-bold text-text-primary">{share.routineName}</p>
        <p className="mt-0.5 text-xs text-text-muted">{t('sharing.sharedBy', { username: share.sender.username })} · {t(share.exerciseIds.length === 1 ? 'sharing.exerciseCount_one' : 'sharing.exerciseCount', { count: share.exerciseIds.length })}</p>
        <Button size="sm" variant="secondary" className="mt-3 w-full" disabled={busyId !== null} onClick={() => setSelected(share)}>
          {t('sharing.review')}<ChevronRight className="size-4" />
        </Button>
      </div>)}
    </div>
    {selected && <ReceivedRoutinePreview share={selected} exercises={exercises} preferences={preferences} busy={busyId !== null}
      onImport={() => void importShare(selected)} onDismiss={() => void dismiss(selected)} onClose={() => setSelected(null)} />}
  </section>;
}
