import type { EvidenceConfidence, MuscleRole } from './exerciseSemantics.js';
import type { ResolvedExerciseContributionTarget } from './exerciseSemanticsResolver.js';
import {
  type MuscleExposureEvent,
  type MuscleExposureSource,
  getContributionTargetKey
} from './muscleExposure.js';

export type FatigueState = 'fatigued' | 'recovering' | 'adapted' | 'fresh';

export type FatigueConfidence = 'high' | 'moderate' | 'low';

/**
 * Pure, fact-based evidence record summarizing recent training stimulus for a muscle target.
 *
 * PROHIBITED INVARIANTS:
 * - NO exponential decay formulas.
 * - NO 0–100 recovery score.
 * - NO physiological percentages.
 * - NO role coefficients (e.g. prime = 1.0, secondary = 0.4).
 * - NO assumed RIR for missing entries.
 */
export interface MuscleFatigueEvidence {
  readonly target: ResolvedExerciseContributionTarget;
  readonly roles: readonly MuscleRole[];
  readonly source: 'semantic_v2' | 'legacy' | 'mixed';
  readonly lastExposureAt: string | null;

  /** Total unique physical sets in which this target participated */
  readonly totalEligibleSets: number;

  /** Physical sets performed to failure (RIR <= 0 or RPE >= 10) */
  readonly failureSets: number;

  /** Physical sets performed hard (0 < RIR <= 2 or 8 <= RPE < 10) */
  readonly hardSets: number;

  /** Physical sets performed submaximally (RIR > 2 or RPE < 8) */
  readonly submaximalSets: number;

  /** Physical sets with no logged RIR or RPE (strictly preserved, never assumed) */
  readonly unknownEffortSets: number;

  /** Total distinct sessions with exposure for this target */
  readonly sessionCount: number;

  /** Evidence confidence from curated semantics if available */
  readonly semanticConfidence?: EvidenceConfidence;

  /** Raw underlying exposure events for audit and policy evaluation */
  readonly exposures: readonly MuscleExposureEvent[];
}

export interface FatigueStimulusClassification {
  readonly target: ResolvedExerciseContributionTarget;
  readonly totalSets: number;
  readonly effectiveHardSets: number;
  readonly dominantRole: MuscleRole;
}

/**
 * Replaceable policy boundary for Fatigue v2.
 * All theoretical and research-driven decisions (state transition windows,
 * stimulus classification, systemic fatigue heuristics) plug into this centralized interface.
 */
export interface FatiguePolicy<TState = FatigueState> {
  classifyStimulus(evidence: MuscleFatigueEvidence): FatigueStimulusClassification;
  resolveState(evidence: MuscleFatigueEvidence, referenceTime: Date): TState;
  resolveConfidence(evidence: MuscleFatigueEvidence): FatigueConfidence;
}

/**
 * Pure fact-based evidence extractor: aggregates raw muscle exposures into
 * structured evidence ready for policy evaluation.
 */
