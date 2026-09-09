/**
 * Effort scale conversions: RIR (Reps in Reserve) and RPE (Rate of Perceived Exertion).
 *
 * Relationship: RPE = 10 - RIR
 * Examples:
 * RIR 0 -> RPE 10 (Maximum effort / failure)
 * RIR 1 -> RPE 9 (1 rep left in reserve)
 * RIR 2 -> RPE 8 (2 reps left in reserve)
 * RIR 3 -> RPE 7 (3 reps left in reserve)
 * RIR 4 -> RPE 6 (warmup / speed work)
 */

export function rirToRpe(rir: number): number {
  const bounded = Math.max(0, Math.min(5, rir));
  return 10 - bounded;
}

export function rpeToRir(rpe: number): number {
  const bounded = Math.max(5, Math.min(10, rpe));
  return 10 - bounded;
}

export function formatEffort(rir?: number, rpe?: number): string {
  if (rir !== undefined) return `RIR ${rir}`;
  if (rpe !== undefined) return `@${rpe}`;
  return '—';
}
