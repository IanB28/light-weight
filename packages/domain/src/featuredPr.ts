import { getSessionChronologicalTimestamp } from './exercisePerformance.js';
import { calculateEffectiveLoadKg, isSetEligibleForPersonalRecord } from './setSemantics.js';
import type { BodyweightEntry, Exercise, HistoricalPersonalRecord, LoggedSet, WorkoutSession } from './types.js';
import { resolveBodyweightKgAtDate } from './weight.js';
import { resolveWorkoutDateKey } from './workoutTemporal.js';
import type { StrengthRank } from './strengthStandards.js';
import { resolveExerciseLoadingProfile } from './exerciseLoading.js';
import type { PublicFeaturedPrLoad } from './identity.js';

export type FeaturedPrSlot = 1 | 2 | 3;

export interface FeaturedPrSelection {
  slot: FeaturedPrSlot;
  exerciseId: string;
  /** Stored/logged load identity, normalized to database hundredths of a kg. */
  loadWeightKg: number;
}

export interface FeaturedPrVariant {
  exerciseId: string;
  loadWeightKg: number;
  reps: number;
  set: LoggedSet;
  effectiveLoadKg: number;
  performedDate: string;
  bodyweightKg?: number;
  source: 'workout' | 'historical_manual';
  sessionId?: string;
}

export interface ResolvedFeaturedPrSelection extends FeaturedPrSelection {
  variant: FeaturedPrVariant | null;
}

export interface FeaturedPrShowcase {
  selections: FeaturedPrSelection[];
  resolvedSelections: ResolvedFeaturedPrSelection[];
  variants: FeaturedPrVariant[];
  /** Full-history server authority for authenticated own-profile presentation. */
  strengthRanksByExercise?: Record<string, StrengthRank>;
}

export interface FeaturedPrResolverInput {
  exerciseId: string;
  exercise: Exercise;
  history: readonly WorkoutSession[];
  historicalPersonalRecords?: readonly HistoricalPersonalRecord[];
  bodyweightEntries?: readonly BodyweightEntry[];
}

export function projectPublicFeaturedPrLoad(exercise: Exercise, weightKg: number): PublicFeaturedPrLoad {
  const profile = resolveExerciseLoadingProfile(exercise).profile;
  if (typeof profile.bodyweightFactor === 'number' && weightKg === 0) return { type: 'bodyweight' };
  if (profile.loadMode === 'added_weight') return { type: 'added_weight', weightKg };
  if (profile.loadMode === 'assisted') return { type: 'assisted', weightKg };
  const loadMode = profile.loadMode === 'per_side' || profile.loadMode === 'per_hand'
    ? profile.loadMode
    : 'total';
  return { type: 'weight', weightKg, loadMode };
}

interface Candidate extends FeaturedPrVariant {
  loadHundredths: number;
  physicalTimestamp: number;
  physicalTimePrecise: boolean;
  stableOrder: string;
}

const MAX_STORED_LOAD_HUNDREDTHS = 999_999;

export function normalizeFeaturedLoadWeightKg(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const hundredths = Math.round(value * 100);
  if (hundredths < 0 || hundredths > MAX_STORED_LOAD_HUNDREDTHS) return null;
  return hundredths / 100;
}

export function featuredLoadHundredths(value: unknown): number | null {
  const normalized = normalizeFeaturedLoadWeightKg(value);
  return normalized === null ? null : Math.round(normalized * 100);
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
    && normalizeFeaturedLoadWeightKg(candidate.loadWeightKg) !== null;
}

/** Cache normalization drops invalid legacy/exact-rep rows and duplicates. */
export function normalizeFeaturedPrSelections(value: unknown): FeaturedPrSelection[] {
  if (!Array.isArray(value)) return [];
  const slots = new Set<number>();
  const exercises = new Set<string>();
  const normalized: FeaturedPrSelection[] = [];
  for (const raw of value) {
    if (!isFeaturedPrSelection(raw)) continue;
    const exerciseId = raw.exerciseId.trim();
    const loadWeightKg = normalizeFeaturedLoadWeightKg(raw.loadWeightKg);
    if (loadWeightKg === null || slots.has(raw.slot) || exercises.has(exerciseId)) continue;
    slots.add(raw.slot);
    exercises.add(exerciseId);
    normalized.push({ slot: raw.slot, exerciseId, loadWeightKg });
    if (normalized.length === 3) break;
  }
  return normalized.sort((left, right) => left.slot - right.slot);
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
  // HPR recordedAt is data-entry time, never physical chronology.
  return 0;
}

function compareBucketCandidates(left: Candidate, right: Candidate): number {
  if (left.reps !== right.reps) return left.reps - right.reps;
  const physical = comparePhysicalOccurrence(left, right);
  if (physical !== 0) return physical;
  return left.stableOrder.localeCompare(right.stableOrder);
}

