import type { FriendshipSummary, PublicUserSummary, Routine, RoutineShareSummary } from '@light-weight/domain';
import { API_BASE } from './auth-context.js';
import { requestJson } from './api-errors.js';

export interface UserSearchResult extends PublicUserSummary {
  relationship: 'none' | 'outgoing' | 'incoming' | 'friends';
  friendshipId?: string;
}

export const friendsApi = {
  list: () => requestJson<{ friendships: FriendshipSummary[] }>(`${API_BASE}/api/friends`),
  search: (query: string, signal?: AbortSignal) => requestJson<{ users: UserSearchResult[] }>(`${API_BASE}/api/friends/search?q=${encodeURIComponent(query)}`, { signal }),
  send: (userId: string) => requestJson(`${API_BASE}/api/friends/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }),
  accept: (id: string) => requestJson(`${API_BASE}/api/friends/${encodeURIComponent(id)}/accept`, { method: 'PATCH' }),
  remove: (id: string) => requestJson<void>(`${API_BASE}/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

export const routineSharesApi = {
  received: () => requestJson<{ shares: RoutineShareSummary[] }>(`${API_BASE}/api/routine-shares/received`),
  share: (routineId: string, recipientId: string) => requestJson(`${API_BASE}/api/routine-shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routineId, recipientId }) }),
  import: (id: string) => requestJson<{ routine: Routine }>(`${API_BASE}/api/routine-shares/${encodeURIComponent(id)}/import`, { method: 'POST' }),
  dismiss: (id: string) => requestJson<void>(`${API_BASE}/api/routine-shares/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
