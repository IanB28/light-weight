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
    variantLabel?: (variantIndex: number) => string;
  }
): RoutinePickerOption[] {
  const nameCounts = new Map<string, number>();
  for (const r of routines) {
    const key = r.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const baseLabels = routines.map((routine) => {
    const count = routine.exerciseIds?.length ?? 0;
    const isDuplicateName = (nameCounts.get(routine.name.trim().toLowerCase()) || 0) > 1;
    const countText = options?.exerciseLabel
      ? options.exerciseLabel(count)
      : `${count} ${count === 1 ? 'ejercicio' : 'ejercicios'}`;

    return isDuplicateName
      ? `${routine.name} · ${countText}`
      : routine.name;
  });

  const baseLabelCounts = new Map<string, number>();
  for (const label of baseLabels) {
    baseLabelCounts.set(label, (baseLabelCounts.get(label) || 0) + 1);
  }

  const variantTracker = new Map<string, number>();
  const routineOptions: RoutinePickerOption[] = routines.map((routine, i) => {
    const baseLabel = baseLabels[i];
    const totalWithBase = baseLabelCounts.get(baseLabel) || 0;
    let label = baseLabel;

    if (totalWithBase > 1) {
      const variantIdx = (variantTracker.get(baseLabel) || 0) + 1;
      variantTracker.set(baseLabel, variantIdx);
      const variantText = options?.variantLabel
        ? options.variantLabel(variantIdx)
        : `Variante ${variantIdx}`;
      label = `${baseLabel} · ${variantText}`;
    }

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
