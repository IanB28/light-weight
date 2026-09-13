import { Router } from 'express';
import { db } from '../db/index.js';
import { exercises } from '../db/schema.js';
import { or, isNull, eq } from 'drizzle-orm';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  isExerciseLoadingProfile,
  resolveExerciseLoadingProfile,
  type Exercise,
  type ExerciseCategory,
  type MuscleGroup
} from '@light-weight/domain';

export const exerciseRouter: Router = Router();

type ExerciseRow = typeof exercises.$inferSelect;

function toDomainExercise(row: ExerciseRow): Exercise {
  const {
    loadMechanism,
    loadMode,
    supportsKeyboard,
    supportsPlates,
    supportsExternalLoad,
    includeBarWeight,
    ...rest
  } = row;
  const candidate = {
    mechanism: loadMechanism,
    loadMode,
    supportsKeyboard,
    supportsPlates,
    supportsExternalLoad,
    includeBarWeight
  };
  const base: Exercise = {
    id: rest.id,
    name: rest.name,
    category: rest.category as ExerciseCategory,
    primaryMuscle: rest.primaryMuscle as MuscleGroup,
    secondaryMuscles: rest.secondaryMuscles as MuscleGroup[],
    isCustom: rest.isCustom,
    loading: isExerciseLoadingProfile(candidate) ? candidate : undefined
  };
  const response = {
    ...base,
    userId: rest.userId,
    createdAt: rest.createdAt,
    loading: resolveExerciseLoadingProfile(base).profile
  };
  return response;
}

// GET /api/exercises?userId=...
exerciseRouter.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;

    // Retorna los ejercicios estándar (userId = null) más los creados por este usuario
    const condition = userId
      ? or(isNull(exercises.userId), eq(exercises.userId, userId))
      : isNull(exercises.userId);

    const list = await db.select().from(exercises).where(condition);
    res.json({ exercises: list.map(toDomainExercise) });
  } catch (error: any) {
    console.error('[Exercises API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/exercises
exerciseRouter.post('/', async (req, res) => {
  try {
    const { id, userId, name, primaryMuscle, secondaryMuscles = [], category, loading } = req.body;

    if (!id || !name || !primaryMuscle || !category) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (loading !== undefined && !isExerciseLoadingProfile(loading)) {
      return res.status(422).json({ error: 'INVALID_EXERCISE_LOADING_PROFILE' });
    }
    const loadingProfile = loading ?? DEFAULT_EXERCISE_LOADING_PROFILE;

    const inserted = await db
      .insert(exercises)
      .values({
        id,
        userId: userId || null,
        name,
        primaryMuscle,
        secondaryMuscles,
        category,
        loadMechanism: loadingProfile.mechanism,
        loadMode: loadingProfile.loadMode,
        supportsKeyboard: loadingProfile.supportsKeyboard,
        supportsPlates: loadingProfile.supportsPlates,
        supportsExternalLoad: loadingProfile.supportsExternalLoad,
        includeBarWeight: loadingProfile.includeBarWeight,
        isCustom: true,
      })
      .returning();

    res.status(201).json({ exercise: toDomainExercise(inserted[0]) });
  } catch (error: any) {
    console.error('[Create Exercise Error]', error);
    res.status(500).json({ error: error.message });
  }
});
