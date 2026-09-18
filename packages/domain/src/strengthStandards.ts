import { MuscleGroup } from './types.js';

export type StrengthRank =
  | 'novato'
  | 'principiante'
  | 'gladiador'
  | 'elite'
  | 'maestro'
  | 'leyenda'
  | 'inmortal'
  | 'semidios'
  | 'dios';

export type StrengthRankIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const STRENGTH_RANKS: readonly StrengthRank[] = [
  'novato',
  'principiante',
  'gladiador',
  'elite',
  'maestro',
  'leyenda',
  'inmortal',
  'semidios',
  'dios'
] as const;

export type Gender = 'male' | 'female';

export interface StrengthStandardAnchors {
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

export interface StrengthEvaluation {
  version: 2;
  rank: StrengthRank;
  rankIndex: StrengthRankIndex;
  strengthScore: number;
  currentRatio: number;
  oneRmKg: number;
  bodyweightKg: number;
  nextRank: StrengthRank | null;
  targetRatio: number | null;
  targetOneRmKg: number | null;
  kgToNextRank: number | null;
  progressPctToNextRank: number;
}

export interface OverallStrengthEvaluation {
  version: 1;
  overallScore: number;
  rank: StrengthRank;
  rankIndex: StrengthRankIndex;
  nextRank: StrengthRank | null;
  progressPctToNextRank: number;
  ratedMuscleCount: number;
  totalMuscleCount: number;
  coveragePct: number;
  isComplete: boolean;
}

export const TOTAL_STRENGTH_MUSCLE_GROUPS = 11;

export const ALL_STRENGTH_MUSCLE_GROUPS: readonly MuscleGroup[] = [
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
] as const;

/**
 * Standard 1RM to Bodyweight ratio anchors inspired by StrengthLevel / ExRx standards.
 * Keyed by: Gender x MuscleGroup
 * Anchors: novice (N), intermediate (I), advanced (A), elite (E)
 */
export const STRENGTH_STANDARDS: Record<Gender, Record<MuscleGroup, StrengthStandardAnchors>> = {
  male: {
    chest: { novice: 0.85, intermediate: 1.25, advanced: 1.65, elite: 2.05 },
    quadriceps: { novice: 1.15, intermediate: 1.60, advanced: 2.10, elite: 2.60 },
    back: { novice: 1.35, intermediate: 1.90, advanced: 2.45, elite: 3.00 },
    shoulders: { novice: 0.55, intermediate: 0.80, advanced: 1.05, elite: 1.30 },
    hamstrings: { novice: 1.05, intermediate: 1.50, advanced: 1.95, elite: 2.40 },
    glutes: { novice: 1.30, intermediate: 1.85, advanced: 2.40, elite: 2.90 },
    biceps: { novice: 0.35, intermediate: 0.50, advanced: 0.68, elite: 0.85 },
    triceps: { novice: 0.40, intermediate: 0.60, advanced: 0.80, elite: 1.00 },
    calves: { novice: 1.10, intermediate: 1.60, advanced: 2.10, elite: 2.60 },
    core: { novice: 0.50, intermediate: 0.85, advanced: 1.20, elite: 1.55 },
    forearms: { novice: 0.30, intermediate: 0.45, advanced: 0.60, elite: 0.75 }
  },
  female: {
    chest: { novice: 0.50, intermediate: 0.75, advanced: 1.05, elite: 1.35 },
    quadriceps: { novice: 0.75, intermediate: 1.10, advanced: 1.50, elite: 1.90 },
    back: { novice: 0.90, intermediate: 1.35, advanced: 1.80, elite: 2.25 },
    shoulders: { novice: 0.35, intermediate: 0.50, advanced: 0.70, elite: 0.90 },
    hamstrings: { novice: 0.70, intermediate: 1.05, advanced: 1.40, elite: 1.75 },
    glutes: { novice: 1.10, intermediate: 1.65, advanced: 2.20, elite: 2.70 },
    biceps: { novice: 0.20, intermediate: 0.32, advanced: 0.45, elite: 0.58 },
    triceps: { novice: 0.25, intermediate: 0.38, advanced: 0.52, elite: 0.68 },
    calves: { novice: 0.80, intermediate: 1.20, advanced: 1.60, elite: 2.00 },
    core: { novice: 0.35, intermediate: 0.60, advanced: 0.90, elite: 1.20 },
    forearms: { novice: 0.20, intermediate: 0.30, advanced: 0.42, elite: 0.55 }
  }
};

/**
 * Derives the nine Light Weight product rank thresholds from the four standard anchors.
 *
 * T1 Novato: 0
 * T2 Principiante: N
 * T3 Gladiador: N + ((I - N) / 2)
 * T4 Élite: I
 * T5 Maestro: I + ((A - I) / 2)
 * T6 Leyenda: A
 * T7 Inmortal: A + ((E - A) / 2)
 * T8 Semidiós: E
 * T9 Dios: E + ((E - A) / 2)
 */
export function deriveStrengthRankThresholds(
  anchors: StrengthStandardAnchors
): Record<StrengthRank, number> {
  const N = anchors.novice;
  const I = anchors.intermediate;
  const A = anchors.advanced;
  const E = anchors.elite;

  return {
    novato: 0,
    principiante: N,
    gladiador: Math.round((N + (I - N) / 2) * 10000) / 10000,
    elite: I,
    maestro: Math.round((I + (A - I) / 2) * 10000) / 10000,
    leyenda: A,
    inmortal: Math.round((A + (E - A) / 2) * 10000) / 10000,
    semidios: E,
    dios: Math.round((E + (E - A) / 2) * 10000) / 10000
  };
}

/**
 * Evaluates a lifter's relative strength on a given muscle group compared to
 * their bodyweight and biological gender using Light Weight's nine-rank system.
 */
export function evaluateRelativeStrength(
  muscle: MuscleGroup,
  oneRmKg: number,
  bodyweightKg: number,
  gender?: Gender
): StrengthEvaluation | undefined {
  if (!gender || (gender !== 'male' && gender !== 'female')) {
    return undefined;
  }
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) {
    return undefined;
  }
  if (!Number.isFinite(oneRmKg) || oneRmKg <= 0) {
    return undefined;
  }

