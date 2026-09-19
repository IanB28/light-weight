import {
  type MuscleExposureEvent,
  type MuscleExposureSource,
  type MuscleRole,
  type ResolvedExerciseContributionTarget,
  type WorkoutSession,
  type Exercise,
  extractMuscleExposures,
  calculateSemanticMuscleBalance,
  type MuscleBalanceExposure,
  getContributionTargetKey
} from '@light-weight/domain';
import {
  type BodyMusclePath,
  ALL_BODY_MUSCLE_PATHS,
  MUSCLE_ROLE_PRECEDENCE,
  mapContributionTargetToBodyPath
} from './exercise-anatomy.js';

export interface BalanceBodyPathData {
  readonly pathKey: BodyMusclePath;

  /**
   * Deduplicated count of unique physical completed sets that stimulated this SVG path.
   * INVARIANT: If multiple muscle targets collapse into this path (e.g. lats + rhomboids + teres major -> upper-back),
   * a single physical set counts as EXACTLY 1 exposure, never N.
   */
  readonly exposureCount: number;

  /**
   * Deduplicated count of physical sets performed with hard or failure effort (RIR <= 2 or RPE >= 8).
   */
  readonly hardExposureCount: number;

  /**
   * All distinct semantic targets that contributed to this SVG region.
   */
  readonly contributors: readonly ResolvedExerciseContributionTarget[];

  readonly roles: readonly MuscleRole[];
  readonly strongestRole: MuscleRole;
  readonly lastExposedAt: string | null;
  readonly sources: readonly MuscleExposureSource[];
}

export interface SemanticBalanceResult {
  readonly exposures: readonly MuscleExposureEvent[];
  readonly targetBalance: readonly MuscleBalanceExposure[];
  readonly pathBalance: Partial<Record<BodyMusclePath, BalanceBodyPathData>>;
}

/**
 * Aggregates raw semantic exposure events into SVG body paths for anatomical balance visualization.
 *
 * CRITICAL INVARIANT — PHYSICAL SET DEDUPLICATION:
 * When multiple targets map to one SVG region (e.g. latissimus_dorsi, rhomboids, teres_major -> upper-back),
 * every physical set identity `${sessionId}:${exerciseId}:${setIndex}` is deduplicated.
 * 1 physical set = 1 exposure count on that path, while preserving all 3 contributors.
 */
export function aggregateBalanceByBodyPath(
  exposures: readonly MuscleExposureEvent[]
): Partial<Record<BodyMusclePath, BalanceBodyPathData>> {
  interface PathAccumulator {
    pathKey: BodyMusclePath;
    physicalSetIds: Set<string>;
    hardPhysicalSetIds: Set<string>;
    contributorsMap: Map<string, ResolvedExerciseContributionTarget>;
    roles: Set<MuscleRole>;
    sources: Set<MuscleExposureSource>;
    lastExposedAt: string | null;
  }

  const map = new Map<BodyMusclePath, PathAccumulator>();

  for (const exp of exposures) {
    const path = mapContributionTargetToBodyPath(exp.target);
    if (!path) continue;

    let acc = map.get(path);
    if (!acc) {
      acc = {
        pathKey: path,
        physicalSetIds: new Set<string>(),
        hardPhysicalSetIds: new Set<string>(),
        contributorsMap: new Map<string, ResolvedExerciseContributionTarget>(),
        roles: new Set<MuscleRole>(),
        sources: new Set<MuscleExposureSource>(),
        lastExposedAt: null
      };
      map.set(path, acc);
    }

    const physicalSetId = `${exp.sessionId}:${exp.exerciseId}:${exp.setIndex}`;
    acc.physicalSetIds.add(physicalSetId);

    if (exp.effort === 'hard' || exp.effort === 'failure') {
      acc.hardPhysicalSetIds.add(physicalSetId);
    }

    const targetKey = getContributionTargetKey(exp.target);
    if (!acc.contributorsMap.has(targetKey)) {
      acc.contributorsMap.set(targetKey, exp.target);
    }

    acc.roles.add(exp.role);
    acc.sources.add(exp.source);

    if (
      !acc.lastExposedAt ||
      Date.parse(exp.performedAt) > Date.parse(acc.lastExposedAt)
    ) {
      acc.lastExposedAt = exp.performedAt;
    }
  }

  const result: Partial<Record<BodyMusclePath, BalanceBodyPathData>> = {};

  for (const acc of map.values()) {
    let strongestRole: MuscleRole = 'minimal';
    let bestPrecedenceIndex = Number.POSITIVE_INFINITY;

    for (const r of acc.roles) {
      const idx = MUSCLE_ROLE_PRECEDENCE.indexOf(r);
      if (idx !== -1 && idx < bestPrecedenceIndex) {
        bestPrecedenceIndex = idx;
        strongestRole = r;
      }
    }

    result[acc.pathKey] = Object.freeze({
      pathKey: acc.pathKey,
      exposureCount: acc.physicalSetIds.size,
      hardExposureCount: acc.hardPhysicalSetIds.size,
      contributors: Object.freeze([...acc.contributorsMap.values()]),
      roles: Object.freeze([...acc.roles]),
      strongestRole,
      lastExposedAt: acc.lastExposedAt,
      sources: Object.freeze([...acc.sources])
    });
  }

  return Object.freeze(result);
}

/**
 * Computes the complete semantic balance dataset for a workout history.
 */
export function computeSemanticBalanceForHistory(
  history: readonly WorkoutSession[],
  exercisesById: Record<string, Exercise>
): SemanticBalanceResult {
  const exposures = extractMuscleExposures(history, exercisesById);
  const targetBalance = calculateSemanticMuscleBalance(exposures);
  const pathBalance = aggregateBalanceByBodyPath(exposures);

  return Object.freeze({
    exposures: Object.freeze(exposures),
    targetBalance: Object.freeze(targetBalance),
    pathBalance
  });
}

/**
 * Returns all canonical BodyMusclePaths that received zero exposure in the active dataset.
 */
export function getUnderexposedBodyPaths(
  pathBalance: Partial<Record<BodyMusclePath, BalanceBodyPathData>>
): readonly BodyMusclePath[] {
  return Object.freeze(
    ALL_BODY_MUSCLE_PATHS.filter(
      (path) => !pathBalance[path] || pathBalance[path]!.exposureCount === 0
    )
  );
}

/**
 * Returns canonical BodyMusclePaths sorted by exposureCount descending,
 * placing actively exposed paths first followed by unexposed paths.
 */
export function getSortedBodyPathsByExposure(
  pathBalance: Partial<Record<BodyMusclePath, BalanceBodyPathData>>
): readonly BodyMusclePath[] {
  return Object.freeze(
    [...ALL_BODY_MUSCLE_PATHS].sort((a, b) => {
      const countA = pathBalance[a]?.exposureCount ?? 0;
      const countB = pathBalance[b]?.exposureCount ?? 0;
      if (countB !== countA) return countB - countA;
      return a.localeCompare(b);
    })
  );
}
