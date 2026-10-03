import type { Exercise, ExerciseCategory, MuscleGroup } from '@light-weight/domain';

export type ExerciseMuscleFilter = 'all' | MuscleGroup;
export type ExerciseEquipmentFilter = 'all' | ExerciseCategory;

export const MUSCLE_FILTER_OPTIONS: { value: ExerciseMuscleFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'chest', label: 'Pecho' },
  { value: 'back', label: 'Espalda' },
  { value: 'shoulders', label: 'Hombros' },
  { value: 'quadriceps', label: 'Cuádriceps' },
  { value: 'hamstrings', label: 'Femoral' },
  { value: 'glutes', label: 'Glúteos' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'forearms', label: 'Antebrazos' },
  { value: 'core', label: 'Core' },
  { value: 'calves', label: 'Gemelos' }
];

export const EQUIPMENT_FILTER_OPTIONS: { value: ExerciseEquipmentFilter; label: string }[] = [
  { value: 'all', label: 'Todo el equipo' },
  { value: 'barbell', label: 'Barra' },
  { value: 'dumbbell', label: 'Mancuernas' },
  { value: 'machine', label: 'Máquina' },
  { value: 'cable', label: 'Polea' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'other', label: 'Otro' }
];

export const MUSCLE_LABELS = Object.fromEntries(
  MUSCLE_FILTER_OPTIONS.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
) as Record<MuscleGroup, string>;

export const EQUIPMENT_LABELS = Object.fromEntries(
  EQUIPMENT_FILTER_OPTIONS.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
) as Record<ExerciseCategory, string>;

export const normalizeExerciseSearch = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .trim();

const MUSCLE_QUERY_ALIASES: Readonly<Record<string, MuscleGroup>> = {
  biceps: 'biceps', triceps: 'triceps', pecho: 'chest', chest: 'chest',
  espalda: 'back', back: 'back', hombros: 'shoulders', shoulders: 'shoulders',
  cuadriceps: 'quadriceps', quadriceps: 'quadriceps', hamstrings: 'hamstrings',
  femoral: 'hamstrings', gluteos: 'glutes', glutes: 'glutes',
  gemelos: 'calves', calves: 'calves', antebrazos: 'forearms',
  forearms: 'forearms', core: 'core', abs: 'core'
};

export function resolveExerciseSearchIntent(normalizedQuery: string) {
  const words = normalizedQuery.match(/[\p{L}\p{N}]+/gu) ?? [];
  const muscles = new Set<MuscleGroup>();
  const remaining: string[] = [];
  for (const word of words) {
    const muscle = MUSCLE_QUERY_ALIASES[word];
    if (muscle) muscles.add(muscle);
    else remaining.push(word);
  }
  return { muscles, terms: remaining };
}

export function matchesExerciseFilters(
  exercise: Exercise,
  normalizedQuery: string,
  muscle: ExerciseMuscleFilter,
  equipment: ExerciseEquipmentFilter
) {
  if (muscle !== 'all' && exercise.primaryMuscle !== muscle) return false;
  if (equipment !== 'all' && exercise.category !== equipment) return false;

  const { muscles, terms } = resolveExerciseSearchIntent(normalizedQuery);
  if ([...muscles].some((intent) => exercise.primaryMuscle !== intent)) return false;
  const searchableText = normalizeExerciseSearch([
    exercise.name,
    exercise.targetMuscle || '',
    MUSCLE_LABELS[exercise.primaryMuscle],
    EQUIPMENT_LABELS[exercise.category]
  ].join(' '));

  return terms.every((term) => searchableText.includes(term));
}
