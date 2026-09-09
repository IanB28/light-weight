import type { WorkoutSession, LoggedSet, MuscleGroup, Exercise } from './types.js';
import { calculateVolume } from './progression.js';
import { estimate1RM } from './onerm.js';

export interface MuscleVolumeDistribution {
  muscle: MuscleGroup;
  totalVolumeKg: number;
  totalSets: number;
}

export interface ExerciseProgressPoint {
  date: string;
  timestamp: number;
  topWeightKg: number;
  est1Rm: number | null;
  avgRir: number | null;
  sets: LoggedSet[];
  label: string;
}

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core'
];

/**
 * Calculates the total tonnage (kg moved) for an entire workout session.
 */
export function calculateSessionTotalVolume(session: WorkoutSession): number {
  return Object.values(session.sets).reduce((acc, sets) => {
    return acc + calculateVolume(sets);
  }, 0);
}

/**
 * Counts total completed sets across all exercises in a session.
 */
export function countSessionCompletedSets(session: WorkoutSession): number {
  return Object.values(session.sets).reduce((acc, sets) => {
    return acc + sets.filter((s) => s.completed).length;
  }, 0);
}

/**
 * Finds the latest completed sets and performance for a given exercise ID from historical workouts.
 */
export function getPreviousPerformance(
  history: WorkoutSession[],
  exerciseId: string
): { lastDate?: string; sets: LoggedSet[]; summary: string } | null {
  const sorted = [...history].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  for (const session of sorted) {
    const exerciseSets = session.sets[exerciseId];
    if (exerciseSets && exerciseSets.some((s) => s.completed)) {
      const completed = exerciseSets.filter((s) => s.completed);
      const topSet = completed.reduce((max, s) => (s.weightKg > max.weightKg ? s : max), completed[0]);
      const summary = topSet ? `${topSet.weightKg} kg × ${topSet.reps}` : '';
      return {
        lastDate: session.startedAt,
        sets: completed,
        summary
      };
    }
  }

  return null;
}

/**
 * Extracts chronological progress points for an exercise across workout history.
 */
export function getExerciseProgressSeries(
  history: WorkoutSession[],
  exerciseId: string
): ExerciseProgressPoint[] {
  // Sort oldest to newest
  const sorted = [...history].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const series: ExerciseProgressPoint[] = [];

  for (const session of sorted) {
    const rawSets = session.sets[exerciseId];
    if (!rawSets || rawSets.length === 0) continue;

    const completedSets = rawSets.filter((s) => s.completed && !s.isWarmup);
    if (completedSets.length === 0) continue;

    const topSet = completedSets.reduce(
      (max, s) => (s.weightKg > max.weightKg ? s : max),
      completedSets[0]
    );

    // Calculate best 1RM in session
    let best1Rm: number | null = null;
    for (const s of completedSets) {
      const est = estimate1RM(s.weightKg, s.reps, 'epley');
      if (est !== null && (best1Rm === null || est > best1Rm)) {
        best1Rm = est;
      }
    }

    // Average RIR
    const ratedSets = completedSets.filter((s) => s.rir !== undefined);
    const avgRir =
      ratedSets.length > 0
        ? Math.round(
            (ratedSets.reduce((acc, s) => acc + (s.rir ?? 0), 0) / ratedSets.length) * 10
          ) / 10
        : null;

    const t = new Date(session.startedAt).getTime();
    const d = session.startedAt.slice(0, 10);

    series.push({
      date: d,
      timestamp: t,
      topWeightKg: topSet.weightKg,
      est1Rm: best1Rm,
      avgRir,
      sets: completedSets,
      label: `${topSet.weightKg} kg × ${topSet.reps}`
    });
  }

  return series;
}

/**
 * Analyzes muscle balance within a given time window (e.g. 7d, 30d, 90d, or 0 for all).
 * Identifies worked muscles and flags neglected muscles (0 sets performed in period).
 */
export function getNeglectedMuscles(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  daysWindow: number = 7
): {
  worked: { muscle: MuscleGroup; sets: number; volumeKg: number }[];
  neglected: MuscleGroup[];
} {
  const cutoff = daysWindow > 0 ? Date.now() - daysWindow * 86400000 : 0;
  const inWindowSessions = history.filter(
    (s) => new Date(s.startedAt).getTime() >= cutoff
  );

  const distribution = calculateMuscleVolumeDistribution(inWindowSessions, exercisesById);

  const worked: { muscle: MuscleGroup; sets: number; volumeKg: number }[] = [];
  const neglected: MuscleGroup[] = [];

  for (const muscle of ALL_MUSCLE_GROUPS) {
    const data = distribution[muscle];
    if (data && data.sets > 0) {
      worked.push({ muscle, sets: data.sets, volumeKg: data.volumeKg });
    } else {
      neglected.push(muscle);
    }
  }

  worked.sort((a, b) => b.sets - a.sets);

  return { worked, neglected };
}

/**
 * Aggregates training volume grouped by primary muscle group.
 */
