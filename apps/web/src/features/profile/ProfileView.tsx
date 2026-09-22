import React, { useMemo, useState } from 'react';
import { Award, Pencil, UserRound } from 'lucide-react';
import {
  calculateAge,
  calculateSessionTotalVolume,
  calculateWeeklyStreak,
  Exercise,
  WorkoutSession,
  BodyweightEntry
} from '@light-weight/domain';
import {
  calculateAllPersonalRecords,
  UserInfo,
  UserProfile
} from '../../lib/storage.js';
import { useI18n } from '../../lib/i18n.js';
import { resolveExerciseName } from '../../lib/exercise-names.js';
import { displayWeight, formatDisplayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { AppCard, Button, EmptyState, IconButton } from '../../components/ui/index.js';
import { ProfileStrengthSection } from './ProfileStrengthSection.js';
import { ProfileAvatar } from './ProfileIdentityButton.js';
import { submitProfileDraft } from './profile-save.js';

interface ProfileViewProps {
  profile: UserProfile;
  userInfo: UserInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
  onSave: (profile: UserProfile) => void | string | Promise<void | string>;
  bodyweightKg?: number | null;
  bodyweightEntries?: BodyweightEntry[];
  onConfigureGender?: () => void;
}

type ProfileMode = 'summary' | 'edit';

export function ProfileView({
  profile,
  userInfo,
  history,
  exercises,
  onSave,
  bodyweightKg,
  bodyweightEntries,
  onConfigureGender
}: ProfileViewProps) {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const [mode, setMode] = useState<ProfileMode>('summary');
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [error, setError] = useState<string | null>(null);

  const displayName = profile.displayName === 'Atleta'
    ? (userInfo.name && userInfo.name !== 'Atleta' ? userInfo.name : t('profile.athlete'))
    : profile.displayName;
  const age = profile.birthDate ? calculateAge(profile.birthDate) : null;

  const summary = useMemo(() => {
    const exercisesById = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]));
    const records = calculateAllPersonalRecords(history, { exercisesById, bodyweightEntries });
    return {
      totalWorkouts: history.length,
      totalVolumeKg: history.reduce((total, session) => total + calculateSessionTotalVolume(session), 0),
      streak: calculateWeeklyStreak(history),
      records: Object.values(records)
        .sort((a, b) => b.est1Rm - a.est1Rm)
        .slice(0, 3)
        .map((record) => ({
          ...record,
          name: resolveExerciseName(record.exerciseId, exercises, history, t('profile.exerciseUnavailable'))
        }))
    };
  }, [bodyweightEntries, exercises, history, t]);

  const openEdit = () => {
    setDraft(createProfileDraft(profile, displayName));
    setError(null);
    setMode('edit');
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = draft.username?.trim().replace(/^@/, '').toLowerCase();
    if (username && !/^[a-z0-9._]{3,30}$/.test(username)) {
      setError(t('profile.invalidUsername'));
      return;
    }
    if (draft.birthDate && calculateAge(draft.birthDate) === null) {
      setError(t('profile.invalidBirthDate'));
      return;
    }
    const result = await submitProfileDraft(onSave, {
      ...draft,
      displayName: draft.displayName.trim() || userInfo.name || t('profile.athlete'),
      username: username || undefined
    });
    if (!result.shouldClose) { setError(result.error); return; }
    setError(null);
    setMode('summary');
  };

  if (mode === 'edit') {
    return (
      <form onSubmit={handleSave} className="space-y-4">
        <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
          <span>{t('profile.displayName')}</span>
          <input value={draft.displayName} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
        </label>
        <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
          <span>{t('profile.username')}</span>
          <div className="flex h-11 items-center rounded-ui-lg border border-border-subtle bg-surface-input focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            <span className="pl-3 text-text-muted">@</span>
            <input value={draft.username || ''} autoCapitalize="none" autoCorrect="off" maxLength={30} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))} className="min-w-0 flex-1 bg-transparent px-1.5 text-sm text-text-primary outline-none" />
          </div>
        </label>
        <label className="block space-y-1.5 text-xs font-bold text-text-secondary">
          <span>{t('profile.birthDate')}</span>
          <input type="date" value={draft.birthDate || ''} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value || undefined }))} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
        </label>
        {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => { setError(null); setMode('summary'); }}>{t('common.cancel')}</Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative flex flex-col items-center text-center">
        <IconButton
          variant="secondary"
          aria-label={t('profile.edit')}
          onClick={openEdit}
          className="absolute right-0 top-0 size-11"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </IconButton>
        <ProfileAvatar displayName={displayName} avatarUrl={profile.avatarUrl} className="size-20 text-xl shadow-accent" />
        <h3 className="mt-3 max-w-[calc(100%-3.25rem)] break-words text-xl font-extrabold text-text-primary">{displayName}</h3>
        {profile.username && <p className="text-sm text-text-muted">@{profile.username}</p>}
        <p className="mt-1 text-xs font-semibold text-text-secondary">
          {t('profile.athlete')}{age !== null ? ` · ${t('profile.years', { count: age })}` : ''}
        </p>
      </div>

      <AppCard compact className="grid grid-cols-3 divide-x divide-border-subtle text-center">
        {[
          [summary.totalWorkouts, t('profile.workouts')],
          [new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(displayWeight(summary.totalVolumeKg, preferences.units)), t('profile.volume', { unit: WEIGHT_UNIT_PRESETS[preferences.units].unit })],
          [summary.streak, t('profile.weeks')]
        ].map(([value, label]) => <div key={String(label)} className="min-w-0 px-1.5"><p className="truncate font-mono text-base font-extrabold text-text-primary">{value}</p><p className="mt-0.5 text-[10px] leading-tight text-text-muted">{label}</p></div>)}
      </AppCard>

      <ProfileStrengthSection
        history={history}
        exercises={exercises}
        bodyweightKg={bodyweightKg}
        gender={profile.gender}
        bodyweightEntries={bodyweightEntries}
        onConfigureGender={onConfigureGender}
      />

      <section className="space-y-2" aria-labelledby="profile-records">
        <h4 id="profile-records" className="flex items-center gap-2 text-sm font-extrabold text-text-primary"><Award aria-hidden="true" className="size-4 text-accent" />{t('profile.records')}</h4>
        {summary.records.length === 0 ? (
          <EmptyState compact icon={<UserRound className="size-5" />} title={t('profile.noRecords')} />
        ) : (
          <div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
            {summary.records.map((record) => (
              <div key={record.exerciseId} className="flex min-h-12 items-center justify-between gap-3 border-b border-border-subtle px-3 last:border-b-0">
                <span className="min-w-0 truncate text-xs font-bold text-text-primary">{record.name}</span>
                <span className="shrink-0 font-mono text-xs font-bold text-accent">{formatDisplayWeight(record.est1Rm, preferences.units)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function createProfileDraft(profile: UserProfile, displayName: string): UserProfile {
  return { ...profile, displayName };
}
