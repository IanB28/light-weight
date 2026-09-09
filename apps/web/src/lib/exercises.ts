import { Exercise, MuscleGroup, ExerciseCategory } from '@light-weight/domain';
// @ts-ignore
import { EXDB } from './exercises-data.js';

export const IMG_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/';

export const GIF_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/';

export function getExerciseImgUrl(ex: { img?: string } | undefined): string | null {
  if (!ex?.img) return null;
  return `${IMG_CDN_BASE}${ex.img}`;
}

export function getExerciseGifUrl(ex: { gif?: string } | undefined): string | null {
  if (!ex?.gif) return null;
  return `${GIF_CDN_BASE}${ex.gif}`;
}

function mapBodypartToMuscle(bp: string, tg: string): MuscleGroup {
  const t = (tg || '').toLowerCase();
  const b = (bp || '').toLowerCase();

  if (t.includes('biceps')) return 'biceps';
  if (t.includes('triceps')) return 'triceps';
  if (t.includes('lats') || t.includes('upper back') || t.includes('spine')) return 'back';
  if (t.includes('pectorals')) return 'chest';
  if (t.includes('delts')) return 'shoulders';
  if (t.includes('quads')) return 'quadriceps';
  if (t.includes('hamstrings')) return 'hamstrings';
  if (t.includes('glutes')) return 'glutes';
  if (t.includes('calves')) return 'calves';
  if (t.includes('forearms')) return 'forearms';
  if (t.includes('abs') || b === 'waist') return 'core';

  if (b === 'chest') return 'chest';
  if (b === 'back') return 'back';
  if (b === 'shoulders') return 'shoulders';
  if (b === 'upper arms') return 'biceps';
  if (b === 'lower arms') return 'forearms';
  if (b === 'upper legs') return 'quadriceps';
  if (b === 'lower legs') return 'calves';
  if (b === 'waist') return 'core';

  return 'core';
}

function mapEquipmentToCategory(eq: string): ExerciseCategory {
  const e = (eq || '').toLowerCase();
  if (e.includes('barbell') || e.includes('olympic')) return 'barbell';
  if (e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('cable')) return 'cable';
  if (e.includes('body weight') || e.includes('assisted')) return 'bodyweight';
  if (e.includes('machine') || e.includes('leverage') || e.includes('smith')) return 'machine';
  return 'other';
}

// Convertir todo el dataset EXDB al modelo Exercise
export const CATALOG_EXERCISES: Exercise[] = (EXDB as any[]).map((raw) => {
  const primaryMuscle = mapBodypartToMuscle(raw.bp, raw.tg);
  const category = mapEquipmentToCategory(raw.eq);
  const secondary: MuscleGroup[] = Array.isArray(raw.sm)
    ? raw.sm.map((s: string) => mapBodypartToMuscle('', s)).filter((m: MuscleGroup) => m !== primaryMuscle)
    : [];

  return {
    id: `ex-${raw.id}`,
    name: raw.n
      ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1)
      : 'Ejercicio',
    category,
    primaryMuscle,
    secondaryMuscles: Array.from(new Set(secondary)),
    instructions: raw.st || [],
    img: raw.img,
    gif: raw.gif,
    targetMuscle: raw.tg,
    isCustom: false,
  };
});

// Índice rápido por ID
export const EXERCISES_BY_ID: Record<string, Exercise> = {};
CATALOG_EXERCISES.forEach((ex) => {
  EXERCISES_BY_ID[ex.id] = ex;
});

export function findExerciseById(id: string): Exercise | undefined {
  return EXERCISES_BY_ID[id];
}
