import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, LogOut, Settings, UsersRound } from 'lucide-react';
import type { BodyweightEntry, Exercise, WorkoutSession } from '@light-weight/domain';
import type { AuthStatus } from '../../lib/auth-session-state.js';
import type { UserInfo, UserProfile } from '../../lib/storage.js';
import { useI18n } from '../../lib/i18n.js';
import { Button, IconButton } from '../../components/ui/index.js';
import { FriendsPanel } from '../friends/FriendsPanel.js';
import type { SettingsTarget } from './profile-surface-state.js';
import { ProfileView } from './ProfileView.js';

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
  onClose: () => void;
  onOpenSettings: (target?: SettingsTarget) => void;
  onLogout: () => void;
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
  onClose,
  onOpenSettings,
  onLogout
}: ProfileScreenProps) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<ProfilePanel>('summary');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const friendsAvailable = authStatus === 'authenticated';
  const title = panel === 'friends' ? t('friends.title') : t('profile.title');

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [panel]);

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
          />

          {isAuthenticated && (
            <div className="space-y-3">
              <section className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface" aria-labelledby="profile-social-title">
                <div className="border-b border-border-subtle px-4 py-3">
                  <h2 id="profile-social-title" className="text-xs font-extrabold uppercase tracking-wide text-text-muted">{t('profile.social')}</h2>
                </div>
                <button
                  type="button"
                  disabled={!friendsAvailable}
                  onClick={() => setPanel('friends')}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-accent">
                    <UsersRound aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-text-primary">{t('friends.title')}</span>
                    <span className="block text-xs text-text-muted">{friendsAvailable ? t('profile.friendsDescription') : t('profile.friendsOffline')}</span>
                  </span>
                  <ChevronLeft aria-hidden="true" className="size-4 rotate-180 text-text-muted" />
                </button>
              </section>

              <section className="space-y-3 rounded-ui-xl border border-border-subtle bg-surface p-4" aria-labelledby="profile-account-title">
                <div>
                  <h2 id="profile-account-title" className="text-xs font-extrabold uppercase tracking-wide text-text-muted">{t('profile.account')}</h2>
                  <p className="mt-1 text-xs text-text-secondary">{t('profile.accountDescription')}</p>
                </div>
                <Button variant="danger" className="w-full" onClick={onLogout}>
                  <LogOut aria-hidden="true" className="size-4" />
                  {t('auth.logout')}
                </Button>
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
