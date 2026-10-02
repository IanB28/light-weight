import { eq, inArray } from 'drizzle-orm';
import {
  normalizeLoggedSet,
  type BodyweightEntry,
  type Exercise,
  type Gender,
  type HistoricalPersonalRecord,
  type WorkoutSession
} from '@light-weight/domain';
import { db } from '../db/index.js';
import {
  bodyweightLogs,
  exercises,
  historicalPersonalRecords,
  loggedSets,
  users,
  workoutSessions
} from '../db/schema.js';
import { toDomainExercise } from '../routes/exercises.js';

export interface FullUserTrainingProjection {
  history: WorkoutSession[];
  bodyweightEntries: BodyweightEntry[];
  historicalPersonalRecords: HistoricalPersonalRecord[];
  exercisesById: Record<string, Exercise>;
  gender?: Gender;
}

function iso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

/**
 * Loads canonical training evidence without the 50-session sync-cache limit.
 * Query shape is bounded: user/sessions/bodyweight/HPR in parallel, then one
 * batched set query and one batched exercise query.
 */
export async function loadFullUserTrainingProjection(
  userId: string,
  additionalExerciseIds: readonly string[] = []
): Promise<FullUserTrainingProjection> {
  const [userRows, sessionRows, bodyweightRows, hprRows] = await Promise.all([
    db.select({ gender: users.gender }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)),
    db.select().from(bodyweightLogs).where(eq(bodyweightLogs.userId, userId)),
    db.select().from(historicalPersonalRecords).where(eq(historicalPersonalRecords.userId, userId))
  ]);

  const sessionIds = sessionRows.map((session) => session.id);
  const setRows = sessionIds.length
    ? await db.select().from(loggedSets).where(inArray(loggedSets.sessionId, sessionIds))
    : [];
  const exerciseIds = [...new Set([
    ...setRows.map((set) => set.exerciseId),
    ...hprRows.map((record) => record.exerciseId),
    ...additionalExerciseIds
  ])];
  const exerciseRows = exerciseIds.length
    ? await db.select().from(exercises).where(inArray(exercises.id, exerciseIds))
    : [];

  const sessionsById = new Map<string, WorkoutSession>(sessionRows.map((row) => [row.id, {
    id: row.id,
    userId: row.userId,
    ...(row.routineId ? { routineId: row.routineId } : {}),
    ...(row.routineName ? { routineName: row.routineName } : {}),
    startedAt: row.startedAt.toISOString(),
    ...(row.performedDate ? { performedDate: row.performedDate } : {}),
    ...(iso(row.recordedAt) ? { recordedAt: iso(row.recordedAt) } : {}),
    ...(row.entrySource ? { entrySource: row.entrySource } : {}),
    ...(iso(row.endedAt) ? { endedAt: iso(row.endedAt) } : {}),
    sets: {}
  }]));
  for (const row of setRows) {
    const session = sessionsById.get(row.sessionId);
    if (!session) continue;
    const list = session.sets[row.exerciseId] ?? [];
    list.push(normalizeLoggedSet({
      setIndex: row.setIndex,
      weightKg: Number(row.weightKg),
      reps: row.reps,
      rir: row.rir ?? undefined,
      rpe: row.rpe === null ? undefined : Number(row.rpe),
      setType: row.setType,
      isWarmup: row.isWarmup,
      completed: row.completed,
      machineProfileId: row.machineProfileId ?? undefined,
      machineProfileLabel: row.machineProfileLabel ?? undefined,
      machineBaseResistanceKg: row.machineBaseResistanceKg === null ? undefined : Number(row.machineBaseResistanceKg),
      machineBaseResistanceStatus: row.machineBaseResistanceStatus ?? undefined,
      machineBaseSourceLabel: row.machineBaseSourceLabel ?? undefined,
      machineBaseSourceUrl: row.machineBaseSourceUrl ?? undefined,
      machineManufacturer: row.machineManufacturer ?? undefined,
      machineModel: row.machineModel ?? undefined
    }));
    session.sets[row.exerciseId] = list;
  }

  const gender = userRows[0]?.gender;
  return {
    history: [...sessionsById.values()],
    bodyweightEntries: bodyweightRows.map((row) => ({
      date: row.loggedAt.toISOString(),
      weightKg: Number(row.weightKg),
      timestamp: row.loggedAt.getTime()
    })),
    historicalPersonalRecords: hprRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      performedDate: row.performedDate,
      recordedAt: row.recordedAt.toISOString(),
      bodyweightKg: Number(row.bodyweightKg),
      source: 'historical_manual',
      set: normalizeLoggedSet({
        setIndex: 1,
        weightKg: Number(row.weightKg),
        reps: row.reps,
        rir: row.rir ?? undefined,
        rpe: row.rpe === null ? undefined : Number(row.rpe),
        setType: row.setType,
        isWarmup: row.setType === 'warmup',
        completed: true,
        machineProfileId: row.machineProfileId ?? undefined,
        machineProfileLabel: row.machineProfileLabel ?? undefined,
        machineBaseResistanceKg: row.machineBaseResistanceKg === null ? undefined : Number(row.machineBaseResistanceKg),
        machineBaseResistanceStatus: row.machineBaseResistanceStatus ?? undefined,
        machineBaseSourceLabel: row.machineBaseSourceLabel ?? undefined,
        machineBaseSourceUrl: row.machineBaseSourceUrl ?? undefined,
        machineManufacturer: row.machineManufacturer ?? undefined,
        machineModel: row.machineModel ?? undefined
      })
    })),
    exercisesById: Object.fromEntries(exerciseRows.map((row) => [row.id, toDomainExercise(row)])),
    ...(gender === 'male' || gender === 'female' ? { gender } : {})
  };
}
