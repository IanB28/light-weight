import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import {
  isFeaturedPrSelection,
  type FeaturedPrSelection
} from '@light-weight/domain';
import { db } from '../db/index.js';
import { exercises, profileFeaturedPrs } from '../db/schema.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import { requireAuth, requireCsrf } from '../lib/auth-session.js';

export const profileRouter: Router = Router();

function parseSelections(value: unknown): FeaturedPrSelection[] {
  if (!Array.isArray(value) || value.length > 3) throw new ApiError(422, 'INVALID_FEATURED_PRS');
  const selections = value.map((item) => {
    if (!isFeaturedPrSelection(item)) throw new ApiError(422, 'INVALID_FEATURED_PRS');
    const exerciseId = item.exerciseId.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(exerciseId)) {
      throw new ApiError(422, 'INVALID_FEATURED_PRS');
    }
    return { slot: item.slot, exerciseId, repCount: item.repCount };
  });
  if (new Set(selections.map((item) => item.slot)).size !== selections.length) {
    throw new ApiError(422, 'DUPLICATE_FEATURED_PR_SLOT');
  }
  if (new Set(selections.map((item) => item.exerciseId)).size !== selections.length) {
    throw new ApiError(422, 'DUPLICATE_FEATURED_PR_EXERCISE');
  }
  return selections.sort((left, right) => left.slot - right.slot);
}

profileRouter.get('/featured-prs', requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select({
    slot: profileFeaturedPrs.slot,
    exerciseId: profileFeaturedPrs.exerciseId,
    repCount: profileFeaturedPrs.repCount
  }).from(profileFeaturedPrs)
    .where(eq(profileFeaturedPrs.userId, req.auth!.userId))
    .orderBy(profileFeaturedPrs.slot);
  res.json({ selections: rows });
}));

profileRouter.put('/featured-prs', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  const selections = parseSelections(req.body?.selections);
  if (selections.length) {
    const exerciseIds = selections.map((item) => item.exerciseId);
    const rows = await db.select({ id: exercises.id, userId: exercises.userId })
      .from(exercises)
      .where(inArray(exercises.id, exerciseIds));
    const allowed = new Set(rows
      .filter((row) => row.userId === null || row.userId === req.auth!.userId)
      .map((row) => row.id));
    if (allowed.size !== exerciseIds.length || exerciseIds.some((id) => !allowed.has(id))) {
      throw new ApiError(403, 'FEATURED_PR_EXERCISE_FORBIDDEN');
    }
  }

  const saved = await db.transaction(async (tx) => {
    await tx.delete(profileFeaturedPrs).where(eq(profileFeaturedPrs.userId, req.auth!.userId));
    if (!selections.length) return [];
    return tx.insert(profileFeaturedPrs).values(selections.map((selection) => ({
      userId: req.auth!.userId,
      slot: selection.slot,
      exerciseId: selection.exerciseId,
      repCount: selection.repCount
    }))).returning({
      slot: profileFeaturedPrs.slot,
      exerciseId: profileFeaturedPrs.exerciseId,
      repCount: profileFeaturedPrs.repCount
    });
  });

  res.json({ selections: [...saved].sort((left, right) => left.slot - right.slot) });
}));

export const featuredPrValidation = { parseSelections };
