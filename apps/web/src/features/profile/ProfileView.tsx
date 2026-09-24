import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Camera, Pencil, UserRound, X } from 'lucide-react';
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
import { AvatarNormalizationError, normalizeAvatarFile } from './avatar-normalization.js';
import type { AuthUser } from '@light-weight/domain';
import type { OperationResult } from '../../lib/api-errors.js';

interface ProfileViewProps {
  profile: UserProfile;
  userInfo: UserInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
  onSave: (profile: UserProfile) => void | string | Promise<void | string>;
  bodyweightKg?: number | null;
  bodyweightEntries?: BodyweightEntry[];
  onConfigureGender?: () => void;
  /** Presentation-only content supplied by ProfileScreen (for example Friends). */
  summaryAccessory?: React.ReactNode;
  onUploadAvatar?: (avatar: Blob) => Promise<OperationResult<AuthUser>>;
  avatarUploadAvailable?: boolean;
  onClose?: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
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
  onConfigureGender,
  summaryAccessory,
  onUploadAvatar,
  avatarUploadAvailable = false,
  onClose,
  titleRef
}: ProfileViewProps) {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const [mode, setMode] = useState<ProfileMode>('summary');
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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
    setAvatarError(null);
    setMode('edit');
  };

  const avatarErrorText = (code: AvatarNormalizationError['code']) => {
    if (code === 'unsupported_type') return t('profile.avatarUnsupportedType');
    if (code === 'source_too_large' || code === 'output_too_large') return t('profile.avatarTooLarge');
    return t('profile.avatarNormalizationFailed');
  };

  const handleAvatarSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isUploadingAvatar) return;
    if (!onUploadAvatar || !avatarUploadAvailable) {
      setAvatarError(t('profile.avatarOffline'));
      return;
    }
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const normalized = await normalizeAvatarFile(file);
      const localPreview = URL.createObjectURL(normalized);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return localPreview;
      });
      const result = await onUploadAvatar(normalized);
      if (!result.ok) {
        setAvatarError(t(`auth.error.${result.error.code}` as Parameters<typeof t>[0]));
        setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
        return;
      }
      setDraft((current) => ({ ...current, avatarUrl: result.data.avatarUrl }));
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    } catch (cause) {
      setAvatarError(cause instanceof AvatarNormalizationError ? avatarErrorText(cause.code) : t('profile.avatarNormalizationFailed'));
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    } finally {
      setIsUploadingAvatar(false);
    }
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
    const { avatarUrl: _uploadedAvatar, ...editableDraft } = draft;
    const result = await submitProfileDraft(onSave, {
      ...editableDraft,
      displayName: draft.displayName.trim() || userInfo.name || t('profile.athlete'),
      username: username || undefined
    });
    if (!result.shouldClose) { setError(result.error); return; }
    setError(null);
    setMode('summary');
  };

  if (mode === 'edit') {
    return (
      <div className="space-y-4">
        <header className="flex min-h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton
              variant="ghost"
              aria-label={t('common.cancel')}
              onClick={() => { setError(null); setAvatarError(null); setMode('summary'); }}
              className="-ml-1"
            >
              <X aria-hidden="true" className="size-5" />
            </IconButton>
            <h1 className="truncate text-lg font-extrabold text-text-primary outline-none">
              {t('profile.edit')}
            </h1>
          </div>
        </header>

        <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <ProfileAvatar displayName={draft.displayName || displayName} avatarUrl={previewUrl || draft.avatarUrl || profile.avatarUrl} className="size-20 text-xl shadow-accent" />
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('profile.avatarFileInput')} onChange={(event) => void handleAvatarSelection(event)} />
          <Button type="button" variant="secondary" size="sm" disabled={!avatarUploadAvailable || isUploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="min-h-11">
            <Camera aria-hidden="true" className="size-4" />
            {isUploadingAvatar ? t('profile.avatarUploading') : t('profile.changePhoto')}
          </Button>
          {!avatarUploadAvailable && <p className="text-xs text-text-muted">{t('profile.avatarOffline')}</p>}
          {avatarError && <p role="alert" className="max-w-sm text-xs font-semibold text-danger">{avatarError}</p>}
        </div>
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
          <Button type="button" variant="secondary" disabled={isUploadingAvatar} onClick={() => { setError(null); setAvatarError(null); setMode('summary'); }}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={isUploadingAvatar}>{t('common.save')}</Button>
        </div>
      </form>
    </div>);
  }

  return (
    <div className="space-y-5">
      <header className="flex min-h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <IconButton
              variant="ghost"
              aria-label={t('profile.close')}
              onClick={onClose}
              className="-ml-1"
            >
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          )}
          <h1 ref={titleRef} id="profile-screen-title" tabIndex={-1} className="truncate text-lg font-extrabold tracking-tight text-text-primary outline-none">
            {t('profile.title')}
          </h1>
        </div>
        <IconButton
          variant="secondary"
          aria-label={t('profile.edit')}
          onClick={openEdit}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </IconButton>
      </header>

      <div className="flex flex-col items-center text-center">
        <ProfileAvatar displayName={displayName} avatarUrl={profile.avatarUrl} className="size-20 text-xl shadow-accent" />
        <h3 className="mt-3 max-w-[calc(100%-3.25rem)] break-words text-lg font-extrabold tracking-tight text-text-primary sm:text-xl">{displayName}</h3>
        {profile.username && <p className="text-xs text-text-muted sm:text-sm">@{profile.username}</p>}
        <p className="mt-0.5 text-xs font-semibold text-text-secondary">
          {t('profile.athlete')}{age !== null ? ` · ${t('profile.years', { count: age })}` : ''}
        </p>
      </div>

      <AppCard compact className="grid grid-cols-3 divide-x divide-border-subtle text-center">
        {[
          [summary.totalWorkouts, t('profile.workouts')],
          [new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(displayWeight(summary.totalVolumeKg, preferences.units)), t('profile.volume', { unit: WEIGHT_UNIT_PRESETS[preferences.units].unit })],
          [summary.streak, t('profile.weeks')]
        ].map(([value, label]) => <div key={String(label)} className="min-w-0 px-1.5"><p className="truncate text-base font-extrabold tracking-tight tabular-nums text-text-primary">{value}</p><p className="mt-0.5 text-[10px] font-medium leading-tight text-text-muted">{label}</p></div>)}
      </AppCard>

      {summaryAccessory}

      <ProfileStrengthSection
        history={history}
        exercises={exercises}
        bodyweightKg={bodyweightKg}
        gender={profile.gender}
        bodyweightEntries={bodyweightEntries}
        onConfigureGender={onConfigureGender}
      />

      <section className="space-y-2" aria-labelledby="profile-records">
        <h4 id="profile-records" className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-text-primary"><Award aria-hidden="true" className="size-4 text-accent" />{t('profile.records')}</h4>
        {summary.records.length === 0 ? (
          <EmptyState compact icon={<UserRound className="size-5" />} title={t('profile.noRecords')} />
        ) : (
          <div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
            {summary.records.map((record) => (
              <div key={record.exerciseId} className="flex min-h-12 items-center justify-between gap-3 border-b border-border-subtle px-3 last:border-b-0">
                <span className="min-w-0 truncate text-xs font-bold text-text-primary">{record.name}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-accent">{formatDisplayWeight(record.est1Rm, preferences.units)}</span>
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
