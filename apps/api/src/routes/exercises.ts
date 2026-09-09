import { Router } from 'express';
import { db } from '../db/index.js';
import { exercises } from '../db/schema.js';
import { or, isNull, eq } from 'drizzle-orm';

export const exerciseRouter: Router = Router();

// GET /api/exercises?userId=...
exerciseRouter.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;

    // Retorna los ejercicios estándar (userId = null) más los creados por este usuario
    const condition = userId
      ? or(isNull(exercises.userId), eq(exercises.userId, userId))
      : isNull(exercises.userId);

    const list = await db.select().from(exercises).where(condition);
    res.json({ exercises: list });
  } catch (error: any) {
    console.error('[Exercises API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/exercises
exerciseRouter.post('/', async (req, res) => {
  try {
    const { id, userId, name, primaryMuscle, secondaryMuscles = [], category } = req.body;

    if (!id || !name || !primaryMuscle || !category) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const inserted = await db
      .insert(exercises)
      .values({
        id,
        userId: userId || null,
        name,
        primaryMuscle,
        secondaryMuscles,
        category,
        isCustom: true,
      })
      .returning();

    res.status(201).json({ exercise: inserted[0] });
  } catch (error: any) {
    console.error('[Create Exercise Error]', error);
    res.status(500).json({ error: error.message });
  }
});
