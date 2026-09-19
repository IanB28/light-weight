/**
 * Effort scale conversions and validators: RIR (Reps in Reserve) and RPE (Rate of Perceived Exertion).
 *
 * Relationship: RPE = 10 - RIR
 * Examples:
 * RIR 0 -> RPE 10 (Maximum effort / failure)
 * RIR 1 -> RPE 9 (1 rep left in reserve)
 * RIR 2 -> RPE 8 (2 reps left in reserve)
 * RIR 3 -> RPE 7 (3 reps left in reserve)
 * RIR 4 -> RPE 6 (warmup / speed work)
 * RIR >= 6 -> 6+ effort bucket (FEU coefficient 0.10)
 */

/**
 * Validates whether a value is a valid physical RIR fact:
 * - must be a number
 * - must be finite
 * - must be non-negative (>= 0)
 * - must be an integer
 *
 * Note: Does not invent an arbitrary upper limit. RIR >= 6 is valid and preserved.
 */
export function isValidRirValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

/**
 * Returns the valid RIR number or undefined if invalid/missing.
 */
export function normalizeRirValue(value: unknown): number | undefined {
  return isValidRirValue(value) ? value : undefined;
}

/**
 * Validates whether a value is a valid physical RPE fact:
 * - must be a number
 * - must be finite
 * - must be between 0 and 10 (inclusive)
 * - decimal values (e.g. 7.5, 8.5) are valid
 */
export function isValidRpeValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
}

/**
 * Returns the valid RPE number or undefined if invalid/missing.
 */
export function normalizeRpeValue(value: unknown): number | undefined {
  return isValidRpeValue(value) ? value : undefined;
}

/**
 * Converts RIR to equivalent RPE.
 * Note: Uses linear mapping RPE = 10 - RIR bounded between 0 and 10.
 */
export function rirToRpe(rir: number): number {
  const bounded = Math.max(0, Math.min(10, rir));
  return 10 - bounded;
}

/**
 * Converts RPE to equivalent RIR.
 * Note: Uses linear mapping RIR = 10 - RPE bounded between 0 and 10.
 */
export function rpeToRir(rpe: number): number {
  const bounded = Math.max(0, Math.min(10, rpe));
  return 10 - bounded;
}

/**
 * Formats effort for display.
 * RIR takes precedence over RPE.
 * RIR >= 6 formats as 'RIR 6+' (or exact if < 6).
 * Returns '—' for undefined or malformed effort.
 */
export function formatEffort(rir?: number, rpe?: number): string {
  if (isValidRirValue(rir)) {
    return rir >= 6 ? 'RIR 6+' : `RIR ${rir}`;
  }
  if (isValidRpeValue(rpe)) {
    return `@${rpe}`;
  }
  return '—';
}
