import type { Exercise, LoggedSet, OneRmEstimate, OneRmFormula, BestSetRecord } from './types.js';
import { calculateEffectiveLoadKg, shouldCountForPersonalRecord } from './setSemantics.js';

export interface SetOneRmOptions {
  exercise?: Pick<Exercise, 'id' | 'category' | 'name' | 'instructions' | 'loading'> | null;
  bodyweightKg?: number | null;
  formula?: OneRmFormula | 'average';
}

import { REP_CAP } from './oneRmConstants.js';

export { REP_CAP };

export const FORMULAS: Record<OneRmFormula, (w: number, r: number) => number> = {
  // Epley 1985 — w * (1 + r / 30)
  epley: (w: number, r: number) => w * (1 + r / 30),
  // Brzycki 1993 — w * 36 / (37 - r)
  brzycki: (w: number, r: number) => (r >= 37 ? w : (w * 36) / (37 - r)),
  // Lombardi 1989 — w * r^0.10
  lombardi: (w: number, r: number) => w * Math.pow(r, 0.1)
};

export const DEFAULT_FORMULA: OneRmFormula = 'epley';

/**
 * Estimates 1RM for a single set.
 * Returns null if weight <= 0, reps < 1, or reps > REP_CAP (12).
 * Exactly 1 rep is the measurement itself, so it returns weight directly.
 */
export function estimate1RM(
  weightKg: number,
  reps: number,
  formula: OneRmFormula = DEFAULT_FORMULA
): number | null {
  const w = Number(weightKg);
  const r = Number(reps);

  if (!Number.isFinite(w) || !Number.isFinite(r)) return null;
  if (w <= 0 || r < 1) return null;
  if (r > REP_CAP) return null;
  if (r === 1) return Math.round(w * 10) / 10;

  const fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA];
  const est = fn(w, Math.round(r));

  if (!Number.isFinite(est) || est <= 0) return null;
  return Math.round(est * 10) / 10;
}

/**
 * Calculates Epley 1RM.
 */
export function calculateEpley(weightKg: number, reps: number): number {
  const est = estimate1RM(weightKg, reps, 'epley');
  return est ?? 0;
}

/**
 * Calculates Brzycki 1RM.
 */
export function calculateBrzycki(weightKg: number, reps: number): number {
  const est = estimate1RM(weightKg, reps, 'brzycki');
  return est ?? 0;
}

/**
 * Calculates Lombardi 1RM.
 */
export function calculateLombardi(weightKg: number, reps: number): number {
  const est = estimate1RM(weightKg, reps, 'lombardi');
  return est ?? 0;
}

/**
 * Calculates estimated 1RM for a single set using its mechanical effective load.
 *
 * Returns null if effective load is <= 0 or reps are outside valid estimation bounds (reps > 12).
 */
export function calculateSetOneRm(
  set: Pick<LoggedSet, 'weightKg' | 'reps'>,
  options?: SetOneRmOptions
): number | null {
  const effectiveLoad = options?.exercise
    ? calculateEffectiveLoadKg({
        exercise: options.exercise,
        setWeightKg: set.weightKg,
        bodyweightKg: options.bodyweightKg
      })
    : set.weightKg;

  if (effectiveLoad <= 0) return null;
  if (options?.formula === 'average') {
    const est = estimateOneRm(effectiveLoad, set.reps);
    return est.average > 0 ? est.average : null;
  }
  return estimate1RM(effectiveLoad, set.reps, options?.formula ?? DEFAULT_FORMULA);
}

/**
 * Canonical helper for athlete-facing strength 1RM evaluation.
 * Evaluates the mechanical effective load using the 3-formula calculator average.
 *
 * Invariants:
 * - For reps === 1: collapses directly to the exact mechanical effective load.
 * - For reps 2..12: returns the exact 3-formula calculator average (no Epley divergence).
 * - For reps > 12 or effective load <= 0: returns null.
 */
export function calculateCanonicalStrengthOneRm(
  set: Pick<LoggedSet, 'weightKg' | 'reps'>,
  options?: Pick<SetOneRmOptions, 'exercise' | 'bodyweightKg'>
): number | null {
  return calculateSetOneRm(set, {
    exercise: options?.exercise,
    bodyweightKg: options?.bodyweightKg,
    formula: 'average'
  });
}

/**
 * Full estimate across all 3 formulas and average using effective mechanical load.
 */
export function estimateSetOneRm(
  set: Pick<LoggedSet, 'weightKg' | 'reps'>,
  options?: SetOneRmOptions
): OneRmEstimate {
  const effectiveLoad = options?.exercise
    ? calculateEffectiveLoadKg({
        exercise: options.exercise,
        setWeightKg: set.weightKg,
        bodyweightKg: options.bodyweightKg
      })
    : set.weightKg;

  if (effectiveLoad <= 0) {
    return { epley: 0, brzycki: 0, lombardi: 0, average: 0 };
  }
  return estimateOneRm(effectiveLoad, set.reps);
}

/**
 * Full estimate across all 3 formulas and their average.
 */
export function estimateOneRm(weightKg: number, reps: number): OneRmEstimate {
  const epley = calculateEpley(weightKg, reps);
  const brzycki = calculateBrzycki(weightKg, reps);
  const lombardi = calculateLombardi(weightKg, reps);
  const count = (epley ? 1 : 0) + (brzycki ? 1 : 0) + (lombardi ? 1 : 0);
  const average = count > 0 ? Math.round(((epley + brzycki + lombardi) / count) * 10) / 10 : 0;

  return { epley, brzycki, lombardi, average };
}

/**
 * Finds the best 1RM set in a list of logged sets.
 */
export function bestSetOf(
  sets: LoggedSet[],
  formula: OneRmFormula = DEFAULT_FORMULA
): BestSetRecord | null {
  let best: BestSetRecord | null = null;

  for (const s of sets) {
    if (!shouldCountForPersonalRecord(s)) continue;
    const est = estimate1RM(s.weightKg, s.reps, formula);
    if (est !== null && (!best || est > best.est)) {
      best = { est, w: s.weightKg, r: Math.round(s.reps) };
    }
  }

  return best;
}

/**
 * Checks if a current set achieves a new personal record (PR) compared to past best.
 */
export function is1RMRecord(
  previousBestEst: number | null,
  currentSet: LoggedSet,
  formula: OneRmFormula = DEFAULT_FORMULA
): { isPr: boolean; newEst: number; diff: number } | null {
  if (!shouldCountForPersonalRecord(currentSet)) return null;
  const currentEst = estimate1RM(currentSet.weightKg, currentSet.reps, formula);
  if (currentEst === null) return null;

  if (previousBestEst === null || previousBestEst === 0) {
    return { isPr: true, newEst: currentEst, diff: currentEst };
  }

  if (currentEst > previousBestEst) {
    return {
      isPr: true,
      newEst: currentEst,
      diff: Math.round((currentEst - previousBestEst) * 10) / 10
    };
  }

  return { isPr: false, newEst: currentEst, diff: 0 };
}
