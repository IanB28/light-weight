/** Cancels superseded as-of reads and rejects late responses for older editor context. */
export class HistoricalPrefillGate {
  private generation = 0;
  private controller: AbortController | null = null;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  start(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal,
      isCurrent: () => !controller.signal.aborted && generation === this.generation };
  }
}

/** Apply remote data only to the exact draft objects that initiated the read. */
export function applyAsOfPrefillToUneditedSessions<T extends { exercise: { id: string } }>(
  current: readonly T[], seed: readonly T[], refreshed: readonly T[]
): T[] {
  const seedById = new Map(seed.map((session) => [session.exercise.id, session]));
  const refreshedById = new Map(refreshed.map((session) => [session.exercise.id, session]));
  return current.map((session) => session === seedById.get(session.exercise.id)
    ? (refreshedById.get(session.exercise.id) ?? session) : session);
}
