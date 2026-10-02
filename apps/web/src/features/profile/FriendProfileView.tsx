import React, { useEffect, useState } from 'react';
import { ChevronLeft, Shield, Trophy, UserRound } from 'lucide-react';
import type { ApiError } from '../../lib/api-errors.js';
import { mapApiError } from '../../lib/api-errors.js';
import type { FriendProfileProjection, PublicUserSummary } from '@light-weight/domain';
import { friendsApi } from '../../lib/social-api.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { findExerciseById } from '../../lib/exercises.js';
import { AppCard, EmptyState, ErrorState, IconButton } from '../../components/ui/index.js';
import { StrengthRankBadge } from '../../components/StrengthRankBadge.js';
import { ProfileAvatar } from './ProfileIdentityButton.js';
import { ProfilePrRow } from './ProfilePrRow.js';
import { formatPublicFeaturedPrLoad } from './featured-pr-presentation.js';

interface FriendProfileViewProps {
  friend: PublicUserSummary;
  onBack: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
}

type FriendProfileState =
  | { status: 'loading' }
  | { status: 'success'; profile: FriendProfileProjection }
  | { status: 'error'; error: ApiError };

export type FriendProfileFailureKind = 'unavailable' | 'auth' | 'retryable';

export function classifyFriendProfileError(error: ApiError): FriendProfileFailureKind {
  if (['not_found', 'forbidden', 'not_friends', 'user_not_found'].includes(error.code)) return 'unavailable';
  if (['unauthorized', 'auth_required'].includes(error.code)) return 'auth';
  return 'retryable';
}

function FriendProfileHeader({ onBack, titleRef }: Pick<FriendProfileViewProps, 'onBack' | 'titleRef'>) {
  const { t } = useI18n();
  return (
    <header className="flex min-h-12 items-center gap-2">
      <IconButton variant="ghost" aria-label={t('friends.backToFriends')} onClick={onBack} className="-ml-1">
        <ChevronLeft aria-hidden="true" className="size-5" />
      </IconButton>
      <h1 ref={titleRef} id="profile-screen-title" tabIndex={-1} className="truncate text-[clamp(1.5rem,6.5vw,1.95rem)] font-extrabold leading-tight tracking-tight text-text-primary outline-none">
        {t('friends.profileTitle')}
      </h1>
    </header>
  );
}

