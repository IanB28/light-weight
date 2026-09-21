import React, { createContext, useContext, useEffect, useState } from 'react';
import { cn } from '@light-weight/ui';
import { useI18n } from '../../lib/i18n.js';

export interface ProfileIdentity {
  displayName: string;
  avatarUrl?: string;
}

interface ProfileIdentityAction extends ProfileIdentity {
  onOpenProfile: () => void;
}

const ProfileIdentityContext = createContext<ProfileIdentityAction | null>(null);

export function getProfileInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'LW';
}

export function ProfileAvatar({
  displayName,
  avatarUrl,
  className
}: ProfileIdentity & { className?: string }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-accent-soft font-extrabold text-accent',
        className
      )}
    >
      {avatarUrl && !avatarFailed
        ? <img src={avatarUrl} alt="" className="size-full object-cover" onError={() => setAvatarFailed(true)} />
        : getProfileInitials(displayName)}
    </span>
  );
}

export function ProfileIdentityButton({ displayName, avatarUrl, onOpenProfile }: ProfileIdentityAction) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      aria-label={t('header.openProfile', { name: displayName })}
      title={t('header.profileTitle')}
      className="inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-input transition-[background-color,border-color,transform] duration-150 hover:border-border-active hover:bg-surface-active active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app motion-reduce:transition-none"
    >
      <ProfileAvatar displayName={displayName} avatarUrl={avatarUrl} className="size-8 text-[10px]" />
    </button>
  );
}

export function ProfileIdentityProvider({ value, children }: { value: ProfileIdentityAction; children: React.ReactNode }) {
  return <ProfileIdentityContext.Provider value={value}>{children}</ProfileIdentityContext.Provider>;
}

export function useProfileIdentityAction(): ProfileIdentityAction | null {
  return useContext(ProfileIdentityContext);
}
