import type { PublicUserSummary } from '@light-weight/domain';
import { ApiError } from './api-error.js';

export interface FriendshipIdentity {
  userAId: string;
  userBId: string;
  requesterId: string;
  status: string;
}

export function assertCanSendFriendRequest(actorId: string, recipientId: string, existingStatus?: string): void {
  if (actorId === recipientId) throw new ApiError(409, 'CANNOT_FRIEND_SELF');
  if (existingStatus === 'accepted') throw new ApiError(409, 'ALREADY_FRIENDS');
  if (existingStatus) throw new ApiError(409, 'FRIEND_REQUEST_EXISTS');
}

export function canManageFriendship(friendship: FriendshipIdentity, actorId: string): boolean {
  return friendship.userAId === actorId || friendship.userBId === actorId;
}

export function canAcceptFriendship(friendship: FriendshipIdentity, actorId: string): boolean {
  return friendship.status === 'pending' && canManageFriendship(friendship, actorId) && friendship.requesterId !== actorId;
}

export function assertCanShareRoutine(input: {
  ownerId: string;
  actorId: string;
  recipientId: string;
  areFriends: boolean;
}): void {
  if (input.ownerId !== input.actorId) throw new ApiError(404, 'ROUTINE_NOT_OWNED');
  if (input.recipientId === input.actorId) throw new ApiError(409, 'CANNOT_SHARE_WITH_SELF');
  if (!input.areFriends) throw new ApiError(403, 'NOT_FRIENDS');
}

export function assertRoutineHasNoCustomExercises(hasCustomExercises: boolean): void {
  if (hasCustomExercises) throw new ApiError(422, 'ROUTINE_HAS_CUSTOM_EXERCISES');
}

export function cloneRoutineSnapshot<T extends { routineName: string; routineDescription: string | null; exerciseIds: string[] }>(
  share: T,
  recipientId: string,
  id: string,
  origin?: { type: 'shared'; sharedBy: PublicUserSummary; shareId?: string }
) {
  return {
    id,
    userId: recipientId,
    name: share.routineName,
    description: share.routineDescription,
    exerciseIds: [...share.exerciseIds],
    ...(origin ? { origin } : {})
  };
}