export function FriendProfileContent({ profile }: { profile: FriendProfileProjection }) {
  const { preferences } = usePreferences();
  const { t } = useI18n();

  return (
    <div data-testid="friend-profile" className="space-y-5">
      <section className="flex flex-col items-center px-3 pb-1 pt-2 text-center" aria-label={profile.user.displayName}>
        <ProfileAvatar displayName={profile.user.displayName} avatarUrl={profile.user.avatarUrl} className="size-24 text-xl shadow-accent sm:size-28 sm:text-2xl" />
        <h2 className="mt-3 max-w-full break-words text-lg font-extrabold tracking-tight text-text-primary sm:text-xl">{profile.user.displayName}</h2>
        <p className="mt-0.5 max-w-full truncate text-sm font-medium text-text-muted">@{profile.user.username}</p>
      </section>

      <AppCard compact className="grid grid-cols-2 divide-x divide-border-subtle text-center">
        <div className="min-w-0 px-2 py-1">
          <p className="text-xl font-extrabold tabular-nums text-text-primary">{profile.stats.totalWorkouts}</p>
          <p className="text-xs font-medium text-text-muted">{t('profile.workouts')}</p>
        </div>
        <div className="min-w-0 px-2 py-1">
          <p className="text-xl font-extrabold tabular-nums text-text-primary">{profile.stats.weeklyStreak}</p>
          <p className="text-xs font-medium text-text-muted">{t('profile.weeks')}</p>
        </div>
      </AppCard>

      <section className="space-y-2" aria-labelledby="friend-strength-rank">
        <h3 id="friend-strength-rank" className="text-sm font-extrabold tracking-tight text-text-primary">{t('friends.strengthRank')}</h3>
        <AppCard compact className="flex min-h-24 items-center gap-4 overflow-visible">
          {profile.strengthRank ? (
            <>
              <StrengthRankBadge rank={profile.strengthRank} size="lg" showGlow />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('profile.overall')}</p>
                <p className="truncate text-lg font-extrabold text-text-primary">{t(`ranks.${profile.strengthRank}` as TranslationKey)}</p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-input text-text-muted"><Shield aria-hidden="true" className="size-5" /></span>
              <p className="text-sm font-semibold text-text-muted">{t('friends.strengthUnavailable')}</p>
            </>
          )}
        </AppCard>
      </section>

      <section className="space-y-2" aria-labelledby="friend-featured-records">
        <h3 id="friend-featured-records" className="flex min-h-10 items-center gap-2 text-sm font-extrabold tracking-tight text-text-primary"><Trophy aria-hidden="true" className="size-4 text-accent" />{t('friends.featuredRecords')}</h3>
        {profile.featuredPrs.length === 0 ? (
          <EmptyState compact icon={<UserRound className="size-5" />} title={t('friends.noRecords')} />
        ) : (
          <div className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface">
            {profile.featuredPrs.map((record) => (
              <div key={record.slot} className="border-b border-border-subtle last:border-b-0">
                <ProfilePrRow
                  exercise={findExerciseById(record.exercise.id)}
                  name={record.exercise.name}
                  rank={record.strengthRank}
                  repCount={record.available ? record.reps : undefined}
                  displayLoad={formatPublicFeaturedPrLoad(record.load, preferences.units)}
                />
                {!record.available && <p className="-mt-2 pb-2 pl-[4.15rem] text-[11px] font-semibold text-text-muted">{t('profile.featuredUnavailable')}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function FriendProfileView({ friend, onBack, titleRef }: FriendProfileViewProps) {
  const { t } = useI18n();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<FriendProfileState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void friendsApi.profile(friend.id, controller.signal).then((profile) => {
      if (!controller.signal.aborted) setState({ status: 'success', profile });
    }).catch((cause) => {
      if (!controller.signal.aborted) setState({ status: 'error', error: mapApiError(cause) });
    });
    return () => controller.abort();
  }, [friend.id, retryKey]);

  const failureKind = state.status === 'error' ? classifyFriendProfileError(state.error) : null;

  return (
    <div className="space-y-5">
      <FriendProfileHeader onBack={onBack} titleRef={titleRef} />
      {state.status === 'loading' && (
        <div role="status" aria-label={t('friends.profileLoading')} className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-3"><ProfileAvatar displayName={friend.displayName} avatarUrl={friend.avatarUrl} className="size-24 text-xl opacity-70" /><div className="h-5 w-32 animate-pulse rounded-full bg-surface-active" /><div className="h-3 w-20 animate-pulse rounded-full bg-surface-active" /></div>
          <div className="h-24 animate-pulse rounded-ui-xl border border-border-subtle bg-surface" />
          <div className="h-28 animate-pulse rounded-ui-xl border border-border-subtle bg-surface" />
        </div>
      )}
      {state.status === 'success' && <FriendProfileContent profile={state.profile} />}
      {state.status === 'error' && (
        <ErrorState
          title={failureKind === 'unavailable' ? t('friends.profileUnavailable') : failureKind === 'auth' ? t('auth.error.unauthorized') : t('friends.profileLoadError')}
          description={failureKind === 'unavailable' ? t('friends.profileUnavailableDescription') : failureKind === 'auth' ? undefined : t('friends.profileLoadErrorDescription')}
          actionLabel={state.error.retryable ? t('friends.retryProfile') : undefined}
          onAction={state.error.retryable ? () => setRetryKey((value) => value + 1) : undefined}
        />
      )}
    </div>
  );
}
