import type { OneRmEstimate } from './types.js';

/**
 * Calculates 1 Rep Max using the Epley formula:
 * 1RM = weight * (1 + reps / 30)
 */
export function calculateEpley(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  const result = weightKg * (1 + reps / 30);
  return Math.round(result * 10) / 10;
}

/**
 * Calculates 1 Rep Max using the Brzycki formula:
 * 1RM = weight * (36 / (37 - reps))
 */
export function calculateBrzycki(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  if (reps >= 37) return weightKg;
  const result = weightKg * (36 / (37 - reps));
  return Math.round(result * 10) / 10;
}

/**
 * Estimates 1RM combining multiple proven formulas.
 */
export function estimateOneRm(weightKg: number, reps: number): OneRmEstimate {
  const epley = calculateEpley(weightKg, reps);
  const brzycki = calculateBrzycki(weightKg, reps);
  const average = Math.round(((epley + brzycki) / 2) * 10) / 10;

  return { epley, brzycki, average };
}
