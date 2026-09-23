import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, UsersRound, X } from 'lucide-react';
import type { BodyweightEntry, Exercise, WorkoutSession } from '@light-weight/domain';
import type { AuthStatus } from '../../lib/auth-session-state.js';
import type { AuthUser } from '@light-weight/domain';
import type { OperationResult } from '../../lib/api-errors.js';
import type { UserInfo, UserProfile } from '../../lib/storage.js';
import { useI18n } from '../../lib/i18n.js';
import { IconButton } from '../../components/ui/index.js';
import { FriendsPanel } from '../friends/FriendsPanel.js';
import { friendsApi } from '../../lib/social-api.js';
import type { SettingsTarget } from './profile-surface-state.js';
import { ProfileView } from './ProfileView.js';
import { countAcceptedFriends } from './profile-friends.js';

type ProfilePanel = 'summary' | 'friends';

interface ProfileScreenProps {
  profile: UserProfile;
  userInfo: UserInfo;
  history: WorkoutSession[];
  exercises: Exercise[];
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  bodyweightKg?: number | null;
  bodyweightEntries?: BodyweightEntry[];
  onSave: (profile: UserProfile) => void | string | Promise<void | string>;
  onUploadAvatar: (avatar: Blob) => Promise<OperationResult<AuthUser>>;
  avatarUploadAvailable: boolean;
  onClose: () => void;
  onOpenSettings: (target?: SettingsTarget) => void;
}

export function ProfileScreen({
  profile,
  userInfo,
  history,
  exercises,
  authStatus,
  isAuthenticated,
  bodyweightKg,
  bodyweightEntries,
  onSave,
  onUploadAvatar,
  avatarUploadAvailable,
  onClose,
  onOpenSettings
}: ProfileScreenProps) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<ProfilePanel>('summary');
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const friendsAvailable = authStatus === 'authenticated';
  const title = panel === 'friends' ? t('friends.title') : t('profile.title');

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [panel]);

  useEffect(() => {
    if (!isAuthenticated || !friendsAvailable || panel !== 'summary') return;
    let disposed = false;
    void friendsApi.list().then(({ friendships }) => {
      if (!disposed) setFriendCount(countAcceptedFriends(friendships));
    }).catch(() => {
      if (!disposed) setFriendCount(null);
    });
    return () => { disposed = true; };
  }, [friendsAvailable, isAuthenticated, panel]);

  return (
    <section className="min-w-0 pb-2" aria-labelledby="profile-screen-title">
      {panel === 'friends' ? (
        <div className="space-y-5">
          <header className="flex min-h-12 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconButton
                variant="ghost"
                aria-label={t('profile.backToProfile')}
                onClick={() => setPanel('summary')}
                className="-ml-1"
              >
                <X aria-hidden="true" className="size-5" />
              </IconButton>
              <h1 ref={titleRef} id="profile-screen-title" tabIndex={-1} className="truncate text-lg font-extrabold text-text-primary outline-none">{title}</h1>
            </div>
          </header>

          {friendsAvailable
            ? <FriendsPanel />
            : <p role="status" className="rounded-ui-xl border border-border-subtle bg-surface-input p-4 text-sm text-text-secondary">{t('profile.friendsOffline')}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {authStatus === 'offline' && (
            <p role="status" className="rounded-ui-xl border border-border-subtle bg-surface-input p-3 text-xs font-medium text-text-secondary">
              {t('profile.offlineAvailable')}
            </p>
          )}

          <ProfileView
            profile={profile}
            userInfo={userInfo}
            history={history}
            exercises={exercises}
            bodyweightKg={bodyweightKg}
            bodyweightEntries={bodyweightEntries}
            onSave={onSave}
            onUploadAvatar={onUploadAvatar}
            avatarUploadAvailable={avatarUploadAvailable}
            onConfigureGender={() => onOpenSettings('gender')}
            onClose={onClose}
            titleRef={titleRef}
            summaryAccessory={isAuthenticated ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={!friendsAvailable}
                  onClick={() => setPanel('friends')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-subtle bg-surface-input px-3.5 py-2 text-sm font-bold text-text-primary transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UsersRound aria-hidden="true" className="size-4 shrink-0 text-accent" />
                  <span aria-busy={friendsAvailable && friendCount === null}>
                    {friendsAvailable ? t('profile.friendSummary', { count: friendCount ?? '—' }) : t('profile.friendsOffline')}
                  </span>
                  <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0 rotate-180 text-text-muted" />
                </button>
              </div>
            ) : undefined}
          />
        </div>
      )}
    </section>
  );
}
