import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PublicUserSummary, RoutineShareSummary } from '@light-weight/domain';
import { db } from '../db/index.js';
import { exercises, friendships, routines, routineShares, users } from '../db/schema.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import { requireAuth, requireCsrf } from '../lib/auth-session.js';
import { isUuid, toDatabaseUuid } from '../lib/client-id.js';
import { assertCanShareRoutine, assertRoutineHasNoCustomExercises, cloneRoutineSnapshot } from '../lib/social-invariants.js';

export const routineSharesRouter: Router = Router();
routineSharesRouter.use(requireAuth);

function publicUser(user: typeof users.$inferSelect): PublicUserSummary {
  return { id: user.id, username: user.username || '', displayName: user.displayName, avatarUrl: user.avatarUrl || undefined };
}

async function areFriends(first: string, second: string): Promise<boolean> {
  const [userAId, userBId] = first.localeCompare(second) < 0 ? [first, second] : [second, first];
  const [friendship] = await db.select({ id: friendships.id }).from(friendships).where(and(
    eq(friendships.userAId, userAId), eq(friendships.userBId, userBId), eq(friendships.status, 'accepted')
  )).limit(1);
  return Boolean(friendship);
}

routineSharesRouter.get('/received', asyncRoute(async (req, res) => {
  const shares = await db.select().from(routineShares)
    .where(and(eq(routineShares.recipientId, req.auth!.userId), eq(routineShares.status, 'pending')));
  const senderIds = [...new Set(shares.map((share) => share.senderId))];
  const senders = senderIds.length ? await db.select().from(users).where(inArray(users.id, senderIds)) : [];
  const senderById = new Map(senders.map((sender) => [sender.id, sender]));
  const result = shares.flatMap((share): RoutineShareSummary[] => {
    const sender = senderById.get(share.senderId);
    if (!sender || !sender.username) return [];
    return [{
      id: share.id,
      sourceRoutineId: share.sourceRoutineId || undefined,
      sender: publicUser(sender),
      routineName: share.routineName,
      routineDescription: share.routineDescription || undefined,
      exerciseIds: share.exerciseIds,
      status: share.status as 'pending',
      createdAt: share.createdAt.toISOString()
    }];
  });
  res.json({ shares: result });
}));

routineSharesRouter.post('/', requireCsrf, asyncRoute(async (req, res) => {
  const rawRoutineId = typeof req.body?.routineId === 'string' ? req.body.routineId : '';
  const recipientId = typeof req.body?.recipientId === 'string' ? req.body.recipientId : '';
  if (!rawRoutineId || !isUuid(recipientId)) throw new ApiError(422, 'VALIDATION_ERROR');
  const routineId = toDatabaseUuid(rawRoutineId);
  const [routine] = await db.select().from(routines).where(and(
    eq(routines.id, routineId), eq(routines.userId, req.auth!.userId)
  )).limit(1);
  if (!routine) throw new ApiError(404, 'ROUTINE_NOT_OWNED');
  // A share only references catalog exercises which the server can prove are
  // public. Local-only, private, custom and unknown IDs are all rejected:
  // otherwise the recipient would import a broken routine.
  if (routine.exerciseIds.length) {
    const uniqueIds = [...new Set(routine.exerciseIds)];
    const resolved = await db.select({
      id: exercises.id,
      userId: exercises.userId,
      isCustom: exercises.isCustom
    }).from(exercises).where(inArray(exercises.id, uniqueIds));
    const allPublic = resolved.length === uniqueIds.length
      && resolved.every((exercise) => exercise.userId === null && !exercise.isCustom);
    assertRoutineHasNoCustomExercises(!allPublic);
  }
  const [recipient] = await db.select({ id: users.id }).from(users).where(eq(users.id, recipientId)).limit(1);
  if (!recipient) throw new ApiError(404, 'USER_NOT_FOUND');
  assertCanShareRoutine({ ownerId: routine.userId, actorId: req.auth!.userId, recipientId, areFriends: await areFriends(req.auth!.userId, recipientId) });
  const [created] = await db.insert(routineShares).values({
    sourceRoutineId: routine.id,
    senderId: req.auth!.userId,
    recipientId,
    routineName: routine.name,
    routineDescription: routine.description,
    exerciseIds: routine.exerciseIds
  }).returning();
  res.status(201).json({ share: created });
}));

routineSharesRouter.post('/:id/import', requireCsrf, asyncRoute(async (req, res) => {
  const shareId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isUuid(shareId)) throw new ApiError(422, 'VALIDATION_ERROR');
  const result = await db.transaction(async (tx) => {
    const [share] = await tx.select().from(routineShares).where(and(
      eq(routineShares.id, shareId),
      eq(routineShares.recipientId, req.auth!.userId)
    )).for('update').limit(1);
    if (!share) throw new ApiError(404, 'ROUTINE_SHARE_NOT_FOUND');
    if (share.status === 'dismissed') throw new ApiError(409, 'ROUTINE_SHARE_DISMISSED');
    if (share.status === 'imported' && share.importedRoutineId) {
      const [existingClone] = await tx.select().from(routines).where(and(
        eq(routines.id, share.importedRoutineId),
        eq(routines.userId, req.auth!.userId)
      )).limit(1);
      if (!existingClone) throw new ApiError(404, 'ROUTINE_SHARE_NOT_FOUND');
      return { routine: existingClone, imported: true };
    }
    if (share.status !== 'pending') throw new ApiError(409, 'ROUTINE_SHARE_DISMISSED');
    const [sender] = await tx.select().from(users).where(eq(users.id, share.senderId)).limit(1);
    if (!sender) throw new ApiError(404, 'USER_NOT_FOUND');
    const [clone] = await tx.insert(routines).values(cloneRoutineSnapshot(
      share,
      req.auth!.userId,
      randomUUID(),
      { type: 'shared', sharedBy: publicUser(sender), shareId: share.id }
    )).returning();
    await tx.update(routineShares).set({ status: 'imported', importedRoutineId: clone.id, importedAt: new Date() })
      .where(and(eq(routineShares.id, share.id), eq(routineShares.recipientId, req.auth!.userId)));
    return { routine: clone, imported: false };
  });
  res.status(result.imported ? 200 : 201).json({ routine: result.routine });
}));

routineSharesRouter.delete('/:id', requireCsrf, asyncRoute(async (req, res) => {
  const shareId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isUuid(shareId)) throw new ApiError(422, 'VALIDATION_ERROR');
  const [updated] = await db.update(routineShares).set({ status: 'dismissed' }).where(and(
    eq(routineShares.id, shareId),
    eq(routineShares.recipientId, req.auth!.userId),
    eq(routineShares.status, 'pending')
  )).returning();
  if (!updated) throw new ApiError(404, 'ROUTINE_SHARE_NOT_FOUND');
  res.status(204).end();
}));

/** Pure invariant used by tests and non-HTTP adapters. */
export function canMutateRoutine(ownerId: string, actorId: string): boolean {
  return ownerId === actorId;
}
