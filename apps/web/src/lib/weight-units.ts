import { Exercise, kilogramsToPounds, poundsToKilograms } from '@light-weight/domain';
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

export type WeightEntryCapability = 'plates-only' | 'keyboard-and-plates' | 'added-weight';
export type PlateLoadScope = 'barbell' | 'per-side' | 'total';

const UNILATERAL_NAME_PATTERN = /\b(?:unilateral|one[ -]?(?:arm|hand|leg|foot)|single[ -]?(?:arm|hand|leg|foot)|alternat(?:e|ed|ing)|un[ -]?brazo|una[ -]?(?:mano|pierna)|altern(?:o|a|ado|ada))\b/i;
const UNILATERAL_INSTRUCTION_PATTERN = /\b(?:one (?:arm|hand|leg|foot) at a time|repeat (?:with|on) the other (?:arm|hand|leg|foot|side)|switch (?:arms|hands|legs|feet|sides)|each (?:arm|hand|leg|foot)|opposite (?:arm|hand|leg|foot))\b/i;

export function isUnilateralExercise(
  exercise: Pick<Exercise, 'name' | 'instructions'>
): boolean {
  if (UNILATERAL_NAME_PATTERN.test(exercise.name)) return true;
  return UNILATERAL_INSTRUCTION_PATTERN.test((exercise.instructions || []).join(' '));
}

export function getPlateLoadScope(
  exercise: Pick<Exercise, 'category' | 'name' | 'instructions'>
): PlateLoadScope {
  if (exercise.category === 'barbell') return 'barbell';
  return isUnilateralExercise(exercise) ? 'per-side' : 'total';
}

export function getWeightEntryCapability(category: string): WeightEntryCapability {
  if (category === 'barbell') return 'plates-only';
  if (category === 'bodyweight') return 'added-weight';
  return 'keyboard-and-plates';
}

export function getDefaultPlateLoadedWeightKg(
  units: UnitSystem,
  barWeightKg: number,
  availablePlatesKg: number[],
  plateMultiplier = 2
): number {
  const preferredPlateDisplayWeight = units === 'imperial' ? 45 : 20;
  const preferredPlate = availablePlatesKg.find(
    (plate) => weightsMatch(displayWeight(plate, units), preferredPlateDisplayWeight, 0.02)
  );
  const platePerSide = preferredPlate ?? availablePlatesKg[0] ?? 0;
  const safeMultiplier = plateMultiplier === 1 ? 1 : 2;
  return Math.round((barWeightKg + (safeMultiplier * platePerSide)) * 100_000) / 100_000;
}
