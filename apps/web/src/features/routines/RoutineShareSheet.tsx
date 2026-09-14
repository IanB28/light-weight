import React, { useEffect, useState } from 'react';
import { Send, UserRound } from 'lucide-react';
import type { FriendshipSummary, Routine } from '@light-weight/domain';
import { BottomSheet, Button, EmptyState } from '../../components/ui/index.js';
import { friendsApi, routineSharesApi } from '../../lib/social-api.js';
import { mapApiError } from '../../lib/api-errors.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { syncWithCloud } from '../../lib/sync.js';

export function RoutineShareSheet({ routine, open, onClose }: { routine: Routine; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendshipSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    void friendsApi.list().then((response) => setFriends(response.friendships.filter((item) => item.direction === 'friend')))
      .catch((cause) => setMessage({ error: true, text: t(`auth.error.${mapApiError(cause).code}` as TranslationKey) }));
  }, [open, t]);
  const share = async (friend: FriendshipSummary) => {
    if (busyId) return; setBusyId(friend.user.id); setMessage(null);
    try {
      const synced = await syncWithCloud();
      if (!synced.ok) {
        setMessage({ error: true, text: t(`auth.error.${synced.error.code}` as TranslationKey) });
        return;
      }
      await routineSharesApi.share(routine.id, friend.user.id);
      setMessage({ text: t('sharing.shared') });
    }
    catch (cause) { setMessage({ error: true, text: t(`auth.error.${mapApiError(cause).code}` as TranslationKey) }); }
    finally { setBusyId(null); }
  };
  return <BottomSheet open={open} onClose={onClose} title={t('sharing.title')} description={routine.name}>
    <div className="space-y-3">
      {friends.length === 0 ? <EmptyState compact icon={<UserRound className="size-5" />} title={t('sharing.noFriends')} /> : friends.map((friend) => <div key={friend.id} className="flex min-h-16 items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface p-3"><span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">{friend.user.displayName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text-primary">{friend.user.displayName}</p><p className="truncate text-xs text-text-muted">@{friend.user.username}</p></div><Button size="sm" disabled={busyId === friend.user.id} onClick={() => void share(friend)}><Send className="size-4" />{t('sharing.share')}</Button></div>)}
      {message && <p role={message.error ? 'alert' : 'status'} className={`rounded-ui-md border p-3 text-xs font-semibold ${message.error ? 'border-danger/30 bg-danger-soft text-danger' : 'border-success/30 bg-success/10 text-success'}`}>{message.text}</p>}
    </div>
  </BottomSheet>;
}
