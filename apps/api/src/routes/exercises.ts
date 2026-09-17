import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { isNull } from 'drizzle-orm';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  isExerciseLoadingProfile,
  resolveExerciseLoadingProfile,
  type Exercise,
  type ExerciseCategory,
  type MuscleGroup
} from '@light-weight/domain';
import { db } from '../db/index.js';
import { exercises } from '../db/schema.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import { requireAuth, requireCsrf } from '../lib/auth-session.js';

export const exerciseRouter: Router = Router();
export type ExerciseRow = typeof exercises.$inferSelect;

export function toDomainExercise(row: ExerciseRow): Exercise {
  const candidate = {
    mechanism: row.loadMechanism,
    loadMode: row.loadMode,
    supportsKeyboard: row.supportsKeyboard,
    supportsPlates: row.supportsPlates,
    supportsExternalLoad: row.supportsExternalLoad,
    includeBarWeight: row.includeBarWeight,
    bodyweightFactor: typeof row.bodyweightFactor === 'number' && Number.isFinite(row.bodyweightFactor)
      ? row.bodyweightFactor
      : undefined
  };
  const base: Exercise = {
    id: row.id,
    name: row.name,
    category: row.category as ExerciseCategory,
    primaryMuscle: row.primaryMuscle as MuscleGroup,
    secondaryMuscles: row.secondaryMuscles as MuscleGroup[],
    isCustom: row.isCustom,
    loading: isExerciseLoadingProfile(candidate) ? candidate : undefined
  };
  return { ...base, loading: resolveExerciseLoadingProfile(base).profile };
}

// The standard catalog is public. Private custom exercises are hydrated by sync.
exerciseRouter.get('/', asyncRoute(async (_req, res) => {
  const list = await db.select().from(exercises).where(isNull(exercises.userId));
  res.json({ exercises: list.map(toDomainExercise) });
}));

exerciseRouter.post('/', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  const { name, primaryMuscle, secondaryMuscles = [], category, loading } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || typeof primaryMuscle !== 'string' || typeof category !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(secondaryMuscles) || secondaryMuscles.some((muscle) => typeof muscle !== 'string')) {
    throw new ApiError(422, 'VALIDATION_ERROR');
  }
  if (loading !== undefined && !isExerciseLoadingProfile(loading)) {
    throw new ApiError(422, 'INVALID_EXERCISE_LOADING_PROFILE');
  }
  const profile = loading ?? DEFAULT_EXERCISE_LOADING_PROFILE;
  const [inserted] = await db.insert(exercises).values({
    id: `custom-${randomUUID()}`,
    userId: req.auth!.userId,
    name: name.trim(),
    primaryMuscle,
    secondaryMuscles,
    category,
    loadMechanism: profile.mechanism,
    loadMode: profile.loadMode,
    supportsKeyboard: profile.supportsKeyboard,
    supportsPlates: profile.supportsPlates,
    supportsExternalLoad: profile.supportsExternalLoad,
    includeBarWeight: profile.includeBarWeight,
    bodyweightFactor: typeof profile.bodyweightFactor === 'number' && Number.isFinite(profile.bodyweightFactor)
      ? profile.bodyweightFactor
      : null,
    isCustom: true
  }).returning();
  res.status(201).json({ exercise: toDomainExercise(inserted) });
}));
