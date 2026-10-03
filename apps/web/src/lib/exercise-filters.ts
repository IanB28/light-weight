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

const MUSCLE_SEARCH_ALIASES: Readonly<Record<MuscleGroup, readonly string[]>> = {
  chest: ['pecho', 'chest'],
  back: ['espalda', 'back'],
  shoulders: ['hombros', 'shoulders'],
  quadriceps: ['cuadriceps', 'quadriceps'],
  hamstrings: ['femoral', 'hamstrings'],
  glutes: ['gluteos', 'glutes'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['antebrazos', 'forearms'],
  core: ['core', 'abs'],
  calves: ['gemelos', 'calves']
};

const MUSCLE_QUERY_ALIASES = Object.fromEntries(
  Object.entries(MUSCLE_SEARCH_ALIASES).flatMap(([muscle, aliases]) =>
    aliases.map((alias) => [alias, muscle])
  )
) as Readonly<Record<string, MuscleGroup>>;

export function resolveExerciseSearchIntent(normalizedQuery: string) {
  const muscle = MUSCLE_QUERY_ALIASES[normalizedQuery];
  const terms = muscle ? [] : normalizedQuery.match(/[\p{L}\p{N}]+/gu) ?? [];
  return { muscle, terms };
}

export function matchesExerciseFilters(
  exercise: Exercise,
  normalizedQuery: string,
  muscle: ExerciseMuscleFilter,
  equipment: ExerciseEquipmentFilter
) {
  if (muscle !== 'all' && exercise.primaryMuscle !== muscle) return false;
  if (equipment !== 'all' && exercise.category !== equipment) return false;

  const { muscle: muscleIntent, terms } = resolveExerciseSearchIntent(normalizedQuery);
  if (muscleIntent && exercise.primaryMuscle !== muscleIntent) return false;
  const searchableText = normalizeExerciseSearch([
    exercise.name,
    exercise.targetMuscle || '',
    ...MUSCLE_SEARCH_ALIASES[exercise.primaryMuscle],
    EQUIPMENT_LABELS[exercise.category]
  ].join(' '));

  return terms.every((term) => searchableText.includes(term));
}
