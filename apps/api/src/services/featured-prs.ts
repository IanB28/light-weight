import { eq, inArray } from 'drizzle-orm';
import {
  normalizeLoggedSet,
  resolveFeaturedPrVariants,
  resolveSelectedFeaturedPrVariant,
  type BodyweightEntry,
  type FeaturedPrSelection,
  type FeaturedPrShowcase,
  type HistoricalPersonalRecord,
  type WorkoutSession
} from '@light-weight/domain';
import { db } from '../db/index.js';
import {
  bodyweightLogs,
  exercises,
  historicalPersonalRecords,
  loggedSets,
  profileFeaturedPrs,
  workoutSessions
} from '../db/schema.js';
import { toDomainExercise } from '../routes/exercises.js';

function iso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

export async function resolveUserFeaturedPrShowcase(
  userId: string,
  suppliedSelections?: readonly FeaturedPrSelection[]
): Promise<FeaturedPrShowcase> {
  const [selectionRows, sessionRows, bodyweightRows, hprRows] = await Promise.all([
    suppliedSelections
      ? Promise.resolve(suppliedSelections)
      : db.select({
          slot: profileFeaturedPrs.slot,
          exerciseId: profileFeaturedPrs.exerciseId,
          loadWeightKg: profileFeaturedPrs.loadWeightKg
        }).from(profileFeaturedPrs).where(eq(profileFeaturedPrs.userId, userId)).orderBy(profileFeaturedPrs.slot),
    db.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)),
    db.select().from(bodyweightLogs).where(eq(bodyweightLogs.userId, userId)),
    db.select().from(historicalPersonalRecords).where(eq(historicalPersonalRecords.userId, userId))
  ]);

  const selections: FeaturedPrSelection[] = selectionRows.map((row) => ({
    slot: row.slot as FeaturedPrSelection['slot'],
    exerciseId: row.exerciseId,
    loadWeightKg: Number(row.loadWeightKg)
  })).sort((left, right) => left.slot - right.slot);

  const sessionIds = sessionRows.map((session) => session.id);
  const setRows = sessionIds.length
    ? await db.select().from(loggedSets).where(inArray(loggedSets.sessionId, sessionIds))
    : [];

  const exerciseIds = [...new Set([
    ...setRows.map((set) => set.exerciseId),
    ...hprRows.map((record) => record.exerciseId),
    ...selections.map((selection) => selection.exerciseId)
  ])];
  const exerciseRows = exerciseIds.length
    ? await db.select().from(exercises).where(inArray(exercises.id, exerciseIds))
    : [];
  const exercisesById = new Map(exerciseRows.map((row) => [row.id, toDomainExercise(row)]));

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

  const bodyweightEntries: BodyweightEntry[] = bodyweightRows.map((row) => ({
    date: row.loggedAt.toISOString(),
    weightKg: Number(row.weightKg),
    timestamp: row.loggedAt.getTime()
  }));
  const hprs: HistoricalPersonalRecord[] = hprRows.map((row) => ({
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
  }));

  const history = [...sessionsById.values()];
  const variants = exerciseIds.flatMap((exerciseId) => {
    const exercise = exercisesById.get(exerciseId);
    if (!exercise) return [];
    return resolveFeaturedPrVariants({
      exerciseId,
      exercise,
      history,
      historicalPersonalRecords: hprs,
      bodyweightEntries
    });
  });

  return {
    selections,
    variants,
    resolvedSelections: selections.map((selection) => ({
      ...selection,
      variant: resolveSelectedFeaturedPrVariant(selection, variants)
    }))
  };
}
