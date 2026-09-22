import type { FriendshipSummary } from '@light-weight/domain';

/** Counts only confirmed mutual friendships; pending directions are intentionally excluded. */
export function countAcceptedFriends(friendships: FriendshipSummary[]): number {
  return friendships.filter((friendship) => (
    friendship.direction === 'friend' && friendship.status === 'accepted'
  )).length;
}
