import type { WorkoutEntrySource, WorkoutSession } from './types.js';

export const WORKOUT_ENTRY_SOURCES = ['live', 'historical_manual'] as const;

export function isWorkoutEntrySource(value: unknown): value is WorkoutEntrySource {
  return typeof value === 'string' && (WORKOUT_ENTRY_SOURCES as readonly string[]).includes(value);
}

/** Strict calendar-date validation without accepting Date's rollover behaviour. */
export function isValidWorkoutDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Formats a device-local calendar date without crossing a UTC day boundary. */
export function formatLocalWorkoutDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Calendar consumers use the explicitly captured local performed date when
 * available. Legacy records intentionally retain their original ISO prefix.
 */
export function resolveWorkoutDateKey(session: Pick<WorkoutSession, 'startedAt' | 'performedDate'>): string {
  if (isValidWorkoutDateKey(session.performedDate)) return session.performedDate;
  return session.startedAt.slice(0, 10);
}

export function isValidWorkoutTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
