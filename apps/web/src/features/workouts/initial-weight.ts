/** Previous valid user performance wins; semantic fallback stays conservative. */
export function resolveInitialWeightKg(previousWeightKg: number | undefined, semanticDefaultWeightKg: number): number {
  return Number.isFinite(previousWeightKg) && (previousWeightKg as number) >= 0
    ? previousWeightKg as number
    : Math.max(0, Number.isFinite(semanticDefaultWeightKg) ? semanticDefaultWeightKg : 0);
}