function comparePrimaryCandidates(left: Candidate, right: Candidate): number {
  if (left.reps !== right.reps) return left.reps - right.reps;
  if (left.effectiveLoadKg !== right.effectiveLoadKg) return left.effectiveLoadKg - right.effectiveLoadKg;
  const physical = comparePhysicalOccurrence(left, right);
  if (physical !== 0) return physical;
  return left.stableOrder.localeCompare(right.stableOrder);
}

function toCandidate(options: {
  exercise: Exercise;
  exerciseId: string;
  set: LoggedSet;
  bodyweightKg?: number | null;
  performedDate: string;
  source: FeaturedPrVariant['source'];
  stableOrder: string;
  physicalTimestamp: number;
  physicalTimePrecise: boolean;
  sessionId?: string;
}): Candidate | null {
  const { exercise, exerciseId, set, bodyweightKg, performedDate, source, stableOrder,
    physicalTimestamp, physicalTimePrecise, sessionId } = options;
  const loadHundredths = featuredLoadHundredths(set.weightKg);
  if (loadHundredths === null || !Number.isInteger(set.reps) || set.reps <= 0) return null;
  if (!isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg })) return null;
  const effectiveLoadKg = calculateEffectiveLoadKg({ exercise, setWeightKg: set.weightKg, bodyweightKg });
  if (!(effectiveLoadKg > 0)) return null;
  return {
    exerciseId,
    loadWeightKg: loadHundredths / 100,
    loadHundredths,
    reps: set.reps,
    set,
    effectiveLoadKg,
    performedDate,
    ...(typeof bodyweightKg === 'number' ? { bodyweightKg } : {}),
    source,
    ...(sessionId ? { sessionId } : {}),
    physicalTimestamp,
    physicalTimePrecise,
    stableOrder
  };
}

function publicVariant(candidate: Candidate): FeaturedPrVariant {
  const { loadHundredths: _loadHundredths, physicalTimestamp: _physicalTimestamp,
    physicalTimePrecise: _physicalTimePrecise, stableOrder: _stableOrder, ...variant } = candidate;
  return variant;
}

/** Best real performed set for every normalized logged-load variant. */
export function resolveFeaturedPrVariants(input: FeaturedPrResolverInput): FeaturedPrVariant[] {
  if (input.exercise.id !== input.exerciseId) return [];
  const buckets = new Map<number, Candidate>();
  const consider = (candidate: Candidate | null) => {
    if (!candidate) return;
    const current = buckets.get(candidate.loadHundredths);
    if (!current || compareBucketCandidates(candidate, current) > 0) buckets.set(candidate.loadHundredths, candidate);
  };

  for (const session of input.history) {
    const performedDate = resolveWorkoutDateKey(session);
    const bodyweightKg = resolveBodyweightKgAtDate(input.bodyweightEntries, performedDate);
    const physicalTimestamp = getSessionChronologicalTimestamp(session);
    const physicalTimePrecise = Number.isFinite(Date.parse(session.startedAt));
    (session.sets[input.exerciseId] ?? []).forEach((set, index) => consider(toCandidate({
      exercise: input.exercise,
      exerciseId: input.exerciseId,
      set,
      bodyweightKg,
      performedDate,
      source: 'workout',
      stableOrder: `workout:${session.id}:${String(index).padStart(5, '0')}`,
      physicalTimestamp,
      physicalTimePrecise,
      sessionId: session.id
    })));
  }

  for (const record of input.historicalPersonalRecords ?? []) {
    if (record.exerciseId !== input.exerciseId) continue;
    consider(toCandidate({
      exercise: input.exercise,
      exerciseId: input.exerciseId,
      set: record.set,
      bodyweightKg: record.bodyweightKg,
      performedDate: record.performedDate,
      source: 'historical_manual',
      stableOrder: `historical:${record.id}`,
      physicalTimestamp: Date.parse(`${record.performedDate}T12:00:00Z`),
      physicalTimePrecise: false
    }));
  }

  return [...buckets.values()]
    .sort((left, right) => comparePrimaryCandidates(right, left))
    .map(publicVariant);
}

export function resolvePrimaryFeaturedPrVariant(variants: readonly FeaturedPrVariant[]): FeaturedPrVariant | null {
  return variants[0] ?? null;
}

export function resolveSelectedFeaturedPrVariant(
  selection: Pick<FeaturedPrSelection, 'exerciseId' | 'loadWeightKg'>,
  variants: readonly FeaturedPrVariant[]
): FeaturedPrVariant | null {
  const target = featuredLoadHundredths(selection.loadWeightKg);
  if (target === null) return null;
  return variants.find((variant) => variant.exerciseId === selection.exerciseId
    && featuredLoadHundredths(variant.loadWeightKg) === target) ?? null;
}
