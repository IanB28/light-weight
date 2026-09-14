import type { Routine } from '@light-weight/domain';

/** Pull must never reintroduce a routine while its local delete awaits ACK. */
export function excludePendingRoutineTombstones(routines: Routine[], deletedRoutineIds: readonly string[]): Routine[] {
  const deleted = new Set(deletedRoutineIds);
  return routines.filter((routine) => !deleted.has(routine.id));
}
