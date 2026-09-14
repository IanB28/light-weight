import { Router } from 'express';
import { db } from '../db/index.js';
import {
  workoutSessions,
  loggedSets,
  personalRecords,
  bodyweightLogs,
  userProfiles,
  exercises,
  routines,
  users
} from '../db/schema.js';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  estimateOneRm,
  shouldCountForPersonalRecord,
  shouldCountForVolume
} from '@light-weight/domain';
import { and, eq, desc } from 'drizzle-orm';
import {
  hydrateSyncedSet,
  normalizeIncomingSyncSessions,
  SyncValidationError
} from '../lib/sync-mappers.js';
import { ApiError, asyncRoute } from '../lib/api-error.js';
import { requireAuth, requireCsrf, toAuthUser } from '../lib/auth-session.js';
import { toDatabaseUuid } from '../lib/client-id.js';

export const syncRouter: Router = Router();

// POST /api/sync - Sincronización en lote de entrenamientos (Offline-First)
syncRouter.post('/', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
  try {
    const {
      sessions: rawSessions = [],
      bodyweightLogs: bLogs = [],
      routines: incomingRoutines = []
    } = req.body || {};
    const userId = req.auth!.userId;
    // Validate and normalize canonical set semantics before performing any write.
    const sessions = normalizeIncomingSyncSessions(rawSessions);

    const syncedSessionIds: string[] = [];

    // 1. Guardar pesajes de forma idempotente por usuario + fecha.
    const existingBodyweightLogs = await db
      .select()
      .from(bodyweightLogs)
      .where(eq(bodyweightLogs.userId, userId));
    const existingBodyweightByDate = new Map(
      existingBodyweightLogs.map((entry) => [entry.loggedAt.toISOString(), entry])
    );
    const validIncomingBodyweight = (Array.isArray(bLogs) ? bLogs : []).filter(
      (entry: unknown): entry is { loggedAt: string; weightKg: number } => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as { loggedAt?: unknown; weightKg?: unknown };
        return typeof candidate.loggedAt === 'string' && !Number.isNaN(new Date(candidate.loggedAt).getTime()) && typeof candidate.weightKg === 'number' && Number.isFinite(candidate.weightKg) && candidate.weightKg > 0;
      }
    );
    const uniqueIncomingBodyweight = Array.from(
      new Map(validIncomingBodyweight.map((entry) => [new Date(entry.loggedAt).toISOString(), entry])).values()
    );

    for (const b of uniqueIncomingBodyweight) {
      const loggedAt = new Date(b.loggedAt);
      const existing = existingBodyweightByDate.get(loggedAt.toISOString());
      if (existing) {
        await db.update(bodyweightLogs).set({ weightKg: String(b.weightKg) }).where(eq(bodyweightLogs.id, existing.id));
      } else {
        await db.insert(bodyweightLogs).values({ userId, weightKg: String(b.weightKg), loggedAt });
      }

      // Actualizar perfil con el último peso
      await db.insert(userProfiles).values({
        userId,
        gender: req.auth!.user.gender || 'male',
        currentBodyweightKg: String(b.weightKg),
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: userProfiles.userId,
        set: { currentBodyweightKg: String(b.weightKg), updatedAt: new Date() }
      });
    }

    // 2. Sincronizar rutinas si se incluyen
    for (const rawRoutine of Array.isArray(incomingRoutines) ? incomingRoutines.slice(0, 250) : []) {
      if (!rawRoutine || typeof rawRoutine !== 'object') continue;
      const r = rawRoutine as { id?: string; name?: string; description?: string; exerciseIds?: unknown };
      if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 255) continue;
      const rUuid = toDatabaseUuid(r.id);
      const [existingRoutine] = await db.select({ userId: routines.userId }).from(routines).where(eq(routines.id, rUuid)).limit(1);
      if (existingRoutine && existingRoutine.userId !== userId) throw new ApiError(403, 'FORBIDDEN');
      await db
        .insert(routines)
        .values({
          id: rUuid,
          userId,
          name: r.name.trim(),
          description: r.description || null,
          exerciseIds: Array.isArray(r.exerciseIds) ? r.exerciseIds.filter((id): id is string => typeof id === 'string').slice(0, 100) : [],
        })
        .onConflictDoUpdate({
          target: routines.id,
          setWhere: eq(routines.userId, userId),
          set: {
            name: r.name.trim(),
            description: r.description || null,
            exerciseIds: Array.isArray(r.exerciseIds) ? r.exerciseIds.filter((id): id is string => typeof id === 'string').slice(0, 100) : [],
            updatedAt: new Date(),
          },
        });
    }

    // 3. Procesar y persistir sesiones de entrenamiento en lote
    for (const session of sessions) {
      const { id, routineId, routineName, startedAt, endedAt, notes, sets = {} } = session;
      const sessionUuid = toDatabaseUuid(id);
      const routineUuid = routineId ? toDatabaseUuid(routineId) : null;
      const [existingSession] = await db.select({ userId: workoutSessions.userId }).from(workoutSessions).where(eq(workoutSessions.id, sessionUuid)).limit(1);
      if (existingSession && existingSession.userId !== userId) throw new ApiError(403, 'FORBIDDEN');
      if (routineUuid) {
        const [ownedRoutine] = await db.select({ id: routines.id }).from(routines).where(and(eq(routines.id, routineUuid), eq(routines.userId, userId))).limit(1);
        if (!ownedRoutine) throw new ApiError(403, 'ROUTINE_NOT_OWNED');
      }

      // Calcular volumen total
      let totalVolume = 0;
      Object.values(sets).forEach((setArray) => {
        setArray.forEach((s) => {
          if (shouldCountForVolume(s)) {
            totalVolume += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
          }
        });
      });

      // Insertar o actualizar la sesión
      await db
        .insert(workoutSessions)
        .values({
          id: sessionUuid,
          userId,
          routineId: routineUuid,
          routineName: routineName || null,
          startedAt: new Date(startedAt),
          endedAt: endedAt ? new Date(endedAt) : null,
          notes: notes || null,
          totalVolumeKg: String(totalVolume),
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: workoutSessions.id,
          setWhere: eq(workoutSessions.userId, userId),
          set: {
            endedAt: endedAt ? new Date(endedAt) : null,
            totalVolumeKg: String(totalVolume),
            notes: notes || null,
            syncedAt: new Date(),
          },
        });

      // Limpiar series previas para garantizar idempotencia en re-sincronizaciones
      await db.delete(loggedSets).where(eq(loggedSets.sessionId, sessionUuid));

      // Insertar series asociadas
      for (const [exerciseId, exerciseSets] of Object.entries(sets)) {
        const [existingExercise] = await db.select({ userId: exercises.userId }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
        if (existingExercise?.userId && existingExercise.userId !== userId) throw new ApiError(403, 'FORBIDDEN');
        // Garantizar que el ejercicio exista en Postgres para no violar FK
        await db
          .insert(exercises)
          .values({
            id: exerciseId,
            userId,
            name: exerciseId,
            category: 'other',
            primaryMuscle: 'core',
            loadMechanism: DEFAULT_EXERCISE_LOADING_PROFILE.mechanism,
            loadMode: DEFAULT_EXERCISE_LOADING_PROFILE.loadMode,
            supportsKeyboard: DEFAULT_EXERCISE_LOADING_PROFILE.supportsKeyboard,
            supportsPlates: DEFAULT_EXERCISE_LOADING_PROFILE.supportsPlates,
            supportsExternalLoad: DEFAULT_EXERCISE_LOADING_PROFILE.supportsExternalLoad,
            includeBarWeight: DEFAULT_EXERCISE_LOADING_PROFILE.includeBarWeight,
            isCustom: true,
          })
          .onConflictDoNothing();

        for (const s of exerciseSets) {
          const est1Rm = shouldCountForPersonalRecord(s)
            ? estimateOneRm(Number(s.weightKg), Number(s.reps)).average
            : null;

          await db.insert(loggedSets).values({
            sessionId: sessionUuid,
            exerciseId,
            setIndex: s.setIndex,
            weightKg: String(s.weightKg),
            reps: s.reps,
            rir: s.rir !== undefined ? s.rir : null,
            rpe: s.rpe !== undefined ? String(s.rpe) : null,
            setType: s.setType,
            isWarmup: s.isWarmup,
            completed: Boolean(s.completed),
            estimatedOneRm: est1Rm ? String(est1Rm) : null,
          });

          // Evaluar si es nuevo récord personal (PR)
          if (est1Rm && est1Rm > 0) {
            const existingPr = await db
              .select()
              .from(personalRecords)
              .where(eq(personalRecords.userId, userId))
              .then((prs) => prs.find((p) => p.exerciseId === exerciseId));

            if (!existingPr || est1Rm > Number(existingPr.oneRmKg)) {
              if (existingPr) {
                await db
                  .update(personalRecords)
                  .set({
                    oneRmKg: String(est1Rm),
                    bestWeightKg: String(s.weightKg),
                    bestReps: s.reps,
                    achievedAt: new Date(startedAt),
                    sessionId: sessionUuid,
                  })
                  .where(eq(personalRecords.id, existingPr.id));
              } else {
                await db.insert(personalRecords).values({
                  userId,
                  exerciseId,
                  oneRmKg: String(est1Rm),
                  bestWeightKg: String(s.weightKg),
                  bestReps: s.reps,
                  achievedAt: new Date(startedAt),
                  sessionId: sessionUuid,
                });
              }
            }
          }
        }
      }

      syncedSessionIds.push(sessionUuid);
    }

    // Retornar confirmación y récords actualizados
    const currentPrs = await db
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId));

    res.json({
      success: true,
      syncedCount: syncedSessionIds.length,
      syncedSessionIds,
      personalRecords: currentPrs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyncValidationError) {
      return res.status(error.status).json({ error: error.code });
    }
    throw error;
  }
}));

