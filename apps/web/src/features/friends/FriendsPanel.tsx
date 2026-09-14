import React, { useEffect, useRef, useState } from 'react';
import { Check, Search, UserMinus, UserPlus, UsersRound, X } from 'lucide-react';
import type { FriendshipSummary } from '@light-weight/domain';
import { friendsApi, type UserSearchResult } from '../../lib/social-api.js';
import { mapApiError } from '../../lib/api-errors.js';
import { useI18n, type TranslationKey } from '../../lib/i18n.js';
import { Button, EmptyState } from '../../components/ui/index.js';

function Avatar({ name, url }: { name: string; url?: string }) {
  return <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-accent-soft text-xs font-extrabold text-accent">{url ? <img src={url} alt="" className="size-full object-cover" /> : name.slice(0, 2).toUpperCase()}</span>;
}

export function FriendsPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendshipSummary[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = async () => {
    try { const response = await friendsApi.list(); setItems(response.friendships); setError(null); }
    catch (cause) { setError(`auth.error.${mapApiError(cause).code}` as TranslationKey); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    requestRef.current?.abort();
    if (query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController(); requestRef.current = controller;
    void friendsApi.search(query.trim(), controller.signal).then((response) => setResults(response.users)).catch((cause) => {
      if (mapApiError(cause).code !== 'aborted') setError(`auth.error.${mapApiError(cause).code}` as TranslationKey);
    });
    return () => controller.abort();
  }, [query]);

  const act = async (key: string, action: () => Promise<unknown>) => {
    if (busyId) return; setBusyId(key); setError(null);
    try { await action(); await load(); if (query.trim().length >= 2) setQuery(''); }
    catch (cause) { setError(`auth.error.${mapApiError(cause).code}` as TranslationKey); }
    finally { setBusyId(null); }
  };
  const incoming = items.filter((item) => item.direction === 'incoming');
  const outgoing = items.filter((item) => item.direction === 'outgoing');
  const friends = items.filter((item) => item.direction === 'friend');

  return <div className="space-y-5">
    <label className="relative block"><span className="sr-only">{t('friends.search')}</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('friends.search')} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25" /></label>
    {results.length > 0 && <section className="overflow-hidden rounded-ui-xl border border-border-subtle bg-surface" aria-label={t('friends.results')}>{results.map((user) => <div key={user.id} className="flex min-h-16 items-center gap-3 border-b border-border-subtle p-3 last:border-b-0"><Avatar name={user.displayName} url={user.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text-primary">{user.displayName}</p><p className="truncate text-xs text-text-muted">@{user.username}</p></div>{user.relationship === 'none' ? <Button size="sm" disabled={busyId === user.id} onClick={() => void act(user.id, () => friendsApi.send(user.id))}><UserPlus className="size-4" />{t('friends.add')}</Button> : <span className="text-xs font-semibold text-text-muted">{t(`friends.state.${user.relationship}` as TranslationKey)}</span>}</div>)}</section>}
    {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{t(error)}</p>}
    {incoming.length > 0 && <section className="space-y-2"><h3 className="text-xs font-extrabold uppercase tracking-wide text-text-muted">{t('friends.received')}</h3>{incoming.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface p-3"><Avatar name={item.user.displayName} url={item.user.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text-primary">{item.user.displayName}</p><p className="text-xs text-text-muted">@{item.user.username}</p></div><button disabled={busyId !== null} className="flex size-11 items-center justify-center rounded-ui-lg bg-accent text-accent-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" aria-label={t('friends.accept')} onClick={() => void act(item.id, () => friendsApi.accept(item.id))}><Check className="size-4" /></button><button disabled={busyId !== null} className="flex size-11 items-center justify-center rounded-ui-lg border border-border-subtle text-text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" aria-label={t('friends.reject')} onClick={() => void act(item.id, () => friendsApi.remove(item.id))}><X className="size-4" /></button></div>)}</section>}
    {outgoing.length > 0 && <section className="space-y-2"><h3 className="text-xs font-extrabold uppercase tracking-wide text-text-muted">{t('friends.sent')}</h3>{outgoing.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface p-3"><Avatar name={item.user.displayName} url={item.user.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text-primary">{item.user.displayName}</p><p className="text-xs text-text-muted">{t('friends.pending')}</p></div><button disabled={busyId !== null} className="flex size-11 items-center justify-center rounded-ui-lg border border-border-subtle text-text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" aria-label={t('friends.cancel')} onClick={() => void act(item.id, () => friendsApi.remove(item.id))}><X className="size-4" /></button></div>)}</section>}
    <section className="space-y-2"><h3 className="text-xs font-extrabold uppercase tracking-wide text-text-muted">{t('friends.title')}</h3>{!loading && friends.length === 0 ? <EmptyState compact icon={<UsersRound className="size-5" />} title={t('friends.empty')} /> : friends.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface p-3"><Avatar name={item.user.displayName} url={item.user.avatarUrl} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text-primary">{item.user.displayName}</p><p className="text-xs text-text-muted">@{item.user.username}</p></div><button disabled={busyId !== null} className="flex size-11 items-center justify-center rounded-ui-lg border border-border-subtle text-text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" aria-label={t('friends.remove')} onClick={() => void act(item.id, () => friendsApi.remove(item.id))}><UserMinus className="size-4" /></button></div>)}</section>
  </div>;
}
