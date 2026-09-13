export function workoutElapsedSeconds(workoutStartedAt: string | null | undefined, nowMs = Date.now()): number {
  if (!workoutStartedAt) return 0;
  const startedAtMs = Date.parse(workoutStartedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
}

export function workoutStartFromLegacySeconds(legacySeconds: number, nowMs = Date.now()): string {
  const safeSeconds = Number.isFinite(legacySeconds) ? Math.max(0, legacySeconds) : 0;
  return new Date(nowMs - safeSeconds * 1_000).toISOString();
}

export function restSecondsRemaining(restEndsAt: number | null | undefined, nowMs = Date.now()): number {
  if (!Number.isFinite(restEndsAt) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil(((restEndsAt as number) - nowMs) / 1_000));
}

export function adjustRestEnd(restEndsAt: number | null, deltaSeconds: number, nowMs = Date.now()): number | null {
  if (!Number.isFinite(deltaSeconds)) return restEndsAt;
  const currentEnd = restEndsAt && restEndsAt > nowMs ? restEndsAt : nowMs;
  const nextEnd = currentEnd + deltaSeconds * 1_000;
  return nextEnd > nowMs ? nextEnd : null;
}

export function formatElapsedDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
