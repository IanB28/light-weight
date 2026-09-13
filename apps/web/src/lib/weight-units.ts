import { getPlateLoadMultiplier, kilogramsToPounds, poundsToKilograms } from '@light-weight/domain';
import type { ExerciseLoadingProfile } from '@light-weight/domain';
import type { UnitSystem } from './preferences.js';

export interface WeightUnitPreset {
  unit: 'kg' | 'lb';
  barWeightKg: number;
  platesKg: number[];
}

const poundsPreset = (valueLb: number) => poundsToKilograms(valueLb);

export const WEIGHT_UNIT_PRESETS: Record<UnitSystem, WeightUnitPreset> = {
  metric: {
    unit: 'kg',
    barWeightKg: 20,
    platesKg: [25, 20, 15, 10, 5, 2.5, 1.25]
  },
  imperial: {
    unit: 'lb',
    barWeightKg: poundsPreset(45),
    platesKg: [45, 35, 25, 10, 5, 2.5].map(poundsPreset)
  }
};

const roundDisplayWeight = (value: number, units: UnitSystem) => {
  const precision = units === 'imperial' ? 10 : 100;
  return Math.round(value * precision) / precision;
};

export function displayWeight(weightKg: number, units: UnitSystem): number {
  const value = units === 'imperial' ? kilogramsToPounds(weightKg) : weightKg;
  return roundDisplayWeight(Number.isFinite(value) ? value : 0, units);
}

export function parseDisplayWeight(value: number, units: UnitSystem): number {
  if (!Number.isFinite(value)) return 0;
  const weightKg = units === 'imperial' ? poundsToKilograms(value) : value;
  return Math.round(Math.max(0, weightKg) * 100_000) / 100_000;
}

export function formatDisplayWeight(weightKg: number, units: UnitSystem): string {
  return `${displayWeight(weightKg, units)} ${WEIGHT_UNIT_PRESETS[units].unit}`;
}

export function weightsMatch(left: number, right: number, toleranceKg = 0.02): boolean {
  return Math.abs(left - right) <= toleranceKg;
}

export function plateListsMatch(left: number[], right: number[], toleranceKg = 0.02): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort((a, b) => b - a);
  const rightSorted = [...right].sort((a, b) => b - a);
  return leftSorted.every((plate, index) => weightsMatch(plate, rightSorted[index], toleranceKg));
}

export function usesUnitDefaults(barWeightKg: number, platesKg: number[], units: UnitSystem): boolean {
  const preset = WEIGHT_UNIT_PRESETS[units];
  return weightsMatch(barWeightKg, preset.barWeightKg) && plateListsMatch(platesKg, preset.platesKg);
}

export function getDefaultPlateLoadedWeightKg(
  units: UnitSystem,
  barWeightKg: number,
  availablePlatesKg: number[],
  loading: ExerciseLoadingProfile
): number {
  const preferredPlateDisplayWeight = units === 'imperial' ? 45 : 20;
  const preferredPlate = availablePlatesKg.find(
    (plate) => weightsMatch(displayWeight(plate, units), preferredPlateDisplayWeight, 0.02)
  );
  const platePerSide = preferredPlate ?? availablePlatesKg[0] ?? 0;
  return Math.round((barWeightKg + (getPlateLoadMultiplier(loading) * platePerSide)) * 100_000) / 100_000;
}
