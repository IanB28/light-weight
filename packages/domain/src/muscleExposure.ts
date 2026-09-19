import type { Exercise, LoggedSet, WorkoutSession } from './types.js';
import type {
  EvidenceConfidence,
  MuscleRole,
  SemanticEvidenceStatus
} from './exerciseSemantics.js';
import {
  type ResolvedExerciseContributionTarget,
  resolveExerciseSemantics
} from './exerciseSemanticsResolver.js';
import { shouldCountForVolume } from './setSemantics.js';

export type MuscleExposureSource = 'semantic_v2' | 'legacy';

export type EffortBand = 'failure' | 'hard' | 'submaximal' | 'unknown';

/**
 * Systemic/Axial demand placeholder (Phase O).
 * Deep Research is actively refining systemic/axial fatigue heuristics.
 * Kept strictly extensible without inventing speculative coefficients.
 */
export type SystemicDemand = 'low' | 'moderate' | 'high' | 'unknown';

/**
 * Immutable fact-based exposure event representing the participation of
 * a specific muscle target during a physical completed set.
 */
export interface MuscleExposureEvent {
  /** Deterministic exposure ID: `${sessionId}:${exerciseId}:${setIndex}:${targetKey}` */
  readonly id: string;

  readonly sessionId: string;
  readonly exerciseId: string;
  readonly setIndex: number;
  readonly performedAt: string;

  readonly target: ResolvedExerciseContributionTarget;
  readonly role: MuscleRole;
  readonly source: MuscleExposureSource;

  readonly semanticConfidence?: EvidenceConfidence;
  readonly semanticStatus?: SemanticEvidenceStatus;

  readonly effort: EffortBand;
  readonly reps: number;
  readonly loadKg: number;
}

/**
 * Centralized, replaceable effort classification thresholds.
 * Deep Research may refine these categorical thresholds.
 * INVARIANT: Missing RIR/RPE is strictly 'unknown' and never assumed.
 */
export const PROVISIONAL_EFFORT_POLICY = Object.freeze({
  failureRirMax: 0,
  hardRirMax: 2,
  failureRpeMin: 10,
  hardRpeMin: 8
});

/**
 * Categorical effort extractor.
 *
 * Invariant: missing RIR/RPE returns 'unknown'. It must NEVER default to 2 or any other number.
 * Invariant: Does not multiply effort into numeric physiological fatigue.
 */
export function classifySetEffort(set: Pick<LoggedSet, 'rir' | 'rpe'>): EffortBand {
  if (typeof set.rir === 'number' && Number.isFinite(set.rir)) {
    if (set.rir <= PROVISIONAL_EFFORT_POLICY.failureRirMax) {
      return 'failure';
    }
    if (set.rir <= PROVISIONAL_EFFORT_POLICY.hardRirMax) {
      return 'hard';
    }
    return 'submaximal';
  }

  if (typeof set.rpe === 'number' && Number.isFinite(set.rpe)) {
    if (set.rpe >= PROVISIONAL_EFFORT_POLICY.failureRpeMin) {
      return 'failure';
    }
    if (set.rpe >= PROVISIONAL_EFFORT_POLICY.hardRpeMin) {
      return 'hard';
    }
    return 'submaximal';
  }

  return 'unknown';
}

/**
 * Deterministic string key for indexing a ResolvedExerciseContributionTarget.
 */
export function getContributionTargetKey(target: ResolvedExerciseContributionTarget): string {
  if (target.kind === 'anatomical') {
    return `anatomical:${target.entity}`;
  }
  if (target.kind === 'functional') {
    return `functional:${target.group}`;
  }
  if (target.kind === 'legacy') {
    return `legacy:${target.group}`;
  }
  return 'unknown:target';
}

export type ExerciseLookup =
  | Record<string, Exercise>
  | ((exerciseId: string) => Exercise | undefined);

function resolveExercise(lookup: ExerciseLookup, exerciseId: string): Exercise | undefined {
  if (typeof lookup === 'function') {
    return lookup(exerciseId);
  }
  return lookup[exerciseId];
}

/**
 * Extracts all normalized anatomical muscle exposure events from a list of workout sessions.
 *
 * Rules:
 * 1. Only eligible completed sets generate exposure (warmups & uncompleted sets generate ZERO exposure).
 * 2. Emits one exposure event per resolved muscle contribution in each set.
 * 3. Preserves deterministic physical set identity `${sessionId}:${exerciseId}:${setIndex}`.
 * 4. Categorical effort is extracted without numeric fatigue scoring.
 */
export function extractMuscleExposures(
  sessions: readonly WorkoutSession[],
  exercises: ExerciseLookup
): MuscleExposureEvent[] {
  const exposures: MuscleExposureEvent[] = [];

  for (const session of sessions) {
    const performedAt = session.endedAt ?? session.startedAt;
    const setsByExercise = session.sets || {};

    for (const [exerciseId, sets] of Object.entries(setsByExercise)) {
      if (!Array.isArray(sets) || sets.length === 0) continue;

      const exercise = resolveExercise(exercises, exerciseId) || {
        id: exerciseId,
        name: 'Ejercicio',
        category: 'other',
        primaryMuscle: 'chest'
      };

      const resolvedSemantics = resolveExerciseSemantics(exercise);

      for (let setIndex = 0; setIndex < sets.length; setIndex++) {
        const set = sets[setIndex];
        if (!set) continue;

        // Phase C: Set Eligibility - warmups and uncompleted sets are strictly excluded
        if (!shouldCountForVolume(set)) {
          continue;
        }

        const effort = classifySetEffort(set);
        const reps = Number.isFinite(set.reps) ? Math.max(0, set.reps) : 0;
        const loadKg = Number.isFinite(set.weightKg) ? Math.max(0, set.weightKg) : 0;

        for (const contribution of resolvedSemantics.contributions) {
          const targetKey = getContributionTargetKey(contribution.target);
          const exposureId = `${session.id}:${exercise.id}:${setIndex}:${targetKey}`;

          exposures.push(
            Object.freeze({
              id: exposureId,
              sessionId: session.id,
              exerciseId: exercise.id,
              setIndex,
              performedAt,
              target: contribution.target,
              role: contribution.role,
              source: resolvedSemantics.source,
              semanticConfidence: contribution.confidence,
              semanticStatus: contribution.status,
              effort,
              reps,
              loadKg
            })
          );
        }
      }
    }
  }

  return exposures;
}
