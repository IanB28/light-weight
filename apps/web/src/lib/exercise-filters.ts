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

export function matchesExerciseFilters(
  exercise: Exercise,
  normalizedQuery: string,
  muscle: ExerciseMuscleFilter,
  equipment: ExerciseEquipmentFilter
) {
  const searchableText = normalizeExerciseSearch([
    exercise.name,
    exercise.targetMuscle || '',
    MUSCLE_LABELS[exercise.primaryMuscle],
    EQUIPMENT_LABELS[exercise.category]
  ].join(' '));

  return Boolean(
    (normalizedQuery.length === 0 || searchableText.includes(normalizedQuery)) &&
    (muscle === 'all' || exercise.primaryMuscle === muscle || Boolean(exercise.secondaryMuscles?.includes(muscle))) &&
    (equipment === 'all' || exercise.category === equipment)
  );
}
