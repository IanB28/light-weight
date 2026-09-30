import {
  evaluateRelativeStrength,
  resolveExerciseLoadingProfile,
  resolveExerciseStrengthTarget,
  type Exercise,
  type FeaturedRepPerformance,
  type Gender,
  type StrengthRank
} from '@light-weight/domain';
import { formatDisplayWeight } from '../../lib/weight-units.js';

export function resolveFeaturedPrRank(
  exercise: Exercise,
  performance: FeaturedRepPerformance | null,
  currentBodyweightKg: number | null | undefined,
  gender: Gender | undefined
): StrengthRank | null {
  const target = resolveExerciseStrengthTarget(exercise);
  const evaluationBodyweightKg = performance?.bodyweightKg ?? currentBodyweightKg ?? null;
  if (!performance || !target || evaluationBodyweightKg === null || !gender) return null;
  return evaluateRelativeStrength(
    target,
    performance.canonicalOneRmKg,
    evaluationBodyweightKg,
    gender
  )?.rank ?? null;
}

export function formatFeaturedPerformanceLoad(
  exercise: Exercise,
  performance: FeaturedRepPerformance,
  units: 'metric' | 'imperial'
): string {
  const profile = resolveExerciseLoadingProfile(exercise).profile;
  if (typeof profile.bodyweightFactor === 'number' && performance.set.weightKg === 0) return 'BW';
  const formatted = formatDisplayWeight(Math.abs(performance.set.weightKg), units);
  if (profile.loadMode === 'assisted') return `-${formatted}`;
  if (profile.loadMode === 'added_weight') return `+${formatted}`;
  return formatted;
}
