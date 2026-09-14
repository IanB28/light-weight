import type { FriendshipSummary, PublicUserSummary, Routine, RoutineShareSummary } from '@light-weight/domain';
import { apiEndpoint } from './api-base.js';
import { requestJson } from './api-errors.js';

export interface UserSearchResult extends PublicUserSummary {
  relationship: 'none' | 'outgoing' | 'incoming' | 'friends';
  friendshipId?: string;
}

export const friendsApi = {
  list: () => requestJson<{ friendships: FriendshipSummary[] }>(apiEndpoint('/api/friends')),
  search: (query: string, signal?: AbortSignal) => requestJson<{ users: UserSearchResult[] }>(`${apiEndpoint('/api/friends/search')}?q=${encodeURIComponent(query)}`, { signal }),
  send: (userId: string) => requestJson(apiEndpoint('/api/friends/requests'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }),
  accept: (id: string) => requestJson(apiEndpoint(`/api/friends/${id}/accept`), { method: 'PATCH' }),
  remove: (id: string) => requestJson<void>(apiEndpoint(`/api/friends/${id}`), { method: 'DELETE' })
};

export const routineSharesApi = {
  received: () => requestJson<{ shares: RoutineShareSummary[] }>(apiEndpoint('/api/routine-shares/received')),
  share: (routineId: string, recipientId: string) => requestJson(apiEndpoint('/api/routine-shares'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routineId, recipientId }) }),
  import: (id: string) => requestJson<{ routine: Routine }>(apiEndpoint(`/api/routine-shares/${id}/import`), { method: 'POST' }),
  dismiss: (id: string) => requestJson<void>(apiEndpoint(`/api/routine-shares/${id}`), { method: 'DELETE' })
};
