import type { Routine } from '@light-weight/domain';

export interface RoutinePickerOption {
  value: string;
  label: string;
  routine?: Routine;
}

/**
 * Builds disambiguated options for routine pickers and selectors.
 * When distinct routine IDs share the same display name, appends metadata
 * (e.g. "Rutina 1 · 4 ejercicios") so the user can distinguish between them.
 */
export function buildRoutinePickerOptions(
  routines: Routine[],
  options?: {
    emptyLabel?: string;
    exerciseLabel?: (count: number) => string;
  }
): RoutinePickerOption[] {
  const nameCounts = new Map<string, number>();
  for (const r of routines) {
    const key = r.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const routineOptions: RoutinePickerOption[] = routines.map((routine) => {
    const count = routine.exerciseIds?.length ?? 0;
    const isDuplicateName = (nameCounts.get(routine.name.trim().toLowerCase()) || 0) > 1;
    const countText = options?.exerciseLabel
      ? options.exerciseLabel(count)
      : `${count} ${count === 1 ? 'ejercicio' : 'ejercicios'}`;

    const label = isDuplicateName
      ? `${routine.name} · ${countText}`
      : routine.name;

    return {
      value: routine.id,
      label,
      routine
    };
  });

  if (options?.emptyLabel !== undefined) {
    return [
      { value: '', label: options.emptyLabel },
      ...routineOptions
    ];
  }

  return routineOptions;
}
