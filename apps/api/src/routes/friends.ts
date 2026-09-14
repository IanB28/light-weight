import { Router } from 'express';
import { and, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import type { FriendshipSummary, PublicUserSummary } from '@light-weight/domain';
import { db } from '../db/index.js';
import { friendships, users } from '../db/schema.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import { requireAuth, requireCsrf } from '../lib/auth-session.js';
import { isUuid } from '../lib/client-id.js';
import { assertCanSendFriendRequest, canAcceptFriendship, canManageFriendship } from '../lib/social-invariants.js';

export const friendsRouter: Router = Router();

function pair(first: string, second: string): [string, string] {
  return first.localeCompare(second) < 0 ? [first, second] : [second, first];
}

function toPublicUser(user: typeof users.$inferSelect): PublicUserSummary {
  return { id: user.id, username: user.username || '', displayName: user.displayName, avatarUrl: user.avatarUrl || undefined };
}

friendsRouter.use(requireAuth);

friendsRouter.get('/search', asyncRoute(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._]/g, '') : '';
  if (query.length < 2 || query.length > 30) return res.json({ users: [] });
  const matches = await db.select().from(users)
    .where(and(ne(users.id, req.auth!.userId), ilike(users.username, `${query}%`)))
    .limit(20);
  const ids = matches.map((user) => user.id);
  const relationships = ids.length ? await db.select().from(friendships).where(or(
    and(eq(friendships.userAId, req.auth!.userId), inArray(friendships.userBId, ids)),
    and(eq(friendships.userBId, req.auth!.userId), inArray(friendships.userAId, ids))
  )) : [];
  const byOther = new Map(relationships.map((friendship) => [
    friendship.userAId === req.auth!.userId ? friendship.userBId : friendship.userAId,
    friendship
  ]));
  res.json({ users: matches.map((user) => {
    const relationship = byOther.get(user.id);
    return {
      ...toPublicUser(user),
      relationship: !relationship ? 'none' : relationship.status === 'accepted' ? 'friends' : relationship.requesterId === req.auth!.userId ? 'outgoing' : 'incoming',
      friendshipId: relationship?.id
    };
  }) });
}));

friendsRouter.get('/', asyncRoute(async (req, res) => {
  const relationships = await db.select().from(friendships).where(or(
    eq(friendships.userAId, req.auth!.userId), eq(friendships.userBId, req.auth!.userId)
  ));
  const otherIds = relationships.map((item) => item.userAId === req.auth!.userId ? item.userBId : item.userAId);
  const otherUsers = otherIds.length ? await db.select().from(users).where(inArray(users.id, otherIds)) : [];
  const byId = new Map(otherUsers.map((user) => [user.id, user]));
  const items = relationships.flatMap((friendship): FriendshipSummary[] => {
    const otherId = friendship.userAId === req.auth!.userId ? friendship.userBId : friendship.userAId;
    const user = byId.get(otherId);
    if (!user || !user.username) return [];
    return [{
      id: friendship.id,
      status: friendship.status as 'pending' | 'accepted',
      direction: friendship.status === 'accepted' ? 'friend' : friendship.requesterId === req.auth!.userId ? 'outgoing' : 'incoming',
      user: toPublicUser(user),
      createdAt: friendship.createdAt.toISOString()
    }];
  });
  res.json({ friendships: items });
}));

friendsRouter.post('/requests', requireCsrf, asyncRoute(async (req, res) => {
  const recipientId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  if (!isUuid(recipientId)) throw new ApiError(422, 'VALIDATION_ERROR');
  assertCanSendFriendRequest(req.auth!.userId, recipientId);
  const [recipient] = await db.select({ id: users.id }).from(users).where(eq(users.id, recipientId)).limit(1);
  if (!recipient) throw new ApiError(404, 'USER_NOT_FOUND');
  const [userAId, userBId] = pair(req.auth!.userId, recipientId);
  const [existing] = await db.select().from(friendships)
    .where(and(eq(friendships.userAId, userAId), eq(friendships.userBId, userBId))).limit(1);
  assertCanSendFriendRequest(req.auth!.userId, recipientId, existing?.status);
  try {
    const [created] = await db.insert(friendships).values({ userAId, userBId, requesterId: req.auth!.userId }).returning();
    res.status(201).json({ friendship: created });
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') throw new ApiError(409, 'FRIEND_REQUEST_EXISTS');
    throw error;
  }
}));

friendsRouter.patch('/:id/accept', requireCsrf, asyncRoute(async (req, res) => {
  const friendshipId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isUuid(friendshipId)) throw new ApiError(422, 'VALIDATION_ERROR');
  const [friendship] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
  if (!friendship || !canManageFriendship(friendship, req.auth!.userId)) {
    throw new ApiError(404, 'FRIEND_REQUEST_NOT_FOUND');
  }
  if (!canAcceptFriendship(friendship, req.auth!.userId)) {
    throw new ApiError(403, 'FORBIDDEN');
  }
  const [updated] = await db.update(friendships).set({ status: 'accepted', updatedAt: new Date() })
    .where(and(eq(friendships.id, friendship.id), eq(friendships.status, 'pending'))).returning();
  res.json({ friendship: updated });
}));

friendsRouter.delete('/:id', requireCsrf, asyncRoute(async (req, res) => {
  const friendshipId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isUuid(friendshipId)) throw new ApiError(422, 'VALIDATION_ERROR');
  const [friendship] = await db.select().from(friendships).where(and(
    eq(friendships.id, friendshipId),
    or(eq(friendships.userAId, req.auth!.userId), eq(friendships.userBId, req.auth!.userId))
  )).limit(1);
  if (!friendship) throw new ApiError(404, 'FRIEND_REQUEST_NOT_FOUND');
  await db.delete(friendships).where(eq(friendships.id, friendship.id));
  res.status(204).end();
}));

export function normalizedFriendPair(first: string, second: string): [string, string] {
  return pair(first, second);
}
