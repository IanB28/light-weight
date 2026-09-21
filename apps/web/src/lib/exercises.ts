import {
  mapDatasetExerciseToDomain,
  type Exercise,
  type RawDatasetExercise
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

export const EXERCISES_BY_ID: Record<string, Exercise> = {};
let catalogPromise: Promise<Exercise[]> | null = null;

export function loadExerciseCatalog(): Promise<Exercise[]> {
  if (!catalogPromise) {
    catalogPromise = import('./exercises-data.js').then(({ EXDB }) => {
      const exercises = (EXDB as RawDatasetExercise[]).map(mapDatasetExerciseToDomain);
      exercises.forEach((exercise) => { EXERCISES_BY_ID[exercise.id] = exercise; });
      return exercises;
    }).catch((error) => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

export function findExerciseById(id: string): Exercise | undefined {
  return EXERCISES_BY_ID[id];
}
