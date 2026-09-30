import { resolveExerciseLoadingProfile, type Exercise, type FeaturedPrVariant } from '@light-weight/domain';
import { formatDisplayWeight } from '../../lib/weight-units.js';

export function formatFeaturedVariantLoad(
  exercise: Exercise,
  variant: Pick<FeaturedPrVariant, 'loadWeightKg'>,
  units: 'metric' | 'imperial'
): string {
  const profile = resolveExerciseLoadingProfile(exercise).profile;
  if (typeof profile.bodyweightFactor === 'number' && variant.loadWeightKg === 0) return 'BW';
  const formatted = formatDisplayWeight(Math.abs(variant.loadWeightKg), units);
  if (profile.loadMode === 'assisted') return `-${formatted}`;
  if (profile.loadMode === 'added_weight') return `+${formatted}`;
  return formatted;
}
