import type { Exercise, LoggedSet } from '@light-weight/domain';
import type { WeightInputMode } from '../../lib/preferences.js';

export interface ActiveExerciseSession {
  exercise: Exercise;
  previousRecord?: string;
  bestRecord?: string;
  bestEst1Rm?: number;
  targetRepRange: [number, number];
  weightInputModeOverride?: WeightInputMode;
  usesAddedWeight?: boolean;
  includeBarWeight?: boolean;
  /** Session-level selected equipment base, e.g. 20 lb or 22 lb Smith rail. */
  plateBaseWeightKg?: number;
  skipped?: boolean;
  sets: (LoggedSet & { rir?: number })[];
}
