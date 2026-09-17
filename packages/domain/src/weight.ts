export const KG_PER_LB = 0.45359237;

export function calculateLoadedBarWeight(
  barWeightKg: number,
  platesPerSideKg: number[],
  plateMultiplier = 2
): number {
  const safeBar = Number.isFinite(barWeightKg) ? Math.max(0, barWeightKg) : 0;
  const safeMultiplier = plateMultiplier === 1 ? 1 : 2;
  const plates = platesPerSideKg.reduce(
    (sum, plate) => sum + (Number.isFinite(plate) ? Math.max(0, plate) : 0),
    0
  );
  return Math.round((safeBar + safeMultiplier * plates) * 100) / 100;
}

export function kilogramsToPounds(weightKg: number): number {
  return Number.isFinite(weightKg) ? weightKg / KG_PER_LB : 0;
}

export function poundsToKilograms(weightLb: number): number {
  return Number.isFinite(weightLb) ? weightLb * KG_PER_LB : 0;
}

export function normalizeWeightKg(weightKg: number): number {
  return Number.isFinite(weightKg) ? Math.round(Math.max(0, weightKg) * 100) / 100 : 0;
}

export interface PlateDecomposition {
  counts: Record<string, number>;
  isExact: boolean;
}

export function decomposeLoadedBarWeight(
  totalWeightKg: number,
  barWeightKg: number,
  availablePlatesKg: number[],
  toleranceKg = 0.02,
  plateMultiplier = 2
): PlateDecomposition {
  const total = normalizeWeightKg(totalWeightKg);
  const bar = normalizeWeightKg(barWeightKg);
  const safeMultiplier = plateMultiplier === 1 ? 1 : 2;
  const counts: Record<string, number> = {};

  if (total < bar - toleranceKg) return { counts, isExact: false };

  const remainingPerSide = Math.max(0, (total - bar) / safeMultiplier);
  const plates = Array.from(new Set(availablePlatesKg))
    .filter((plate) => Number.isFinite(plate) && plate > 0)
    .sort((a, b) => b - a);

  const failed = new Set<string>();
  const findExactCounts = (index: number, remaining: number): Record<string, number> | null => {
    if (remaining <= toleranceKg) return {};
    if (index >= plates.length) return null;
    const memoKey = `${index}:${Math.round(remaining * 1000)}`;
    if (failed.has(memoKey)) return null;

    const plate = plates[index];
    const maxCount = Math.floor((remaining + toleranceKg) / plate);
    for (let count = maxCount; count >= 0; count -= 1) {
      const result = findExactCounts(index + 1, remaining - count * plate);
      if (result) return count > 0 ? { [String(plate)]: count, ...result } : result;
    }
    failed.add(memoKey);
    return null;
  };

  const exactCounts = findExactCounts(0, remainingPerSide);
  if (exactCounts) Object.assign(counts, exactCounts);

  return {
    counts,
    isExact: exactCounts !== null
  };
}

export interface BodyweightEntryLike {
  date: string;
  weightKg: number;
}

export type BodyweightEntry = BodyweightEntryLike;

/**
 * Resolves the relevant bodyweight (in kg) at a specific workout date.
 *
 * Rules:
 * - Active workout (no date provided): latest known valid bodyweight.
 * - Historical session (date provided): latest valid bodyweight entry whose date <= workout date.
 * - If no eligible historical entry exists: returns null (does NOT invent a fallback weight).
 */
export function resolveBodyweightKgAtDate(
  entries: readonly BodyweightEntryLike[] | undefined | null,
  workoutDate?: string | null
): number | null {
  if (!entries || entries.length === 0) return null;

  const validEntries = entries.filter(
    (e) => Number.isFinite(e.weightKg) && e.weightKg > 0 && typeof e.date === 'string'
  );
  if (validEntries.length === 0) return null;

  const sorted = [...validEntries].sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)));

  if (!workoutDate) {
    return sorted[sorted.length - 1].weightKg;
  }

  const targetDay = workoutDate.slice(0, 10);
  const eligible = sorted.filter((entry) => entry.date.slice(0, 10) <= targetDay);
  if (eligible.length === 0) return null;

  return eligible[eligible.length - 1].weightKg;
}
