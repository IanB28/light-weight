import type { LoggedSet, MuscleGroup, ProgressionPolicy } from './types.js';

export const DELOAD_FACTOR = 0.9;
export const MAX_BODYWEIGHT_SETS = 6;

const HEAVY_MUSCLES: MuscleGroup[] = ['quadriceps', 'hamstrings', 'glutes', 'back'];

/**
 * Returns default load increment in kg:
 * - Lower body & heavy compound movements: 5.0 kg
 * - Upper body & isolation movements: 2.5 kg
 */
export function defaultIncrement(primaryMuscle: MuscleGroup): number {
  return HEAVY_MUSCLES.includes(primaryMuscle) ? 5.0 : 2.5;
}

/**
 * Snaps a weight value to the nearest loadable plate step.
 */
export function snapToStep(weightKg: number, stepKg: number): number {
  if (stepKg <= 0) return Math.round(weightKg * 10) / 10;
  return Math.round(Math.round(weightKg / stepKg) * stepKg * 10) / 10;
}

/**
 * Calculates a deload weight (10% reduction), snapping to a loadable plate step.
 */
export function calculateDeload(currentWeightKg: number, stepKg: number = 2.5): number {
  if (currentWeightKg <= stepKg) return currentWeightKg;
  let next = snapToStep(currentWeightKg * DELOAD_FACTOR, stepKg);
  if (next >= currentWeightKg) next = snapToStep(currentWeightKg - stepKg, stepKg);
  return Math.max(stepKg, next);
}

/**
 * Calculates the total training volume (reps * weight) for completed working sets.
 */
export function calculateVolume(sets: LoggedSet[]): number {
  return sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((total, s) => total + s.weightKg * s.reps, 0);
}

/**
 * Checks if all working sets reached or exceeded the target rep threshold.
 */
export function checkProgressionTarget(
  sets: LoggedSet[],
  targetSets: number,
  targetReps: number
): boolean {
  const workingSets = sets.filter((s) => s.completed && !s.isWarmup);
  if (workingSets.length < targetSets) return false;
  return workingSets.slice(0, targetSets).every((s) => s.reps >= targetReps);
}

/**
 * Evaluates the next recommended prescription given completed sets and policy.
 */
export function evaluateNextWeight(
  currentWeightKg: number,
  sets: LoggedSet[],
  targetSets: number,
  targetReps: number,
  primaryMuscle: MuscleGroup,
  consecutiveStalls: number = 0,
  policy: ProgressionPolicy = 'double'
): { nextWeightKg: number; nextReps: number; reason: string; isDeload: boolean } {
  const inc = defaultIncrement(primaryMuscle);

  if (policy === 'off') {
    return {
      nextWeightKg: currentWeightKg,
      nextReps: targetReps,
      reason: 'Progresión automática desactivada.',
      isDeload: false
    };
  }

  const success = checkProgressionTarget(sets, targetSets, targetReps);

  if (success) {
    return {
      nextWeightKg: currentWeightKg + inc,
      nextReps: targetReps,
      reason: `¡Objetivo cumplido! Incremento de +${inc} kg para la próxima sesión.`,
      isDeload: false
    };
  }

  // Check deload trigger (after 3 consecutive missed targets)
  if (consecutiveStalls >= 2) {
    const deloaded = calculateDeload(currentWeightKg, inc);
    return {
      nextWeightKg: deloaded,
      nextReps: targetReps,
      reason: `3 sesiones sin completar reps. Descarga técnica del 10% a ${deloaded} kg.`,
      isDeload: true
    };
  }

  return {
    nextWeightKg: currentWeightKg,
    nextReps: targetReps,
    reason: `Repeticiones incompletas. Mantén ${currentWeightKg} kg hasta consolidar todas las series.`,
    isDeload: false
  };
}
