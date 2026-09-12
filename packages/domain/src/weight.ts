export const KG_PER_LB = 0.45359237;

export function calculateLoadedBarWeight(barWeightKg: number, platesPerSideKg: number[]): number {
  const safeBar = Number.isFinite(barWeightKg) ? Math.max(0, barWeightKg) : 0;
  const plates = platesPerSideKg.reduce(
    (sum, plate) => sum + (Number.isFinite(plate) ? Math.max(0, plate) : 0),
    0
  );
  return Math.round((safeBar + 2 * plates) * 100) / 100;
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
