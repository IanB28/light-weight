import {
  normalizeRoutine,
  reconcileLegacyRoutineTemplate,
  canonicalizeRoutineId,
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

/** A legacy effective template was synthesized, not edited by its owner. */
export function hasLocalRoutineChanges(local: Routine, remote: Routine): boolean {
  if (local.name !== remote.name || (local.description ?? '') !== (remote.description ?? '')) return true;
  if (JSON.stringify(local.exerciseIds) !== JSON.stringify(remote.exerciseIds)) return true;
  return local.templateSource === 'v2' && JSON.stringify(local.template) !== JSON.stringify(remote.template);
}

/** A synthesized runtime template must travel as a legacy payload. */
export function serializeRoutineForSync(routine: Routine): RoutineSyncPayload {
  const normalized = normalizeRoutine(routine);
  if (!normalized) throw new Error('Invalid routine for sync');
  return {
    id: canonicalizeRoutineId(normalized.id),
    name: normalized.name,
    ...(normalized.description !== undefined ? { description: normalized.description } : {}),
    exerciseIds: [...normalized.exerciseIds],
    ...(normalized.templateSource === 'v2' && normalized.template ? { template: normalized.template } : {})
  };
}

/** Preserves local edits while recovering remote V2 sets for legacy-derived routines. */
export function mergePulledRoutines(
  local: readonly Routine[], incoming: readonly Routine[],
  options?: { cloudAuthoritative?: boolean; pendingUpsertIds?: ReadonlySet<string> }
): Routine[] {
  const canonicalLocal = local.map((routine) => ({ ...routine, id: canonicalizeRoutineId(routine.id) }));
  const canonicalIncoming = incoming.map((routine) => ({ ...routine, id: canonicalizeRoutineId(routine.id) }));
  const remoteById = new Map(canonicalIncoming.map((routine) => [routine.id, routine]));
  const localIds = new Set(canonicalLocal.map((routine) => routine.id));
  const mergedLocal = canonicalLocal.map((routine) => {
    const remote = remoteById.get(routine.id);
    const pending = options?.pendingUpsertIds?.has(routine.id) ?? false;
    if (!remote) return options?.cloudAuthoritative && !pending ? null : routine;
    if (options?.cloudAuthoritative && !pending) return remote;

    const origin = routine.origin ?? remote.origin;
    if (routine.templateSource === 'legacy' && remote.templateSource === 'v2' && remote.template) {
      const template = reconcileLegacyRoutineTemplate(remote.template, routine.exerciseIds);
      return normalizeRoutine({ ...routine, origin, template, templateSource: 'v2' })!;
    }
    return origin !== routine.origin ? { ...routine, origin } : routine;
  });

  return [...new Map([...mergedLocal.filter((routine): routine is Routine => routine !== null),
    ...canonicalIncoming.filter((routine) => !localIds.has(routine.id))]
    .map((routine) => [routine.id, routine])).values()];
}
