import { sql } from 'drizzle-orm';
import type { BaseResistanceStatus, ExercisePerformanceHead } from '@light-weight/domain';
import { db } from '../db/index.js';
import { hydrateSyncedSet } from './sync-mappers.js';

export interface PerformanceRow {
  exerciseId: string;
  sessionId: string;
  startedAt: Date;
  performedDate: string | null;
  recordedAt: Date | null;
  setIndex: number;
  weightKg: string;
  reps: number;
  rir: number | null;
  rpe: string | null;
  setType: string;
  isWarmup: boolean;
  completed: boolean;
  machineProfileId: string | null;
  machineProfileLabel: string | null;
  machineBaseResistanceKg: string | null;
  machineBaseResistanceStatus: string | null;
  machineBaseSourceLabel: string | null;
  machineBaseSourceUrl: string | null;
  machineManufacturer: string | null;
  machineModel: string | null;
}

/** One set-based query across the user's entire physical history; the regular pull stays bounded. */
export async function getLatestExercisePerformances(
  userId: string,
  options?: { before?: Date; exerciseIds?: readonly string[] }
): Promise<Record<string, ExercisePerformanceHead>> {
  if (options?.exerciseIds?.length === 0) return {};
  const cutoff = options?.before ? sql`AND ws.started_at < ${options.before.toISOString()}::timestamptz` : sql``;
  const exerciseFilter = options?.exerciseIds
    ? sql`AND ls.exercise_id IN (${sql.join(options.exerciseIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const rows = await db.execute(sql`
    WITH heads AS (
      SELECT DISTINCT ON (ls.exercise_id)
        ls.exercise_id, ws.id AS session_id, ws.started_at, ws.performed_date, ws.recorded_at
      FROM logged_sets ls
      JOIN workout_sessions ws ON ws.id = ls.session_id
      WHERE ws.user_id = ${userId}::uuid
        AND ls.completed = true AND ls.weight_kg >= 0 AND ls.reps > 0
        ${cutoff} ${exerciseFilter}
      ORDER BY ls.exercise_id, ws.started_at DESC, ws.recorded_at DESC NULLS LAST, ws.id DESC
    )
    SELECT h.exercise_id AS "exerciseId", h.session_id AS "sessionId",
      h.started_at AS "startedAt", h.performed_date AS "performedDate", h.recorded_at AS "recordedAt",
      ls.set_index AS "setIndex", ls.weight_kg AS "weightKg", ls.reps, ls.rir, ls.rpe,
      ls.set_type AS "setType", ls.is_warmup AS "isWarmup", ls.completed,
      ls.machine_profile_id AS "machineProfileId", ls.machine_profile_label AS "machineProfileLabel",
      ls.machine_base_resistance_kg AS "machineBaseResistanceKg",
      ls.machine_base_resistance_status AS "machineBaseResistanceStatus",
      ls.machine_base_source_label AS "machineBaseSourceLabel",
      ls.machine_base_source_url AS "machineBaseSourceUrl",
      ls.machine_manufacturer AS "machineManufacturer", ls.machine_model AS "machineModel"
    FROM heads h
    JOIN logged_sets ls ON ls.session_id = h.session_id AND ls.exercise_id = h.exercise_id
    WHERE ls.completed = true AND ls.weight_kg >= 0 AND ls.reps > 0
    ORDER BY h.exercise_id, ls.set_index, ls.id
  `);
  return assembleLatestExercisePerformances(rows as unknown as PerformanceRow[]);
}

export function assembleLatestExercisePerformances(rows: readonly PerformanceRow[]): Record<string, ExercisePerformanceHead> {
  const heads: Record<string, ExercisePerformanceHead> = {};
  for (const row of rows) {
    const head = (heads[row.exerciseId] ??= {
      exerciseId: row.exerciseId, sessionId: row.sessionId,
      startedAt: new Date(row.startedAt).toISOString(),
      performedDate: row.performedDate ?? undefined,
      recordedAt: row.recordedAt ? new Date(row.recordedAt).toISOString() : undefined,
      sets: []
    });
    head.sets.push(hydrateSyncedSet({
      setIndex: row.setIndex, weightKg: Number(row.weightKg), reps: row.reps,
      rir: row.rir ?? undefined, rpe: row.rpe ? Number(row.rpe) : undefined,
      setType: row.setType, isWarmup: row.isWarmup, completed: row.completed,
      machineProfileId: row.machineProfileId ?? undefined,
      machineProfileLabel: row.machineProfileLabel ?? undefined,
      machineBaseResistanceKg: row.machineBaseResistanceKg ? Number(row.machineBaseResistanceKg) : undefined,
      machineBaseResistanceStatus: (row.machineBaseResistanceStatus as BaseResistanceStatus | null) ?? undefined,
      machineBaseSourceLabel: row.machineBaseSourceLabel ?? undefined,
      machineBaseSourceUrl: row.machineBaseSourceUrl ?? undefined,
      machineManufacturer: row.machineManufacturer ?? undefined,
      machineModel: row.machineModel ?? undefined
    }));
  }
  return heads;
}
