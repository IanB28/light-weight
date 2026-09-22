import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Settings, UsersRound } from 'lucide-react';
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
      <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-page mb-5 flex min-h-14 items-center gap-2 border-b border-border-subtle bg-app/90 px-page py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-app/75">
        <IconButton
          variant="ghost"
          aria-label={panel === 'friends' ? t('profile.backToProfile') : t('profile.close')}
          onClick={panel === 'friends' ? () => setPanel('summary') : onClose}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 ref={titleRef} id="profile-screen-title" tabIndex={-1} className="truncate text-lg font-extrabold text-text-primary outline-none">{title}</h1>
          <p className="truncate text-[11px] font-medium text-text-muted">
            {panel === 'friends' ? t('profile.friendsDescription') : t('profile.description')}
          </p>
        </div>
        {panel === 'summary' && (
          <IconButton variant="secondary" aria-label={t('header.openSettings')} onClick={() => onOpenSettings('root')}>
            <Settings aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </header>

      {panel === 'friends' ? (
        friendsAvailable
          ? <FriendsPanel />
          : <p role="status" className="rounded-ui-xl border border-border-subtle bg-surface-input p-4 text-sm text-text-secondary">{t('profile.friendsOffline')}</p>
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
            summaryAccessory={isAuthenticated ? (
              <button
                type="button"
                disabled={!friendsAvailable}
                onClick={() => setPanel('friends')}
                className="flex min-h-14 w-full items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-accent">
                  <UsersRound aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-bold text-text-primary" aria-busy={friendsAvailable && friendCount === null}>
                  {friendsAvailable ? t('profile.friendSummary', { count: friendCount ?? '—' }) : t('profile.friendsOffline')}
                </span>
                <ChevronLeft aria-hidden="true" className="size-4 shrink-0 rotate-180 text-text-muted" />
              </button>
            ) : undefined}
          />
        </div>
      )}
    </section>
  );
}
