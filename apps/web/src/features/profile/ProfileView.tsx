import React, { useMemo, useState } from 'react';
import { Award, Pencil, UserRound } from 'lucide-react';
import {
  calculateAge,
  calculateSessionTotalVolume,
  calculateWeeklyStreak,
  Exercise,
  WorkoutSession
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
import { AppCard, Button, EmptyState, SegmentedControl } from '../../components/ui/index.js';

interface ProfileViewProps {
  profile: UserProfile;
  userInfo: UserInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
  onSave: (profile: UserProfile) => void | string | Promise<void | string>;
  onOpenFriends?: () => void;
  onLogout?: () => void;
  isRemote?: boolean;
}

type ProfileMode = 'summary' | 'edit';

export function ProfileView({ profile, userInfo, history, exercises, onSave, onOpenFriends, onLogout, isRemote = false }: ProfileViewProps) {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const [mode, setMode] = useState<ProfileMode>('summary');
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const displayName = profile.displayName === 'Atleta'
    ? (userInfo.name && userInfo.name !== 'Atleta' ? userInfo.name : t('profile.athlete'))
    : profile.displayName;
  const age = profile.birthDate ? calculateAge(profile.birthDate) : null;
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LW';

  const summary = useMemo(() => {
    const records = calculateAllPersonalRecords(history);
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
  }, [exercises, history, t]);

  const openEdit = () => {
    setDraft({ ...profile, displayName });
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
    const saveError = await onSave({
      ...draft,
      displayName: draft.displayName.trim() || userInfo.name || t('profile.athlete'),
      username: username || undefined
    });
    if (saveError) { setError(saveError); return; }
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
          <Button type="button" variant="secondary" onClick={() => setMode('summary')}>{t('common.cancel')}</Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-accent-soft text-xl font-extrabold text-accent shadow-accent">
          {profile.avatarUrl && !avatarFailed
            ? <img src={profile.avatarUrl} alt="" className="size-full object-cover" onError={() => setAvatarFailed(true)} />
            : initials}
        </div>
        <h3 className="mt-3 text-xl font-extrabold text-text-primary">{displayName}</h3>
        {profile.username && <p className="text-sm text-text-muted">@{profile.username}</p>}
        <p className="mt-1 text-xs font-semibold text-text-secondary">
          {t('profile.athlete')}{age !== null ? ` · ${t('profile.years', { count: age })}` : ''}
        </p>
        <Button variant="ghost" size="sm" onClick={openEdit} className="mt-2">
          <Pencil aria-hidden="true" className="size-3.5" />{t('profile.edit')}
        </Button>
        {isRemote && <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onOpenFriends && <Button variant="secondary" size="sm" onClick={onOpenFriends}>{t('friends.title')}</Button>}
          {onLogout && <Button variant="ghost" size="sm" onClick={onLogout}>{t('auth.logout')}</Button>}
        </div>}
      </div>

      {/* Apartado de Género */}
      <section className="space-y-2 rounded-ui-xl border border-border-subtle bg-surface p-3.5" aria-labelledby="profile-gender-section">
        <div className="flex items-center justify-between">
          <h4 id="profile-gender-section" className="text-xs font-bold uppercase tracking-wider text-text-muted">
            {t('profile.gender')}
          </h4>
          {profile.gender ? (
            <span className="text-xs font-mono font-bold text-accent">
              {profile.gender === 'male' ? t('profile.male') : t('profile.female')}
            </span>
          ) : (
            <span className="text-xs font-mono font-bold text-amber-400">
              {t('profile.genderUnset')}
            </span>
          )}
        </div>

        <SegmentedControl
          value={profile.gender || ''}
          label={t('profile.gender')}
          options={[
            { value: 'male', label: t('profile.male') },
            { value: 'female', label: t('profile.female') }
          ]}
          onChange={(gender) => {
            void onSave({ ...profile, gender: gender as 'male' | 'female' });
          }}
        />

        {!profile.gender && (
          <p className="text-[11px] text-text-muted">
            {t('profile.genderPrompt')}
          </p>
        )}
      </section>

      <AppCard compact className="grid grid-cols-3 divide-x divide-border-subtle text-center">
        {[
          [summary.totalWorkouts, t('profile.workouts')],
          [new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(displayWeight(summary.totalVolumeKg, preferences.units)), t('profile.volume', { unit: WEIGHT_UNIT_PRESETS[preferences.units].unit })],
          [summary.streak, t('profile.weeks')]
        ].map(([value, label]) => <div key={String(label)} className="min-w-0 px-1.5"><p className="truncate font-mono text-base font-extrabold text-text-primary">{value}</p><p className="mt-0.5 text-[10px] leading-tight text-text-muted">{label}</p></div>)}
      </AppCard>

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
