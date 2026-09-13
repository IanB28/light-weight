import {
  resolveExerciseLoadingProfile,
  type Exercise,
  type MuscleGroup,
  type ExerciseCategory
} from '@light-weight/domain';

export const IMG_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/';
export const GIF_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/';

export function getExerciseImgUrl(ex: { img?: string } | undefined): string | null {
  return ex?.img ? `${IMG_CDN_BASE}${ex.img}` : null;
}

export function getExerciseGifUrl(ex: { gif?: string } | undefined): string | null {
  return ex?.gif ? `${GIF_CDN_BASE}${ex.gif}` : null;
}

function mapBodypartToMuscle(bp = '', tg = ''): MuscleGroup {
  const target = tg.toLowerCase();
  const bodyPart = bp.toLowerCase();
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
    chest: 'chest', back: 'back', shoulders: 'shoulders', 'upper arms': 'biceps',
    'lower arms': 'forearms', 'upper legs': 'quadriceps', 'lower legs': 'calves', waist: 'core'
  };
  return bodyMap[bodyPart] || 'core';
}

function mapEquipmentToCategory(equipment = ''): ExerciseCategory {
  const value = equipment.toLowerCase();
  if (value.includes('barbell') || value.includes('olympic')) return 'barbell';
  if (value.includes('dumbbell')) return 'dumbbell';
  if (value.includes('cable')) return 'cable';
  if (value.includes('body weight') || value.includes('assisted')) return 'bodyweight';
  if (value.includes('machine') || value.includes('leverage') || value.includes('smith')) return 'machine';
  return 'other';
}

interface RawExercise {
  id: string | number; n?: string; bp?: string; tg?: string; eq?: string;
  sm?: string[]; st?: string[]; img?: string; gif?: string;
}

function mapExercise(raw: RawExercise): Exercise {
  const primaryMuscle = mapBodypartToMuscle(raw.bp, raw.tg);
  const secondary = (raw.sm || []).map((muscle) => mapBodypartToMuscle('', muscle)).filter((muscle) => muscle !== primaryMuscle);
  const exercise: Exercise = {
    id: `ex-${raw.id}`,
    name: raw.n ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1) : 'Ejercicio',
    category: mapEquipmentToCategory(raw.eq),
    primaryMuscle,
    secondaryMuscles: Array.from(new Set(secondary)),
    instructions: raw.st || [], img: raw.img, gif: raw.gif, targetMuscle: raw.tg, isCustom: false
  };
  exercise.loading = resolveExerciseLoadingProfile(exercise, { legacyEquipment: raw.eq }).profile;
  return exercise;
}

export const EXERCISES_BY_ID: Record<string, Exercise> = {};
let catalogPromise: Promise<Exercise[]> | null = null;

export function loadExerciseCatalog(): Promise<Exercise[]> {
  if (!catalogPromise) {
    // @ts-expect-error The generated catalog is intentionally kept as plain JS.
    catalogPromise = import('./exercises-data.js').then(({ EXDB }) => {
      const exercises = (EXDB as RawExercise[]).map(mapExercise);
      exercises.forEach((exercise) => { EXERCISES_BY_ID[exercise.id] = exercise; });
      return exercises;
    }).catch((error) => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

export function findExerciseById(id: string): Exercise | undefined {
  return EXERCISES_BY_ID[id];
}
