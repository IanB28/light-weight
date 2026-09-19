import type { Exercise, MuscleGroup } from './types.js';
import type {
  EvidenceConfidence,
  MovementFamily,
  MuscleContributionTarget,
  MuscleRole,
  SemanticEvidenceStatus
} from './exerciseSemantics.js';
import { EXERCISE_SEMANTICS_REGISTRY } from './exerciseSemantics.js';

/**
 * Resolved target of an exercise muscle contribution.
 * Invariant: Canonical v2 profiles contain only MuscleContributionTarget (anatomical | functional).
 * The legacy variant exists ONLY in the resolved/fallback representation for uncurated catalog exercises.
 */
export type ResolvedExerciseContributionTarget =
  | MuscleContributionTarget
  | {
      readonly kind: 'legacy';
      readonly group: MuscleGroup;
    };

export interface ResolvedExerciseContribution {
  readonly target: ResolvedExerciseContributionTarget;
  readonly role: MuscleRole;
  readonly confidence?: EvidenceConfidence;
  readonly status?: SemanticEvidenceStatus;
  readonly evidenceIds?: readonly string[];
}

export interface ResolvedExerciseSemantics {
  readonly source: 'semantic_v2' | 'legacy';
  readonly profileKey?: string;
  readonly movementFamily?: MovementFamily;
  readonly variation?: string;
  readonly contributions: readonly ResolvedExerciseContribution[];
}

/**
 * Deterministic mapping table from curated exercise catalog IDs to
 * semantic profile keys in EXERCISE_SEMANTICS_REGISTRY.
 * Every mapped ID corresponds to a verified exercise in the production catalog.
 */
export const EXERCISE_ID_TO_SEMANTICS_KEY: Readonly<Record<string, string>> = Object.freeze({
  'ex-0025': 'flat_bench_press', // Barbell bench press
  'ex-0033': 'decline_bench_press', // Barbell decline bench press
  'ex-0047': 'incline_bench_press', // Barbell incline bench press
  'ex-0043': 'back_squat', // Barbell full squat
  'ex-0032': 'conventional_deadlift', // Barbell deadlift
  'ex-0117': 'sumo_deadlift', // Barbell sumo deadlift
  'ex-0085': 'romanian_deadlift', // Barbell romanian deadlift
  'ex-0027': 'barbell_row', // Barbell bent over row
  'ex-0652': 'pull_up', // Pull-up
  'ex-1326': 'chin_up', // Chin-up
  'ex-0198': 'lat_pulldown', // Cable pulldown
  'ex-0739': 'generic_leg_press', // Sled 45° leg press
  'ex-0405': 'dumbbell_shoulder_press', // Dumbbell seated shoulder press
  'ex-0603': 'machine_shoulder_press' // Lever shoulder press
});

/**
 * Pure, centralized domain resolver: maps an Exercise to its resolved muscle contributions.
 * Prioritizes curated Semantic v2 profiles; uses conservative legacy fallback when none exists.
 */
export function resolveExerciseSemantics(
  exercise: Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>
): ResolvedExerciseSemantics {
  const profileKey = EXERCISE_ID_TO_SEMANTICS_KEY[exercise.id];

  if (profileKey && EXERCISE_SEMANTICS_REGISTRY[profileKey]) {
    const profile = EXERCISE_SEMANTICS_REGISTRY[profileKey];
    return Object.freeze({
      source: 'semantic_v2',
      profileKey,
      movementFamily: profile.movementFamily,
      variation: profile.variation,
      contributions: Object.freeze(
        profile.contributions.map((c) =>
          Object.freeze({
            target: c.target,
            role: c.role,
            confidence: c.confidence,
            status: c.status,
            evidenceIds: c.evidenceIds ? Object.freeze([...c.evidenceIds]) : undefined
          })
        )
      )
    });
  }

  // Conservative legacy fallback
  const contributions: ResolvedExerciseContribution[] = [];

  if (exercise.primaryMuscle) {
    contributions.push(
      Object.freeze({
        target: { kind: 'legacy' as const, group: exercise.primaryMuscle },
        role: 'prime'
      })
    );
  }

  if (Array.isArray(exercise.secondaryMuscles)) {
    for (const sec of exercise.secondaryMuscles) {
      if (sec && sec !== exercise.primaryMuscle) {
        contributions.push(
          Object.freeze({
            target: { kind: 'legacy' as const, group: sec },
            role: 'secondary'
          })
        );
      }
    }
  }

  return Object.freeze({
    source: 'legacy',
    contributions: Object.freeze(contributions)
  });
}