// GET /api/sync/user?userId=... - Obtener usuario de la base de datos
syncRouter.get('/user', requireAuth, asyncRoute(async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((res) => res[0] || null);

    res.json({ user: userRecord ? toAuthUser(userRecord) : null });
  } catch (error) {
    throw error;
  }
}));

// GET /api/sync/pull?userId=... - Hidratación inicial del cliente
syncRouter.get('/pull', requireAuth, asyncRoute(async (req, res) => {
  try {
    const userId = req.auth!.userId;

    // 0. Usuario de la base de datos
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((res) => res[0] || null);

    // 1. Perfil del usuario
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .then((res) => res[0] || null);

    // 2. Rutinas
    const userRoutines = await db
      .select()
      .from(routines)
      .where(eq(routines.userId, userId));

    // 3. Sesiones de entrenamiento con sus series
    const sessionsList = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(50);

    const historyWithSets = await Promise.all(
      sessionsList.map(async (sess) => {
        const setsList = await db
          .select()
          .from(loggedSets)
          .where(eq(loggedSets.sessionId, sess.id));

        const setsByExercise: Record<string, Array<ReturnType<typeof hydrateSyncedSet>>> = {};
        for (const s of setsList) {
          if (!setsByExercise[s.exerciseId]) setsByExercise[s.exerciseId] = [];
          setsByExercise[s.exerciseId].push(hydrateSyncedSet({
            setIndex: s.setIndex,
            weightKg: Number(s.weightKg),
            reps: s.reps,
            rir: s.rir ?? undefined,
            rpe: s.rpe ? Number(s.rpe) : undefined,
            setType: s.setType,
            isWarmup: s.isWarmup,
            completed: s.completed,
          }));
        }

        return {
          id: sess.id,
          userId: sess.userId,
          routineId: sess.routineId ?? undefined,
          routineName: sess.routineName ?? undefined,
          startedAt: sess.startedAt.toISOString(),
          endedAt: sess.endedAt?.toISOString(),
          notes: sess.notes ?? undefined,
          sets: setsByExercise,
        };
      })
    );

    // 4. Récords personales
    const prs = await db
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId));

    const userBodyweightLogs = await db
      .select()
      .from(bodyweightLogs)
      .where(eq(bodyweightLogs.userId, userId))
      .orderBy(desc(bodyweightLogs.loggedAt))
      .limit(1_000);

    res.json({
      user: userRecord ? toAuthUser(userRecord) : null,
      profile,
      routines: userRoutines,
      history: historyWithSets,
      bodyweightLogs: userBodyweightLogs.map((entry) => ({
        weightKg: Number(entry.weightKg),
        loggedAt: entry.loggedAt.toISOString()
      })),
      personalRecords: prs,
    });
  } catch (error) {
    throw error;
  }
}));
