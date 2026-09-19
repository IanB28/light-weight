import {
  type MuscleFatigueResultV2,
  type FatigueState,
  type FatigueConfidence,
  type FatigueReason,
  type MuscleRole,
  type ResolvedExerciseContributionTarget,
  type WorkoutSession,
  type Exercise,
  calculateTargetFatigueV2,
  resolveFatigueStateFromResidualFeu,
  FATIGUE_STATE_THRESHOLDS_V1
} from '@light-weight/domain';
import {
  type BodyMusclePath,
  ALL_BODY_MUSCLE_PATHS,
  MUSCLE_ROLE_PRECEDENCE,
  mapContributionTargetToBodyPath
} from './exercise-anatomy.js';

export interface FatigueContributorData {
  readonly target: ResolvedExerciseContributionTarget;
  readonly residualFeu: number;
  readonly rolling7DayFeu: number;
  readonly role?: MuscleRole;
  readonly totalEligibleSets: number;
  readonly unknownEffortCount: number;
  readonly state: FatigueState;
  readonly confidence: FatigueConfidence;
  readonly semanticConfidence?: string;
  readonly source?: 'semantic_v2' | 'legacy' | 'mixed';
}

export interface FatigueBodyPathData {
  readonly pathKey: BodyMusclePath;
  readonly residualFeu: number;
  readonly rolling7DayFeu: number;
  readonly state: FatigueState;
  readonly confidence: FatigueConfidence;
  readonly totalEligibleSets: number;
  readonly unknownEffortCount: number;
  readonly lastExposedAt: string | null;
  readonly strongestRole?: MuscleRole;
  readonly reasons: readonly FatigueReason[];
  readonly contributors: readonly FatigueContributorData[];
}

export interface SemanticFatigueResult {
  readonly targetFatigue: readonly MuscleFatigueResultV2[];
  readonly pathFatigue: Partial<Record<BodyMusclePath, FatigueBodyPathData>>;
}

/**
 * Aggregates semantic target fatigue results into body SVG paths.
 *
 * CRITICAL ARCHITECTURAL DIFFERENCE:
 * Balance: physical-set exposure deduplication (1 physical set = 1 exposure count).
 * Fatigue: semantic target FEU aggregation (PathResidualFEU = SUM(distinct target ResidualFEU)).
 * Distinct anatomical contributors mapped to the same SVG region (e.g. lats, rhomboids, teres major -> upper-back)
 * legitimately accumulate their independent residual loads.
 */
export function aggregateFatigueByBodyPath(
  targetResults: readonly MuscleFatigueResultV2[]
): Partial<Record<BodyMusclePath, FatigueBodyPathData>> {
  interface PathAccumulator {
    pathKey: BodyMusclePath;
    residualFeu: number;
    rolling7DayFeu: number;
    totalEligibleSets: number;
    unknownEffortCount: number;
    lastExposedAt: string | null;
    contributors: FatigueContributorData[];
    confidences: FatigueConfidence[];
    roles: MuscleRole[];
    reasons: Set<string>;
    reasonObjects: FatigueReason[];
  }

  const map = new Map<BodyMusclePath, PathAccumulator>();

  for (const tr of targetResults) {
    const path = mapContributionTargetToBodyPath(tr.target);
    if (!path) continue;

    let acc = map.get(path);
    if (!acc) {
      acc = {
        pathKey: path,
        residualFeu: 0,
        rolling7DayFeu: 0,
        totalEligibleSets: 0,
        unknownEffortCount: 0,
        lastExposedAt: null,
        contributors: [],
        confidences: [],
        roles: [],
        reasons: new Set<string>(),
        reasonObjects: []
      };
      map.set(path, acc);
    }

    acc.residualFeu += tr.residualFeu;
    acc.rolling7DayFeu += tr.rolling7DayFeu;
    acc.totalEligibleSets += tr.totalEligibleSets;
    acc.unknownEffortCount += tr.unknownEffortExposureCount;
    acc.confidences.push(tr.confidence);

    if (tr.dominantRole) {
      acc.roles.push(tr.dominantRole);
    }

    if (!acc.lastExposedAt || (tr.lastExposureAt && Date.parse(tr.lastExposureAt) > Date.parse(acc.lastExposedAt))) {
      acc.lastExposedAt = tr.lastExposureAt;
    }

    for (const r of tr.reasons) {
      if (!acc.reasons.has(r.code)) {
        acc.reasons.add(r.code);
        acc.reasonObjects.push(r);
      }
    }

    acc.contributors.push(
      Object.freeze({
        target: tr.target,
        residualFeu: tr.residualFeu,
        rolling7DayFeu: tr.rolling7DayFeu,
        role: tr.dominantRole,
        totalEligibleSets: tr.totalEligibleSets,
        unknownEffortCount: tr.unknownEffortExposureCount,
        state: tr.state,
        confidence: tr.confidence,
        semanticConfidence: tr.semanticConfidence,
        source: tr.source
      })
    );
  }

  const result: Partial<Record<BodyMusclePath, FatigueBodyPathData>> = {};

  for (const acc of map.values()) {
    const state: FatigueState = resolveFatigueStateFromResidualFeu(acc.residualFeu);

    let confidence: FatigueConfidence = 'high';
    if (acc.confidences.includes('low')) {
      confidence = 'low';
    } else if (acc.confidences.includes('moderate')) {
      confidence = 'moderate';
    }

    // Unknown effort safety
    if (state === 'fresh' && acc.unknownEffortCount > 0 && confidence === 'high') {
      confidence = 'moderate';
    }

    acc.roles.sort((a, b) => MUSCLE_ROLE_PRECEDENCE.indexOf(a) - MUSCLE_ROLE_PRECEDENCE.indexOf(b));

    result[acc.pathKey] = Object.freeze({
      pathKey: acc.pathKey,
      residualFeu: acc.residualFeu,
      rolling7DayFeu: acc.rolling7DayFeu,
      state,
      confidence,
      totalEligibleSets: acc.totalEligibleSets,
      unknownEffortCount: acc.unknownEffortCount,
      lastExposedAt: acc.lastExposedAt,
      strongestRole: acc.roles[0],
      reasons: Object.freeze([...acc.reasonObjects]),
      contributors: Object.freeze([...acc.contributors])
    });
  }

  return result;
}

/**
 * Computes semantic fatigue for all workout history and resolves body path mapping.
 */
export function computeSemanticFatigueForHistory(
  history: readonly WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  referenceTimeMs?: number
): SemanticFatigueResult {
  const targetFatigue = calculateTargetFatigueV2(history, exercisesById, {
    referenceTimeMs
  });
  const pathFatigue = aggregateFatigueByBodyPath(targetFatigue);
  return Object.freeze({
    targetFatigue,
    pathFatigue
  });
}

/**
 * Returns body paths sorted by residual FEU descending (highest fatigue first).
 */
export function getSortedBodyPathsByFatigue(
  pathFatigue: Partial<Record<BodyMusclePath, FatigueBodyPathData>>
): BodyMusclePath[] {
  return [...ALL_BODY_MUSCLE_PATHS].sort((a, b) => {
    const feuA = pathFatigue[a]?.residualFeu ?? 0;
    const feuB = pathFatigue[b]?.residualFeu ?? 0;
    if (feuB !== feuA) {
      return feuB - feuA;
    }
    return a.localeCompare(b);
  });
}