export function extractMuscleFatigueEvidence(
  exposures: readonly MuscleExposureEvent[]
): MuscleFatigueEvidence[] {
  interface EvidenceAccumulator {
    target: ResolvedExerciseContributionTarget;
    roles: Set<MuscleRole>;
    physicalSetIds: Set<string>;
    failureSetIds: Set<string>;
    hardSetIds: Set<string>;
    submaximalSetIds: Set<string>;
    unknownEffortSetIds: Set<string>;
    sessionIds: Set<string>;
    lastExposureAt: string | null;
    sources: Set<MuscleExposureSource>;
    semanticConfidence?: EvidenceConfidence;
    exposures: MuscleExposureEvent[];
  }

  const map = new Map<string, EvidenceAccumulator>();

  for (const exp of exposures) {
    const key = getContributionTargetKey(exp.target);
    let acc = map.get(key);
    if (!acc) {
      acc = {
        target: exp.target,
        roles: new Set<MuscleRole>(),
        physicalSetIds: new Set<string>(),
        failureSetIds: new Set<string>(),
        hardSetIds: new Set<string>(),
        submaximalSetIds: new Set<string>(),
        unknownEffortSetIds: new Set<string>(),
        sessionIds: new Set<string>(),
        lastExposureAt: null,
        sources: new Set<MuscleExposureSource>(),
        semanticConfidence: exp.semanticConfidence,
        exposures: []
      };
      map.set(key, acc);
    }

    acc.roles.add(exp.role);
    acc.sessionIds.add(exp.sessionId);
    acc.sources.add(exp.source);
    acc.exposures.push(exp);

    const physicalSetId = `${exp.sessionId}:${exp.exerciseId}:${exp.setIndex}`;
    acc.physicalSetIds.add(physicalSetId);

    switch (exp.effort) {
      case 'failure':
        acc.failureSetIds.add(physicalSetId);
        break;
      case 'hard':
        acc.hardSetIds.add(physicalSetId);
        break;
      case 'submaximal':
        acc.submaximalSetIds.add(physicalSetId);
        break;
      case 'unknown':
        acc.unknownEffortSetIds.add(physicalSetId);
        break;
    }

    if (
      !acc.lastExposureAt ||
      Date.parse(exp.performedAt) > Date.parse(acc.lastExposureAt)
    ) {
      acc.lastExposureAt = exp.performedAt;
    }
  }

  const result: MuscleFatigueEvidence[] = [];

  for (const acc of map.values()) {
    let source: 'semantic_v2' | 'legacy' | 'mixed' = 'mixed';
    if (acc.sources.size === 1) {
      source = acc.sources.has('semantic_v2') ? 'semantic_v2' : 'legacy';
    }

    result.push(
      Object.freeze({
        target: acc.target,
        roles: Object.freeze([...acc.roles]),
        source,
        lastExposureAt: acc.lastExposureAt,
        totalEligibleSets: acc.physicalSetIds.size,
        failureSets: acc.failureSetIds.size,
        hardSets: acc.hardSetIds.size,
        submaximalSets: acc.submaximalSetIds.size,
        unknownEffortSets: acc.unknownEffortSetIds.size,
        sessionCount: acc.sessionIds.size,
        semanticConfidence: acc.semanticConfidence,
        exposures: Object.freeze([...acc.exposures])
      })
    );
  }

  return result;
}

/**
 * Neutral reference implementation of the FatiguePolicy boundary.
 * Strictly neutral: contains ZERO recovery time windows, zero decay formulas,
 * and zero speculative thresholds.
 * The approved research-driven FatiguePolicyV1 will be plugged in here in the next block.
 */
export const NeutralFatiguePolicy: FatiguePolicy<FatigueState> = Object.freeze({
  classifyStimulus(evidence: MuscleFatigueEvidence): FatigueStimulusClassification {
    return Object.freeze({
      target: evidence.target,
      totalSets: evidence.totalEligibleSets,
      effectiveHardSets: evidence.failureSets + evidence.hardSets,
      dominantRole: evidence.roles[0] ?? 'minimal'
    });
  },

  resolveState(evidence: MuscleFatigueEvidence, _referenceTime: Date): FatigueState {
    if (!evidence.lastExposureAt || evidence.totalEligibleSets === 0) {
      return 'fresh';
    }
    // Neutral reference implementation returns 'adapted' when exposed, without speculative time windows
    return 'adapted';
  },

  resolveConfidence(evidence: MuscleFatigueEvidence): FatigueConfidence {
    if (evidence.source === 'semantic_v2' && evidence.unknownEffortSets === 0) {
      return 'high';
    }
    if (evidence.source === 'semantic_v2' || evidence.unknownEffortSets < evidence.totalEligibleSets) {
      return 'moderate';
    }
    return 'low';
  }
});

export const DefaultFatiguePolicy = NeutralFatiguePolicy;
