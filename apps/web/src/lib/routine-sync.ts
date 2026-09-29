import {
  normalizeRoutine,
  reconcileLegacyRoutineTemplate,
  toDatabaseUuid,
  type Routine,
  type RoutineTemplateV2
} from '@light-weight/domain';

export interface RoutineSyncPayload {
  id: string;
  name: string;
  description?: string;
  exerciseIds: string[];
  template?: RoutineTemplateV2;
}

/** A synthesized runtime template must travel as a legacy payload. */
export function serializeRoutineForSync(routine: Routine): RoutineSyncPayload {
  const normalized = normalizeRoutine(routine);
  if (!normalized) throw new Error('Invalid routine for sync');
  return {
    id: toDatabaseUuid(normalized.id),
    name: normalized.name,
    ...(normalized.description !== undefined ? { description: normalized.description } : {}),
    exerciseIds: [...normalized.exerciseIds],
    ...(normalized.templateSource === 'v2' && normalized.template ? { template: normalized.template } : {})
  };
}

/** Preserves local edits while recovering remote V2 sets for legacy-derived routines. */
export function mergePulledRoutines(local: readonly Routine[], incoming: readonly Routine[]): Routine[] {
  const canonicalLocal = local.map((routine) => ({ ...routine, id: toDatabaseUuid(routine.id) }));
  const canonicalIncoming = incoming.map((routine) => ({ ...routine, id: toDatabaseUuid(routine.id) }));
  const remoteById = new Map(canonicalIncoming.map((routine) => [routine.id, routine]));
  const localIds = new Set(canonicalLocal.map((routine) => routine.id));
  const mergedLocal = canonicalLocal.map((routine) => {
    const remote = remoteById.get(routine.id);
    if (!remote) return routine;

    const origin = routine.origin ?? remote.origin;
    if (routine.templateSource === 'legacy' && remote.templateSource === 'v2' && remote.template) {
      const template = reconcileLegacyRoutineTemplate(remote.template, routine.exerciseIds);
      return normalizeRoutine({ ...routine, origin, template, templateSource: 'v2' })!;
    }
    return origin !== routine.origin ? { ...routine, origin } : routine;
  });

  return [...new Map([...mergedLocal, ...canonicalIncoming.filter((routine) => !localIds.has(routine.id))]
    .map((routine) => [routine.id, routine])).values()];
}
