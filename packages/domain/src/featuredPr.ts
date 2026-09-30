import { calculateCanonicalStrengthOneRm } from './onerm.js';
import { REP_CAP } from './oneRmConstants.js';
import { getSessionChronologicalTimestamp } from './exercisePerformance.js';
import { calculateEffectiveLoadKg, isSetEligibleForPersonalRecord } from './setSemantics.js';
import type {
  BodyweightEntry,
  Exercise,
  HistoricalPersonalRecord,
  LoggedSet,
  WorkoutSession
} from './types.js';
import { resolveBodyweightKgAtDate } from './weight.js';
import { resolveWorkoutDateKey } from './workoutTemporal.js';

export type FeaturedPrSlot = 1 | 2 | 3;

export interface FeaturedPrSelection {
  slot: FeaturedPrSlot;
  exerciseId: string;
  repCount: number;
}

export interface FeaturedRepPerformance {
  exerciseId: string;
  repCount: number;
  set: LoggedSet;
  effectiveLoadKg: number;
  canonicalOneRmKg: number;
  performedDate: string;
  bodyweightKg?: number;
  source: 'workout' | 'historical_manual';
  sessionId?: string;
}

export interface FeaturedRepResolverInput {
  exerciseId: string;
  repCount: number;
  exercise: Exercise;
  history: readonly WorkoutSession[];
  historicalPersonalRecords?: readonly HistoricalPersonalRecord[];
  bodyweightEntries?: readonly BodyweightEntry[];
}

interface Candidate extends FeaturedRepPerformance {
  physicalTimestamp: number;
  physicalTimePrecise: boolean;
  stableOrder: string;
}

export function isValidFeaturedRepCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= REP_CAP;
}

export function isValidFeaturedPrSlot(value: unknown): value is FeaturedPrSlot {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 3;
}

export function isFeaturedPrSelection(value: unknown): value is FeaturedPrSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<FeaturedPrSelection>;
  return isValidFeaturedPrSlot(candidate.slot)
    && typeof candidate.exerciseId === 'string'
    && candidate.exerciseId.trim().length > 0
    && candidate.exerciseId.length <= 100
    && isValidFeaturedRepCount(candidate.repCount);
}

/**
 * Cache-boundary normalization. Invalid and duplicate rows are discarded;
 * authoritative API validation rejects them instead of silently repairing them.
 */
export function normalizeFeaturedPrSelections(value: unknown): FeaturedPrSelection[] {
  if (!Array.isArray(value)) return [];
  const slots = new Set<number>();
  const exercises = new Set<string>();
  const normalized: FeaturedPrSelection[] = [];
  for (const raw of value) {
    if (!isFeaturedPrSelection(raw)) continue;
    const exerciseId = raw.exerciseId.trim();
    if (slots.has(raw.slot) || exercises.has(exerciseId)) continue;
    slots.add(raw.slot);
    exercises.add(exerciseId);
    normalized.push({ slot: raw.slot, exerciseId, repCount: raw.repCount });
    if (normalized.length === 3) break;
  }
  return normalized.sort((left, right) => left.slot - right.slot);
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.effectiveLoadKg !== right.effectiveLoadKg) {
    return left.effectiveLoadKg - right.effectiveLoadKg;
  }
  const physical = comparePhysicalOccurrence(left, right);
  if (physical !== 0) return physical;
  return left.stableOrder.localeCompare(right.stableOrder);
}

function comparePhysicalOccurrence(left: Candidate, right: Candidate): number {
  if (left.physicalTimePrecise && right.physicalTimePrecise) {
    return left.physicalTimestamp - right.physicalTimestamp;
  }
  if (left.performedDate !== right.performedDate) {
    const leftDate = Date.parse(`${left.performedDate}T12:00:00Z`);
    const rightDate = Date.parse(`${right.performedDate}T12:00:00Z`);
    if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return leftDate - rightDate;
    return left.performedDate.localeCompare(right.performedDate);
  }
  // HPRs carry a calendar date but no physical time. A same-day tie therefore
  // stays deterministic without promoting recordedAt to physical chronology.
  return 0;
}

function toCandidate(
  exercise: Exercise,
  exerciseId: string,
  repCount: number,
  set: LoggedSet,
  bodyweightKg: number | null | undefined,
  performedDate: string,
  source: FeaturedRepPerformance['source'],
  stableOrder: string,
  physicalTimestamp: number,
  physicalTimePrecise: boolean,
  sessionId?: string
): Candidate | null {
  if (set.reps !== repCount || !isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg })) return null;
  const effectiveLoadKg = calculateEffectiveLoadKg({
    exercise,
    setWeightKg: set.weightKg,
    bodyweightKg
  });
  const canonicalOneRmKg = calculateCanonicalStrengthOneRm(set, { exercise, bodyweightKg });
  if (!(effectiveLoadKg > 0) || canonicalOneRmKg === null) return null;
  return {
    exerciseId,
    repCount,
    set,
    effectiveLoadKg,
    canonicalOneRmKg,
    performedDate,
    ...(typeof bodyweightKg === 'number' ? { bodyweightKg } : {}),
    source,
    ...(sessionId ? { sessionId } : {}),
    physicalTimestamp,
    physicalTimePrecise,
    stableOrder
  };
}

/** Resolves the strongest real set performed for one exact repetition count. */
export function resolveBestExactRepPerformance(input: FeaturedRepResolverInput): FeaturedRepPerformance | null {
  if (!isValidFeaturedRepCount(input.repCount) || input.exercise.id !== input.exerciseId) return null;
  let best: Candidate | null = null;

  for (const session of input.history) {
    const performedDate = resolveWorkoutDateKey(session);
    const bodyweightKg = resolveBodyweightKgAtDate(input.bodyweightEntries, performedDate);
    const sets = session.sets[input.exerciseId] ?? [];
    sets.forEach((set, index) => {
      const candidate = toCandidate(
        input.exercise,
        input.exerciseId,
        input.repCount,
        set,
        bodyweightKg,
        performedDate,
        'workout',
        `workout:${session.id}:${String(index).padStart(5, '0')}`,
        getSessionChronologicalTimestamp(session),
        Number.isFinite(Date.parse(session.startedAt)),
        session.id
      );
      if (candidate && (!best || compareCandidates(candidate, best) > 0)) best = candidate;
    });
  }

  for (const record of input.historicalPersonalRecords ?? []) {
    if (record.exerciseId !== input.exerciseId) continue;
    const candidate = toCandidate(
      input.exercise,
      input.exerciseId,
      input.repCount,
      record.set,
      record.bodyweightKg,
      record.performedDate,
      'historical_manual',
      `historical:${record.id}`,
      Date.parse(`${record.performedDate}T12:00:00Z`),
      false
    );
    if (candidate && (!best || compareCandidates(candidate, best) > 0)) best = candidate;
  }

  if (!best) return null;
  const {
    physicalTimestamp: _physicalTimestamp,
    physicalTimePrecise: _physicalTimePrecise,
    stableOrder: _stableOrder,
    ...performance
  } = best;
  return performance;
}

export function getAvailableFeaturedRepCounts(
  input: Omit<FeaturedRepResolverInput, 'repCount'>
): number[] {
  const available: number[] = [];
  for (let repCount = 1; repCount <= REP_CAP; repCount += 1) {
    if (resolveBestExactRepPerformance({ ...input, repCount })) available.push(repCount);
  }
  return available;
}
