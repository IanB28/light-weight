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
  users,
  historicalPersonalRecords
} from '../db/schema.js';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  estimateOneRm,
  normalizeHistoricalPersonalRecord,
  shouldCountForPersonalRecord,
  shouldCountForVolume,
  type BaseResistanceStatus
} from '@light-weight/domain';
import { and, eq, desc, inArray } from 'drizzle-orm';
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
      routines: incomingRoutines = [],
      deletedRoutineIds: rawDeletedRoutineIds = [],
      historicalPersonalRecords: rawHprs = []
    } = req.body || {};
    const userId = req.auth!.userId;
    // Validate and normalize canonical set semantics before performing any write.
    const sessions = normalizeIncomingSyncSessions(rawSessions);
    const validIncomingHprs = (Array.isArray(rawHprs) ? rawHprs : [])
      .map(normalizeHistoricalPersonalRecord)
      .filter((hpr): hpr is NonNullable<typeof hpr> => hpr !== null);
    const deletedRoutineIds = [...new Set((Array.isArray(rawDeletedRoutineIds) ? rawDeletedRoutineIds : [])
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, 250))];
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
    const incomingRoutineList = (Array.isArray(incomingRoutines) ? incomingRoutines.slice(0, 250) : [])
      .filter((routine): routine is { id?: string; name?: string; description?: string; exerciseIds?: unknown } => Boolean(routine && typeof routine === 'object'));
    const routineDbIds = new Set([
      ...deletedRoutineIds.map(toDatabaseUuid),
      ...incomingRoutineList.map((routine) => toDatabaseUuid(routine.id)),
      ...sessions.flatMap((session) => session.routineId ? [toDatabaseUuid(session.routineId)] : [])
    ]);
    const sessionDbIds = sessions.map((session) => toDatabaseUuid(session.id));
    const exerciseIds = [...new Set([
      ...sessions.flatMap((session) => Object.keys(session.sets || {})),
      ...validIncomingHprs.map((hpr) => hpr.exerciseId)
    ])];

    const result = await db.transaction(async (tx) => {
      const [existingBodyweightLogs, existingPrs, existingSessions, existingRoutines, existingExercises] = await Promise.all([
        tx.select().from(bodyweightLogs).where(eq(bodyweightLogs.userId, userId)),
        tx.select().from(personalRecords).where(eq(personalRecords.userId, userId)),
        sessionDbIds.length ? tx.select({ id: workoutSessions.id, userId: workoutSessions.userId }).from(workoutSessions).where(inArray(workoutSessions.id, sessionDbIds)) : [],
        routineDbIds.size ? tx.select({ id: routines.id, userId: routines.userId }).from(routines).where(inArray(routines.id, [...routineDbIds])) : [],
        exerciseIds.length ? tx.select({ id: exercises.id, userId: exercises.userId }).from(exercises).where(inArray(exercises.id, exerciseIds)) : []
      ]);
      const existingBodyweightByDate = new Map(existingBodyweightLogs.map((entry) => [entry.loggedAt.toISOString(), entry]));
      const routineOwnerById = new Map(existingRoutines.map(
        (routine): [string, string] => [routine.id, routine.userId]
      ));
      const sessionOwnerById = new Map(existingSessions.map(
        (session): [string, string] => [session.id, session.userId]
      ));
      const exerciseOwnerById = new Map(existingExercises.map(
        (exercise): [string, string | null] => [exercise.id, exercise.userId]
      ));
      // Personal records are loaded once for the entire sync. The map tracks
      // deterministic in-request updates instead of selecting per physical set.
      const personalRecordByExercise = new Map(existingPrs.map((record) => [record.exerciseId, record]));
      const acknowledgedDeletedRoutineIds: string[] = [];
      const syncedSessionIds: string[] = [];

      for (const b of uniqueIncomingBodyweight) {
        const loggedAt = new Date(b.loggedAt);
        const existing = existingBodyweightByDate.get(loggedAt.toISOString());
        if (existing) await tx.update(bodyweightLogs).set({ weightKg: String(b.weightKg) }).where(eq(bodyweightLogs.id, existing.id));
        else await tx.insert(bodyweightLogs).values({ userId, weightKg: String(b.weightKg), loggedAt });
        await tx.insert(userProfiles).values({ userId, gender: req.auth!.user.gender || 'male', currentBodyweightKg: String(b.weightKg), updatedAt: new Date() }).onConflictDoUpdate({
          target: userProfiles.userId,
          set: { currentBodyweightKg: String(b.weightKg), updatedAt: new Date() }
        });
      }

      for (const r of incomingRoutineList) {
        if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 255) continue;
        const rUuid = toDatabaseUuid(r.id);
        if (routineDbIds.has(rUuid) && deletedRoutineIds.some((id) => toDatabaseUuid(id) === rUuid)) continue;
        const owner = routineOwnerById.get(rUuid);
        if (owner && owner !== userId) throw new ApiError(403, 'FORBIDDEN');
        const exerciseIdsForRoutine = Array.isArray(r.exerciseIds) ? r.exerciseIds.filter((id): id is string => typeof id === 'string').slice(0, 100) : [];
        await tx.insert(routines).values({ id: rUuid, userId, name: r.name.trim(), description: r.description || null, exerciseIds: exerciseIdsForRoutine }).onConflictDoUpdate({
          target: routines.id,
          setWhere: eq(routines.userId, userId),
          set: { name: r.name.trim(), description: r.description || null, exerciseIds: exerciseIdsForRoutine, updatedAt: new Date() }
        });
        routineOwnerById.set(rUuid, userId);
      }

      for (const rawId of deletedRoutineIds) {
        const databaseId = toDatabaseUuid(rawId);
        const owner = routineOwnerById.get(databaseId);
        if (owner && owner !== userId) throw new ApiError(403, 'FORBIDDEN');
        if (owner) await tx.delete(routines).where(and(eq(routines.id, databaseId), eq(routines.userId, userId)));
        routineOwnerById.delete(databaseId);
        acknowledgedDeletedRoutineIds.push(rawId);
      }

      for (const session of sessions) {
      const { id, routineId, routineName, startedAt, performedDate, recordedAt, entrySource, endedAt, notes, sets = {} } = session;
      const sessionUuid = toDatabaseUuid(id);
      const requestedRoutineUuid = routineId ? toDatabaseUuid(routineId) : null;
      const sessionOwner = sessionOwnerById.get(sessionUuid);
      if (sessionOwner && sessionOwner !== userId) throw new ApiError(403, 'FORBIDDEN');
      let routineUuid: string | null = null;
      if (requestedRoutineUuid) {
        const routineOwner = routineOwnerById.get(requestedRoutineUuid);
        if (routineOwner && routineOwner !== userId) throw new ApiError(403, 'ROUTINE_NOT_OWNED');
        // A locally deleted routine may still be referenced by historical
        // sessions. Preserve the session name but never revive the routine.
        if (routineOwner === userId) routineUuid = requestedRoutineUuid;
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
      await tx
        .insert(workoutSessions)
        .values({
          id: sessionUuid,
          userId,
          routineId: routineUuid,
          routineName: routineName || null,
          startedAt: new Date(startedAt),
          performedDate: performedDate || null,
          recordedAt: recordedAt ? new Date(recordedAt) : null,
          entrySource: entrySource || null,
          endedAt: endedAt ? new Date(endedAt) : null,
          notes: notes || null,
          totalVolumeKg: String(totalVolume),
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: workoutSessions.id,
          setWhere: eq(workoutSessions.userId, userId),
          set: {
            // Omitted legacy metadata must not erase provenance on a retry.
            ...(performedDate === undefined ? {} : { performedDate: performedDate || null }),
            ...(recordedAt === undefined ? {} : { recordedAt: recordedAt ? new Date(recordedAt) : null }),
            ...(entrySource === undefined ? {} : { entrySource: entrySource || null }),
            endedAt: endedAt ? new Date(endedAt) : null,
            totalVolumeKg: String(totalVolume),
            notes: notes || null,
            syncedAt: new Date(),
          },
        });

      // Limpiar series previas para garantizar idempotencia en re-sincronizaciones
      await tx.delete(loggedSets).where(eq(loggedSets.sessionId, sessionUuid));

      // Insertar series asociadas
      for (const [exerciseId, exerciseSets] of Object.entries(sets)) {
        const exerciseOwner = exerciseOwnerById.get(exerciseId);
        if (exerciseOwner && exerciseOwner !== userId) throw new ApiError(403, 'FORBIDDEN');
        // Garantizar que el ejercicio exista en Postgres para no violar FK
        await tx
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
        if (!exerciseOwnerById.has(exerciseId)) exerciseOwnerById.set(exerciseId, userId);

        for (const s of exerciseSets) {
          const est1Rm = shouldCountForPersonalRecord(s)
            ? estimateOneRm(Number(s.weightKg), Number(s.reps)).average
            : null;

          await tx.insert(loggedSets).values({
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
            machineProfileId: s.machineProfileId || null,
            machineProfileLabel: s.machineProfileLabel || null,
            machineBaseResistanceKg: s.machineBaseResistanceKg !== undefined ? String(s.machineBaseResistanceKg) : null,
            machineBaseResistanceStatus: (s.machineBaseResistanceStatus as BaseResistanceStatus) || null,
            machineBaseSourceLabel: s.machineBaseSourceLabel || null,
            machineBaseSourceUrl: s.machineBaseSourceUrl || null,
            machineManufacturer: s.machineManufacturer || null,
            machineModel: s.machineModel || null,
          });

          // Evaluar si es nuevo récord personal (PR)
          if (est1Rm && est1Rm > 0) {
            const existingPr = personalRecordByExercise.get(exerciseId);

            if (!existingPr || est1Rm > Number(existingPr.oneRmKg)) {
              if (existingPr) {
                const nextValues = {
                  oneRmKg: String(est1Rm),
                  bestWeightKg: String(s.weightKg),
                  bestReps: s.reps,
                  achievedAt: new Date(startedAt),
                  sessionId: sessionUuid,
                };
                await tx
                  .update(personalRecords)
                  .set(nextValues)
                  .where(eq(personalRecords.id, existingPr.id));
                personalRecordByExercise.set(exerciseId, { ...existingPr, ...nextValues });
              } else {
                const [createdPr] = await tx.insert(personalRecords).values({
                  userId,
                  exerciseId,
                  oneRmKg: String(est1Rm),
                  bestWeightKg: String(s.weightKg),
                  bestReps: s.reps,
                  achievedAt: new Date(startedAt),
                  sessionId: sessionUuid,
                }).returning();
                personalRecordByExercise.set(exerciseId, createdPr);
              }
            }
          }
        }
      }

      syncedSessionIds.push(sessionUuid);
      }

      for (const hpr of validIncomingHprs) {
        const hprUuid = toDatabaseUuid(hpr.id);
        const exerciseId = hpr.exerciseId;
        await tx
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
        if (!exerciseOwnerById.has(exerciseId)) exerciseOwnerById.set(exerciseId, userId);

        await tx.insert(historicalPersonalRecords).values({
          id: hprUuid,
          userId,
          exerciseId,
          performedDate: hpr.performedDate,
          recordedAt: new Date(hpr.recordedAt),
          bodyweightKg: String(hpr.bodyweightKg),
          weightKg: String(hpr.set.weightKg),
          reps: hpr.set.reps,
          rir: hpr.set.rir ?? null,
          rpe: hpr.set.rpe !== undefined ? String(hpr.set.rpe) : null,
          setType: hpr.set.setType,
          machineProfileId: hpr.set.machineProfileId || null,
          machineProfileLabel: hpr.set.machineProfileLabel || null,
          machineBaseResistanceKg: hpr.set.machineBaseResistanceKg !== undefined ? String(hpr.set.machineBaseResistanceKg) : null,
          machineBaseResistanceStatus: (hpr.set.machineBaseResistanceStatus as BaseResistanceStatus) || null,
          machineBaseSourceLabel: hpr.set.machineBaseSourceLabel || null,
          machineBaseSourceUrl: hpr.set.machineBaseSourceUrl || null,
          machineManufacturer: hpr.set.machineManufacturer || null,
          machineModel: hpr.set.machineModel || null,
          source: 'historical_manual',
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: historicalPersonalRecords.id,
          set: {
            bodyweightKg: String(hpr.bodyweightKg),
            weightKg: String(hpr.set.weightKg),
            reps: hpr.set.reps,
            rir: hpr.set.rir ?? null,
            rpe: hpr.set.rpe !== undefined ? String(hpr.set.rpe) : null,
            setType: hpr.set.setType,
            machineProfileId: hpr.set.machineProfileId || null,
            machineProfileLabel: hpr.set.machineProfileLabel || null,
            machineBaseResistanceKg: hpr.set.machineBaseResistanceKg !== undefined ? String(hpr.set.machineBaseResistanceKg) : null,
            machineBaseResistanceStatus: (hpr.set.machineBaseResistanceStatus as BaseResistanceStatus) || null,
            machineBaseSourceLabel: hpr.set.machineBaseSourceLabel || null,
            machineBaseSourceUrl: hpr.set.machineBaseSourceUrl || null,
            machineManufacturer: hpr.set.machineManufacturer || null,
            machineModel: hpr.set.machineModel || null,
            updatedAt: new Date(),
          }
        });
      }

      return {
        success: true,
        syncedCount: syncedSessionIds.length,
        syncedSessionIds,
        deletedRoutineIds: acknowledgedDeletedRoutineIds,
        personalRecords: await tx.select().from(personalRecords).where(eq(personalRecords.userId, userId)),
        timestamp: new Date().toISOString(),
      };
    });
    res.json(result);
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
            machineProfileId: s.machineProfileId ?? undefined,
            machineProfileLabel: s.machineProfileLabel ?? undefined,
            machineBaseResistanceKg: s.machineBaseResistanceKg !== null && s.machineBaseResistanceKg !== undefined ? Number(s.machineBaseResistanceKg) : undefined,
            machineBaseResistanceStatus: s.machineBaseResistanceStatus ?? undefined,
            machineBaseSourceLabel: s.machineBaseSourceLabel ?? undefined,
            machineBaseSourceUrl: s.machineBaseSourceUrl ?? undefined,
            machineManufacturer: s.machineManufacturer ?? undefined,
            machineModel: s.machineModel ?? undefined,
          }));
        }

        return {
          id: sess.id,
          userId: sess.userId,
          routineId: sess.routineId ?? undefined,
          routineName: sess.routineName ?? undefined,
          startedAt: sess.startedAt.toISOString(),
          performedDate: sess.performedDate ?? undefined,
          recordedAt: sess.recordedAt?.toISOString(),
          entrySource: sess.entrySource ?? undefined,
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

    const userHprs = await db
      .select()
      .from(historicalPersonalRecords)
      .where(eq(historicalPersonalRecords.userId, userId))
      .orderBy(desc(historicalPersonalRecords.performedDate));

    const hydratedHprs = userHprs.map((row) => ({
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      performedDate: row.performedDate,
      recordedAt: row.recordedAt.toISOString(),
      bodyweightKg: Number(row.bodyweightKg),
      source: 'historical_manual' as const,
      set: {
        setIndex: 1,
        weightKg: Number(row.weightKg),
        reps: row.reps,
        rir: row.rir ?? undefined,
        rpe: row.rpe ? Number(row.rpe) : undefined,
        setType: row.setType,
        completed: true,
        machineProfileId: row.machineProfileId ?? undefined,
        machineProfileLabel: row.machineProfileLabel ?? undefined,
        machineBaseResistanceKg: row.machineBaseResistanceKg !== null && row.machineBaseResistanceKg !== undefined ? Number(row.machineBaseResistanceKg) : undefined,
        machineBaseResistanceStatus: row.machineBaseResistanceStatus ?? undefined,
        machineBaseSourceLabel: row.machineBaseSourceLabel ?? undefined,
        machineBaseSourceUrl: row.machineBaseSourceUrl ?? undefined,
        machineManufacturer: row.machineManufacturer ?? undefined,
        machineModel: row.machineModel ?? undefined,
      }
    }));

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
      historicalPersonalRecords: hydratedHprs,
    });
  } catch (error) {
    throw error;
  }
}));