export function calculateMuscleVolumeDistribution(
  sessions: WorkoutSession[],
  exercisesById: Record<string, Exercise>
): Record<MuscleGroup, { volumeKg: number; sets: number }> {
  const result = {} as Record<MuscleGroup, { volumeKg: number; sets: number }>;

  for (const session of sessions) {
    for (const [exId, sets] of Object.entries(session.sets)) {
      const exercise = exercisesById[exId];
      if (!exercise) continue;

      const muscle = exercise.primaryMuscle;
      if (!result[muscle]) {
        result[muscle] = { volumeKg: 0, sets: 0 };
      }

      const completed = sets.filter((s) => s.completed && !s.isWarmup);
      const vol = calculateVolume(completed);

      result[muscle].volumeKg += vol;
      result[muscle].sets += completed.length;
    }
  }

  return result;
}

export interface MuscleFatigueResult {
  muscle: MuscleGroup;
  fatigueScore: number;
  status: 'fatigued' | 'recovering' | 'ready';
  recoveryPct: number;
  hoursSinceLastTrained: number | null;
  recentSetsCount: number;
  recentHardSetsCount: number;
}

/**
 * Calculates physiological fatigue per muscle group using volume, intensity (RIR),
 * and exponential time decay (tau = 28 hours).
 *
 * Sets near failure (RIR 0-1) incur high neuromuscular damage multiplier (1.6x - 2.0x),
 * while submaximal sets (RIR 3+) generate minimal fatigue (1.0x).
 * Secondary muscles receive 40% of the stimulus.
 */
export function calculateMuscleFatigue(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  nowMs: number = Date.now()
): Record<MuscleGroup, MuscleFatigueResult> {
  const result = {} as Record<MuscleGroup, MuscleFatigueResult>;

  for (const m of ALL_MUSCLE_GROUPS) {
    result[m] = {
      muscle: m,
      fatigueScore: 0,
      status: 'ready',
      recoveryPct: 100,
      hoursSinceLastTrained: null,
      recentSetsCount: 0,
      recentHardSetsCount: 0
    };
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  const WINDOW_HOURS = 96;
  const TAU_HOURS = 28;

  for (const session of sortedHistory) {
    const sessionMs = new Date(session.startedAt).getTime();
    const hoursAgo = Math.max(0, (nowMs - sessionMs) / (1000 * 60 * 60));
    if (hoursAgo > WINDOW_HOURS) continue;

    const timeDecay = Math.exp(-hoursAgo / TAU_HOURS);

    for (const [exId, sets] of Object.entries(session.sets)) {
      const exercise = exercisesById[exId];
      if (!exercise) continue;

      const completed = sets.filter((s) => s.completed && !s.isWarmup);
      if (completed.length === 0) continue;

      const primary = exercise.primaryMuscle;
      const secondaries = exercise.secondaryMuscles || [];

      for (const s of completed) {
        let intensityMult = 1.2;
        if (s.rir !== undefined) {
          if (s.rir <= 0) intensityMult = 2.0;
          else if (s.rir === 1) intensityMult = 1.6;
          else if (s.rir === 2) intensityMult = 1.3;
          else intensityMult = 1.0;
        } else if (s.rpe !== undefined) {
          if (s.rpe >= 10) intensityMult = 2.0;
          else if (s.rpe >= 9) intensityMult = 1.6;
          else if (s.rpe >= 8) intensityMult = 1.3;
          else intensityMult = 1.0;
        }

        const isHard = (s.rir !== undefined && s.rir <= 2) || (s.rpe !== undefined && s.rpe >= 8);

        // Update Primary
        if (result[primary]) {
          result[primary].fatigueScore += intensityMult * 1.0 * timeDecay;
          result[primary].recentSetsCount += 1;
          if (isHard) result[primary].recentHardSetsCount += 1;
          if (result[primary].hoursSinceLastTrained === null || hoursAgo < result[primary].hoursSinceLastTrained!) {
            result[primary].hoursSinceLastTrained = Math.round(hoursAgo);
          }
        }

        // Update Secondaries
        for (const sec of secondaries) {
          if (result[sec]) {
            result[sec].fatigueScore += intensityMult * 0.4 * timeDecay;
            result[sec].recentSetsCount += 0.4;
            if (isHard) result[sec].recentHardSetsCount += 0.4;
            if (result[sec].hoursSinceLastTrained === null || hoursAgo < result[sec].hoursSinceLastTrained!) {
              result[sec].hoursSinceLastTrained = Math.round(hoursAgo);
            }
          }
        }
      }
    }
  }

  // Finalize scores and recovery statuses
  for (const m of ALL_MUSCLE_GROUPS) {
    const item = result[m];
    item.fatigueScore = Math.round(item.fatigueScore * 10) / 10;
    item.recentSetsCount = Math.round(item.recentSetsCount);
    item.recentHardSetsCount = Math.round(item.recentHardSetsCount);

    if (item.fatigueScore >= 4.5) {
      item.status = 'fatigued';
      item.recoveryPct = Math.max(10, Math.round(50 - ((item.fatigueScore - 4.5) / 5) * 40));
    } else if (item.fatigueScore >= 1.8) {
      item.status = 'recovering';
      item.recoveryPct = 50 + Math.round(((4.5 - item.fatigueScore) / (4.5 - 1.8)) * 30);
    } else {
      item.status = 'ready';
      item.recoveryPct = item.fatigueScore > 0
        ? 80 + Math.round(((1.8 - item.fatigueScore) / 1.8) * 20)
        : 100;
    }
  }

  return result;
}