  const safeBw = Math.max(30, bodyweightKg);
  // Calculate unrounded internal ratio:
  const ratio = oneRmKg / safeBw;

  const anchors = STRENGTH_STANDARDS[gender]?.[muscle] ?? STRENGTH_STANDARDS.male[muscle];
  const thresholds = deriveStrengthRankThresholds(anchors);

  let rank: StrengthRank;
  let rankIndex: StrengthRankIndex;
  let nextRank: StrengthRank | null;
  let currentThreshold: number;
  let nextThreshold: number | null;

  if (ratio >= thresholds.dios) {
    rank = 'dios';
    rankIndex = 9;
    nextRank = null;
    currentThreshold = thresholds.dios;
    nextThreshold = null;
  } else if (ratio >= thresholds.semidios) {
    rank = 'semidios';
    rankIndex = 8;
    nextRank = 'dios';
    currentThreshold = thresholds.semidios;
    nextThreshold = thresholds.dios;
  } else if (ratio >= thresholds.inmortal) {
    rank = 'inmortal';
    rankIndex = 7;
    nextRank = 'semidios';
    currentThreshold = thresholds.inmortal;
    nextThreshold = thresholds.semidios;
  } else if (ratio >= thresholds.leyenda) {
    rank = 'leyenda';
    rankIndex = 6;
    nextRank = 'inmortal';
    currentThreshold = thresholds.leyenda;
    nextThreshold = thresholds.inmortal;
  } else if (ratio >= thresholds.maestro) {
    rank = 'maestro';
    rankIndex = 5;
    nextRank = 'leyenda';
    currentThreshold = thresholds.maestro;
    nextThreshold = thresholds.leyenda;
  } else if (ratio >= thresholds.elite) {
    rank = 'elite';
    rankIndex = 4;
    nextRank = 'maestro';
    currentThreshold = thresholds.elite;
    nextThreshold = thresholds.maestro;
  } else if (ratio >= thresholds.gladiador) {
    rank = 'gladiador';
    rankIndex = 3;
    nextRank = 'elite';
    currentThreshold = thresholds.gladiador;
    nextThreshold = thresholds.elite;
  } else if (ratio >= thresholds.principiante) {
    rank = 'principiante';
    rankIndex = 2;
    nextRank = 'gladiador';
    currentThreshold = thresholds.principiante;
    nextThreshold = thresholds.gladiador;
  } else {
    rank = 'novato';
    rankIndex = 1;
    nextRank = 'principiante';
    currentThreshold = thresholds.novato;
    nextThreshold = thresholds.principiante;
  }

