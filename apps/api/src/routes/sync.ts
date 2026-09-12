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
import { estimateOneRm } from '@light-weight/domain';
import { eq, desc } from 'drizzle-orm';

export const syncRouter: Router = Router();

function toValidUuid(rawId?: string | null): string {
  if (!rawId) return '00000000-0000-4000-8000-000000000000';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(rawId)) return rawId;
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    hash = ((hash << 5) - hash) + rawId.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex.slice(0, 12)}`;
}

// POST /api/sync - Sincronización en lote de entrenamientos (Offline-First)
syncRouter.post('/', async (req, res) => {
  try {
    const {
      userId = '00000000-0000-0000-0000-000000000001',
      sessions = [],
      bodyweightLogs: bLogs = [],
      routines: incomingRoutines = []
    } = req.body;

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
      await db
        .update(userProfiles)
        .set({
          currentBodyweightKg: String(b.weightKg),
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    }

    // 2. Sincronizar rutinas si se incluyen
    for (const r of incomingRoutines) {
      if (!r.name) continue;
      const rUuid = toValidUuid(r.id);
      await db
        .insert(routines)
        .values({
          id: rUuid,
          userId,
          name: r.name,
          description: r.description || null,
          exerciseIds: r.exerciseIds || [],
        })
        .onConflictDoUpdate({
          target: routines.id,
          set: {
            name: r.name,
            description: r.description || null,
            exerciseIds: r.exerciseIds || [],
            updatedAt: new Date(),
          },
        });
    }

    // 3. Procesar y persistir sesiones de entrenamiento en lote
    for (const session of sessions) {
      const { id, routineId, routineName, startedAt, endedAt, notes, sets = {} } = session;
      const sessionUuid = toValidUuid(id);
      const routineUuid = routineId ? toValidUuid(routineId) : null;

      // Calcular volumen total
      let totalVolume = 0;
      Object.values(sets).forEach((setArray: any) => {
        setArray.forEach((s: any) => {
          if (s.completed && !s.isWarmup) {
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
      for (const [exerciseId, exerciseSets] of Object.entries(sets) as [string, any[]][]) {
        // Garantizar que el ejercicio exista en Postgres para no violar FK
        await db
          .insert(exercises)
          .values({
            id: exerciseId,
            name: exerciseId,
            category: 'other',
            primaryMuscle: 'core',
            isCustom: true,
          })
          .onConflictDoNothing();

        for (const s of exerciseSets) {
          const est1Rm = s.completed && s.weightKg > 0 && s.reps > 0
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
            isWarmup: Boolean(s.isWarmup),
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
  } catch (error: any) {
    console.error('[Sync API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync/user?userId=... - Obtener usuario de la base de datos
syncRouter.get('/user', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || '00000000-0000-0000-0000-000000000001';
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((res) => res[0] || null);

    res.json({ user: userRecord });
  } catch (error: any) {
    console.error('[Sync User Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync/pull?userId=... - Hidratación inicial del cliente
syncRouter.get('/pull', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || '00000000-0000-0000-0000-000000000001';

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

        const setsByExercise: Record<string, any[]> = {};
        for (const s of setsList) {
          if (!setsByExercise[s.exerciseId]) setsByExercise[s.exerciseId] = [];
          setsByExercise[s.exerciseId].push({
            setIndex: s.setIndex,
            weightKg: Number(s.weightKg),
            reps: s.reps,
            rir: s.rir ?? undefined,
            rpe: s.rpe ? Number(s.rpe) : undefined,
            isWarmup: s.isWarmup,
            completed: s.completed,
          });
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

    res.json({
      user: userRecord,
      profile,
      routines: userRoutines,
      history: historyWithSets,
      personalRecords: prs,
    });
  } catch (error: any) {
    console.error('[Sync Pull Error]', error);
    res.status(500).json({ error: error.message });
  }
});
