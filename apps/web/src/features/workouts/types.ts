import type { Exercise, LoggedSet, BaseResistanceStatus } from '@light-weight/domain';
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
  /** Active selected machine profile ID (if plate-loaded / machine base). */
  machineProfileId?: string;
  /** Active selected machine profile label (if plate-loaded / machine base). */
  machineProfileLabel?: string;
  /** Active selected machine base starting resistance in kg. */
  machineBaseResistanceKg?: number;
  /** Active selected machine base resistance status. */
  machineBaseResistanceStatus?: BaseResistanceStatus;
  /** Active selected machine base source label. */
  machineBaseSourceLabel?: string;
  /** Active selected machine base source URL. */
  machineBaseSourceUrl?: string;
  /** Active selected machine manufacturer. */
  machineManufacturer?: string;
  /** Active selected machine model. */
  machineModel?: string;
  skipped?: boolean;
  sets: (LoggedSet & { rir?: number })[];
}