  let strengthScore: number;
  let progressPctToNextRank: number;
  let targetRatio: number | null = null;
  let targetOneRmKg: number | null = null;
  let kgToNextRank: number | null = null;

  if (rank === 'dios' || nextThreshold === null) {
    strengthScore = 9.0;
    progressPctToNextRank = 100;
  } else {
    const span = nextThreshold - currentThreshold;
    const fraction = span > 0
      ? Math.min(1, Math.max(0, (ratio - currentThreshold) / span))
      : 1;

    strengthScore = Math.min(9.0, Math.max(1.0, rankIndex + fraction));
    progressPctToNextRank = Math.min(100, Math.max(0, Math.round(fraction * 100)));

    targetRatio = nextThreshold;
    targetOneRmKg = Math.round(nextThreshold * safeBw * 10) / 10;
    kgToNextRank = Math.max(0, Math.round((targetOneRmKg - oneRmKg) * 10) / 10);
  }

  return {
    version: 2,
    rank,
    rankIndex,
    strengthScore,
    currentRatio: ratio,
    oneRmKg,
    bodyweightKg,
    nextRank,
    targetRatio,
    targetOneRmKg,
    kgToNextRank,
    progressPctToNextRank
  };
}

/**
 * Calculates the Overall Strength evaluation by taking the arithmetic mean of
 * strengthScore across all rated muscles.
 *
 * Rules:
 * - 0 rated muscles -> returns null
 * - 1-10 rated muscles -> provisional (isComplete = false)
 * - 11 rated muscles -> complete (isComplete = true)
 * - Unrated muscles are excluded from the mean (NOT treated as Novato)
 */
export function calculateOverallStrength(
  evaluations: Partial<Record<MuscleGroup, StrengthEvaluation | undefined>>
): OverallStrengthEvaluation | null {
  const rated = Object.values(evaluations).filter(
    (ev): ev is StrengthEvaluation => ev !== undefined && ev !== null && ev.version === 2
  );

  const ratedMuscleCount = rated.length;
  if (ratedMuscleCount === 0) {
    return null;
  }

  const totalMuscleCount = TOTAL_STRENGTH_MUSCLE_GROUPS;
  const coveragePct = Math.round((ratedMuscleCount / totalMuscleCount) * 100);
  const isComplete = ratedMuscleCount === totalMuscleCount;

  const scoreSum = rated.reduce((acc, ev) => acc + ev.strengthScore, 0);
  const rawMean = scoreSum / ratedMuscleCount;
  const overallScore = Math.min(9.0, Math.max(1.0, rawMean));

  let rank: StrengthRank;
  let rankIndex: StrengthRankIndex;
  let nextRank: StrengthRank | null;
  let progressPctToNextRank: number;

  if (overallScore >= 9.0) {
    rank = 'dios';
    rankIndex = 9;
    nextRank = null;
    progressPctToNextRank = 100;
  } else {
    rankIndex = Math.min(8, Math.max(1, Math.floor(overallScore))) as StrengthRankIndex;
    rank = STRENGTH_RANKS[rankIndex - 1];
    nextRank = STRENGTH_RANKS[rankIndex];
    const fraction = overallScore - rankIndex;
    progressPctToNextRank = Math.min(100, Math.max(0, Math.round(fraction * 100)));
  }

  return {
    version: 1,
    overallScore,
    rank,
    rankIndex,
    nextRank,
    progressPctToNextRank,
    ratedMuscleCount,
    totalMuscleCount,
    coveragePct,
    isComplete
  };
}
