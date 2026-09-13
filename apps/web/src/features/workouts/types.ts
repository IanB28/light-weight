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
  sets: (LoggedSet & { rir?: number })[];
}
