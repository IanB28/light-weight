import type { Exercise, ExerciseCategory, MuscleGroup } from './types.js';
import { resolveExerciseLoadingProfile } from './exerciseLoading.js';

export interface RawDatasetExercise {
  id: string | number;
  n?: string;
  bp?: string;
  tg?: string;
  eq?: string;
  mg?: string;
  sm?: string[];
  st?: string[];
  img?: string;
  gif?: string;
}

export function mapDatasetBodypartToMuscle(bp = '', tg = ''): MuscleGroup {
  const target = (tg || '').toLowerCase();
  const bodyPart = (bp || '').toLowerCase();
  if (target.includes('biceps')) return 'biceps';
  if (target.includes('triceps')) return 'triceps';
  if (target.includes('lats') || target.includes('upper back') || target.includes('spine')) return 'back';
  if (target.includes('pectorals')) return 'chest';
  if (target.includes('delts')) return 'shoulders';
  if (target.includes('quads')) return 'quadriceps';
  if (target.includes('hamstrings')) return 'hamstrings';
  if (target.includes('glutes')) return 'glutes';
  if (target.includes('calves')) return 'calves';
  if (target.includes('forearms')) return 'forearms';
  if (target.includes('abs') || bodyPart === 'waist') return 'core';
  const bodyMap: Partial<Record<string, MuscleGroup>> = {
    chest: 'chest',
    back: 'back',
    shoulders: 'shoulders',
    'upper arms': 'biceps',
    'lower arms': 'forearms',
    'upper legs': 'quadriceps',
    'lower legs': 'calves',
    waist: 'core'
  };
  return bodyMap[bodyPart] || 'core';
}

export function mapDatasetEquipmentToCategory(equipment = ''): ExerciseCategory {
  return DATASET_EQUIPMENT_CATEGORIES[equipment.trim().toLowerCase()] ?? 'other';
}

// Exhaustive EXDB `eq` vocabulary. Unknown equipment must not inherit a facet
// merely because its name contains a familiar substring.
const DATASET_EQUIPMENT_CATEGORIES: Readonly<Record<string, ExerciseCategory>> = {
  assisted: 'bodyweight',
  band: 'other',
  barbell: 'barbell',
  'body weight': 'bodyweight',
  'bosu ball': 'other',
  cable: 'cable',
  dumbbell: 'dumbbell',
  'elliptical machine': 'machine',
  'ez barbell': 'barbell',
  hammer: 'other',
  kettlebell: 'other',
  'leverage machine': 'machine',
  'medicine ball': 'other',
  'olympic barbell': 'barbell',
  'resistance band': 'other',
  roller: 'other',
  rope: 'other',
  'skierg machine': 'machine',
  'sled machine': 'machine',
  'smith machine': 'machine',
  'stability ball': 'other',
  'stationary bike': 'other',
  'stepmill machine': 'machine',
  tire: 'other',
  'trap bar': 'other',
  'upper body ergometer': 'other',
  weighted: 'other',
  'wheel roller': 'other'
};

export function mapDatasetSecondaryMuscles(rawSm: string[] = [], primaryMuscle?: MuscleGroup): MuscleGroup[] {
  const secondary = (rawSm || [])
    .map((muscle) => mapDatasetBodypartToMuscle('', muscle))
    .filter((muscle) => !primaryMuscle || muscle !== primaryMuscle);
  return Array.from(new Set(secondary));
}

export function mapDatasetExerciseToDomain(raw: RawDatasetExercise): Exercise {
  const primaryMuscle = mapDatasetBodypartToMuscle(raw.bp, raw.tg);
  const secondaryMuscles = mapDatasetSecondaryMuscles(raw.sm, primaryMuscle);
  const exercise: Exercise = {
    id: `ex-${raw.id}`,
    name: raw.n ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1) : 'Ejercicio',
    category: mapDatasetEquipmentToCategory(raw.eq),
    primaryMuscle,
    secondaryMuscles,
    instructions: raw.st || [],
    img: raw.img,
    gif: raw.gif,
    targetMuscle: raw.tg,
    isCustom: false
  };
  exercise.loading = resolveExerciseLoadingProfile(exercise, { legacyEquipment: raw.eq }).profile;
  return exercise;
}
