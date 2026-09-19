import type { Exercise, MuscleGroup } from './types.js';
import type {
  EvidenceConfidence,
  MovementFamily,
  MuscleContributionTarget,
  MuscleRole,
  SemanticEvidenceStatus
} from './exerciseSemantics.js';
import { EXERCISE_SEMANTICS_REGISTRY } from './exerciseSemantics.js';
import { MUSCLE_ENTITY_METADATA } from './muscleTaxonomy.js';
import { ALL_STRENGTH_MUSCLE_GROUPS } from './strengthStandards.js';

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
  const profileKey = EXERCISE_ID_TO_SEMANTICS_KEY[exercise.id] ?? (EXERCISE_SEMANTICS_REGISTRY[exercise.id] ? exercise.id : undefined);

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

/**
 * Resolves the single canonical prime muscle contribution for an exercise.
 * If the exercise has no prime contribution, returns null.
 */
export function resolveExercisePrimeContribution(
  exercise: Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>
): ResolvedExerciseContribution | null {
  const resolved = resolveExerciseSemantics(exercise);
  const primes = resolved.contributions.filter((c) => c.role === 'prime');
  if (primes.length === 0) {
    return null;
  }
  return primes[0];
}

/**
 * Resolves the target of the canonical prime muscle contribution for an exercise.
 */
export function resolveExercisePrimeTarget(
  exercise: Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>
): ResolvedExerciseContributionTarget | null {
  const prime = resolveExercisePrimeContribution(exercise);
  return prime ? prime.target : null;
}

const SUPPORTED_STRENGTH_MUSCLES = new Set<MuscleGroup>(ALL_STRENGTH_MUSCLE_GROUPS);

/**
 * Explicit whitelist of canonical prime targets mapped to a supported Strength MuscleGroup.
 *
 * This whitelist answers:
 * "Which Strength group does the canonical prime belong to?"
 * It does NOT answer:
 * "Which benchmark standard is scientifically valid for this exercise?"
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * Anatomical proximity or SVG visual projection (e.g. adductor_magnus -> quadriceps,
 * tibialis_anterior -> calves, serratus_anterior -> core, erector_spinae -> back,
 * rotator_cuff -> shoulders) must NOT automatically authorize a Strength evaluation.
 * Targets not in this whitelist resolve strictly to null (unrated).
 */
export const STRENGTH_SUPPORTED_PRIME_TARGETS: Readonly<Record<string, MuscleGroup>> = Object.freeze({
  pectoralis_major: 'chest',
  anterior_deltoid: 'shoulders',
  posterior_deltoid: 'shoulders',
  latissimus_dorsi: 'back',
  quadriceps: 'quadriceps',
  hamstrings: 'hamstrings',
  gluteus_maximus: 'glutes'
});

/**
 * Internal helper: maps an extracted canonical prime target to a supported Strength MuscleGroup.
 * Kept internal and non-authoritative: external callers MUST provide an Exercise to ensure
 * prime extraction cannot be bypassed.
 */
function mapPrimeTargetToStrengthGroup(target: ResolvedExerciseContributionTarget): MuscleGroup | null {
  // 1. Explicit Strength-supported prime whitelist for curated anatomical profiles
  if (target.kind === 'anatomical') {
    return STRENGTH_SUPPORTED_PRIME_TARGETS[target.entity] ?? null;
  }

  // 2. Legacy uncurated exercises retain primaryMuscle fallback as compatibility behavior (attribution only)
  if (target.kind === 'legacy') {
    if (SUPPORTED_STRENGTH_MUSCLES.has(target.group)) {
      return target.group;
    }
    return null;
  }

  // 3. Functional and regional prime targets do not have approved discrete Strength standards
  return null;
}

/**
 * Pure domain adapter: maps the canonical prime contribution of an exercise
 * to a supported Strength standard MuscleGroup.
 *
 * Invariants:
 * - Accepts EXERCISE ONLY (naked targets cannot bypass canonical prime resolution).
 * - Strength observations are attributed ONLY to the canonical prime contribution.
 * - Co-prime and secondary contributions are NEVER mapped as the exercise's Strength target.
 * - For curated v2 profiles, resolves strictly via STRENGTH_SUPPORTED_PRIME_TARGETS.
 * - Targets not in the whitelist (e.g. adductor_magnus, tibialis_anterior, functional groups)
 *   resolve strictly to null (never collapsed to broad groups through anatomical proximity).
 * - For uncurated exercises, falls back conservatively to legacy primaryMuscle if supported (attribution only).
 */
export function resolveExerciseStrengthTarget(
  exercise: Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>
): MuscleGroup | null {
  const primeTarget = resolveExercisePrimeTarget(exercise);
  if (!primeTarget) {
    return null;
  }
  return mapPrimeTargetToStrengthGroup(primeTarget);
}
