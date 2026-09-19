import type { MuscleRole } from './exerciseSemantics.js';
import type { ResolvedExerciseContributionTarget } from './exerciseSemanticsResolver.js';
import {
  type MuscleExposureEvent,
  type MuscleExposureSource,
  getContributionTargetKey
} from './muscleExposure.js';

export interface RoleExposureCounts {
  readonly prime: number;
  readonly co_prime: number;
  readonly secondary: number;
  readonly resisted_isometric: number;
  readonly stabilizer: number;
  readonly minimal: number;
}

/**
 * Balance v2 semantic exposure record for a single muscle target.
 *
 * CRITICAL INVARIANTS:
 * 1. exposureCount means: number of unique eligible physical sets in which this target participated.
 * 2. It does NOT mean: effective hypertrophy sets, fractional sets, training credit, or recruitment %.
 * 3. All 6 roles are preserved without collapse or numeric weighting (prime = 1.0, etc. is strictly forbidden).
 */
export interface MuscleBalanceExposure {
  readonly target: ResolvedExerciseContributionTarget;
  readonly roles: readonly MuscleRole[];
  readonly roleExposureCounts: RoleExposureCounts;

  /** Total unique physical sets in which this muscle participated */
  readonly exposureCount: number;

  /** Unique physical sets with hard or failure effort (RIR <= 2 or RPE >= 8) */
  readonly hardExposureCount: number;

  /** Number of distinct sessions containing exposure for this target */
  readonly sessionCount: number;

  /** ISO date string of most recent exposure, or null if none */
  readonly lastExposedAt: string | null;

  readonly source: 'semantic_v2' | 'legacy' | 'mixed';

  /** Deterministic exposure event IDs associated with this target */
  readonly exposureIds: readonly string[];
}

/**
 * Calculates semantic muscle balance across training history from raw exposure events.
 *
 * Invariants:
 * - Deterministic aggregation.
 * - Deduplicates physical sets per target.
 * - Preserves all 6 qualitative roles without weighting.
 */
export function calculateSemanticMuscleBalance(
  exposures: readonly MuscleExposureEvent[]
): MuscleBalanceExposure[] {
  interface TargetAccumulator {
    target: ResolvedExerciseContributionTarget;
    roles: Set<MuscleRole>;
    roleCounts: Record<MuscleRole, number>;
    physicalSetIds: Set<string>;
    hardPhysicalSetIds: Set<string>;
    sessionIds: Set<string>;
    lastExposedAt: string | null;
    sources: Set<MuscleExposureSource>;
    exposureIds: string[];
  }

  const map = new Map<string, TargetAccumulator>();

  for (const exp of exposures) {
    const key = getContributionTargetKey(exp.target);
    let acc = map.get(key);
    if (!acc) {
      acc = {
        target: exp.target,
        roles: new Set<MuscleRole>(),
        roleCounts: {
          prime: 0,
          co_prime: 0,
          secondary: 0,
          resisted_isometric: 0,
          stabilizer: 0,
          minimal: 0
        },
        physicalSetIds: new Set<string>(),
        hardPhysicalSetIds: new Set<string>(),
        sessionIds: new Set<string>(),
        lastExposedAt: null,
        sources: new Set<MuscleExposureSource>(),
        exposureIds: []
      };
      map.set(key, acc);
    }

    acc.roles.add(exp.role);
    acc.roleCounts[exp.role] = (acc.roleCounts[exp.role] || 0) + 1;

    const physicalSetId = `${exp.sessionId}:${exp.exerciseId}:${exp.setIndex}`;
    acc.physicalSetIds.add(physicalSetId);

    if (exp.effort === 'hard' || exp.effort === 'failure') {
      acc.hardPhysicalSetIds.add(physicalSetId);
    }

    acc.sessionIds.add(exp.sessionId);
    acc.sources.add(exp.source);
    acc.exposureIds.push(exp.id);

    if (
      !acc.lastExposedAt ||
      Date.parse(exp.performedAt) > Date.parse(acc.lastExposedAt)
    ) {
      acc.lastExposedAt = exp.performedAt;
    }
  }

  const result: MuscleBalanceExposure[] = [];

  for (const acc of map.values()) {
    let source: 'semantic_v2' | 'legacy' | 'mixed' = 'mixed';
    if (acc.sources.size === 1) {
      source = acc.sources.has('semantic_v2') ? 'semantic_v2' : 'legacy';
    }

    result.push(
      Object.freeze({
        target: acc.target,
        roles: Object.freeze([...acc.roles]),
        roleExposureCounts: Object.freeze({
          prime: acc.roleCounts.prime,
          co_prime: acc.roleCounts.co_prime,
          secondary: acc.roleCounts.secondary,
          resisted_isometric: acc.roleCounts.resisted_isometric,
          stabilizer: acc.roleCounts.stabilizer,
          minimal: acc.roleCounts.minimal
        }),
        exposureCount: acc.physicalSetIds.size,
        hardExposureCount: acc.hardPhysicalSetIds.size,
        sessionCount: acc.sessionIds.size,
        lastExposedAt: acc.lastExposedAt,
        source,
        exposureIds: Object.freeze([...acc.exposureIds])
      })
    );
  }

  return result;
}
