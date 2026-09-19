import type { EvidenceConfidence, MuscleRole } from './exerciseSemantics.js';
import type { ResolvedExerciseContributionTarget } from './exerciseSemanticsResolver.js';
import {
  type MuscleExposureEvent,
  type MuscleExposureSource,
  type ExerciseLookup,
  extractMuscleExposures,
  getContributionTargetKey
} from './muscleExposure.js';
import type { WorkoutSession, LoggedSet } from './types.js';

/**
 * Canonical Fatigue states for FatiguePolicyV1.
 * INVARIANT: 'adapted' is permanently removed from V2 contracts and UI.
 */
export type FatigueState = 'fatigued' | 'recovering' | 'ready' | 'fresh';

export type FatigueConfidence = 'high' | 'moderate' | 'low';

export type FatigueReasonCode =
  | 'insufficient_effort_data'
  | 'partial_unknown_effort'
  | 'legacy_anatomy'
  | 'effort_conflict'
  | 'elevated_weekly_load'
  | 'high_residual_load';

export interface FatigueReason {
  readonly code: FatigueReasonCode;
  readonly message: string;
}

/**
 * Pure, fact-based evidence record summarizing recent training stimulus for a muscle target.
 *
 * PROHIBITED INVARIANTS:
 * - NO exponential decay formulas.
 * - NO 0–100 recovery score.
 * - NO physiological percentages.
 * - NO assumed RIR for missing entries.
 */
export interface MuscleFatigueEvidence {
  readonly target: ResolvedExerciseContributionTarget;
  readonly roles: readonly MuscleRole[];
  readonly source: 'semantic_v2' | 'legacy' | 'mixed';
  readonly lastExposureAt: string | null;

  /** Total unique physical sets in which this target participated */
  readonly totalEligibleSets: number;

  /** Physical sets performed to failure (RIR == 0 or RPE >= 10) */
  readonly failureSets: number;

  /** Physical sets performed hard (1 <= RIR <= 3 or 7 <= RPE < 10) */
  readonly hardSets: number;

  /** Physical sets performed submaximally (RIR >= 4 or RPE < 7) */
  readonly submaximalSets: number;

  /** Physical sets with no logged RIR or RPE (strictly preserved, never assumed) */
  readonly unknownEffortSets: number;

  /** Total distinct sessions with exposure for this target */
  readonly sessionCount: number;

  /** Conservatively aggregated evidence confidence from curated semantics if available */
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
 * Standard role ranking precedence:
 * prime > co_prime > secondary > resisted_isometric > stabilizer > minimal
 */
export const MUSCLE_ROLE_RANK: Readonly<Record<MuscleRole, number>> = Object.freeze({
  prime: 6,
  co_prime: 5,
  secondary: 4,
  resisted_isometric: 3,
  stabilizer: 2,
  minimal: 1
});

/**
 * PRODUCT POLICY COEFFICIENTS — NOT PHYSIOLOGICAL PERCENTAGES.
 *
 * Definition of internal unit FEU (Fatigue Exposure Unit):
 * 1 FEU = 1 completed eligible set performed at RIR 0 where the evaluated muscle has role = prime.
 * FEU must never be described as percentage fatigue, recovery percentage, muscle damage,
 * or hypertrophy set credit.
 */
export const FATIGUE_EFFORT_COEFFICIENTS_V1 = Object.freeze({
  0: 1.00,
  1: 0.85,
  2: 0.70,
  3: 0.55,
  4: 0.40,
  5: 0.25,
  6: 0.10
} as const);

/**
 * Muscle role contributions:
 * PRODUCT HEURISTICS, NOT EMG OR FORCE CONTRIBUTIONS.
 */
export const FATIGUE_ROLE_COEFFICIENTS_V1 = Object.freeze({
  prime: 1.00,
  co_prime: 0.70,
  secondary: 0.40,
  resisted_isometric: 0.20,
  stabilizer: 0.10,
  minimal: 0.05
} as const);

/**
 * Base temporal clearance rate:
 * PRODUCT CALIBRATION CONSTANT. NOT A PHYSIOLOGICAL CLEARANCE RATE.
 * 0.125 FEU / hour -> 1 FEU clears in 8 hours, 3 FEU clears in 24 hours, 6 FEU in 48 hours.
 */
export const BASE_CLEARANCE_RATE_V1 = 0.125;

/**
 * Categorical state thresholds for FatiguePolicyV1.
 */
export const FATIGUE_STATE_THRESHOLDS_V1 = Object.freeze({
  fatigued: 3.00,
  recovering: 1.00,
  ready: 0.25,
  fresh: 0.00
} as const);

/**
 * Canonical, pure state threshold resolver for FatiguePolicyV1.
 * Evaluates residual FEU against the approved state boundaries:
 * - >= 3.00: fatigued
 * - 1.00 - < 3.00: recovering
 * - 0.25 - < 1.00: ready
 * - < 0.25: fresh
 */
export function resolveFatigueStateFromResidualFeu(residualFeu: number): FatigueState {
  if (residualFeu >= FATIGUE_STATE_THRESHOLDS_V1.fatigued) return 'fatigued';
  if (residualFeu >= FATIGUE_STATE_THRESHOLDS_V1.recovering) return 'recovering';
  if (residualFeu >= FATIGUE_STATE_THRESHOLDS_V1.ready) return 'ready';
  return 'fresh';
}

/**
 * Canonical multi-session independent residual calculator.
 * For each session, sets are aggregated and decayed linearly from the session's timestamp.
 * Total residual load is the sum of independent session residuals.
 */
export function calculateResidualFeuFromExposures(
  exposures: readonly MuscleExposureEvent[],
  referenceTimeMs: number,
  effectiveClearanceRate: number = BASE_CLEARANCE_RATE_V1
): number {
  interface SessionLoad {
    feu: number;
    sessionMs: number;
  }
  const sessionMap = new Map<string, SessionLoad>();

  for (const exp of exposures) {
    const sessionMs = Date.parse(exp.performedAt);
    if (Number.isNaN(sessionMs) || sessionMs > referenceTimeMs) continue;

    let s = sessionMap.get(exp.sessionId);
    if (!s) {
      s = { feu: 0, sessionMs };
      sessionMap.set(exp.sessionId, s);
    }
    const effort = resolveSetEffortV1({ rir: exp.rir, rpe: exp.rpe });
    const roleCoeff = FATIGUE_ROLE_COEFFICIENTS_V1[exp.role];
    s.feu += effort.effortCoeff * roleCoeff;
  }

  let totalResidualFeu = 0;
  for (const s of sessionMap.values()) {
    const elapsedHours = Math.max(0, (referenceTimeMs - s.sessionMs) / 3600000);
    totalResidualFeu += Math.max(0, s.feu - effectiveClearanceRate * elapsedHours);
  }

  return totalResidualFeu;
}

/**
 * Canonical rule for effort coverage confidence evaluation.
 * - 0% unknown -> no penalty (cap: 'high')
 * - >0% and <=50% unknown -> cap: 'moderate'
 * - >50% unknown -> cap: 'low'
 */
export function evaluateEffortCoverageConfidence(
  unknownSets: number,
  totalSets: number
): {
  confidenceCap: FatigueConfidence;
  unknownRatio: number;
  reason?: FatigueReason;
} {
  if (totalSets === 0 || unknownSets === 0) {
    return { confidenceCap: 'high', unknownRatio: 0 };
  }
  const unknownRatio = unknownSets / totalSets;
  if (unknownRatio > 0.5) {
    return {
      confidenceCap: 'low',
      unknownRatio,
      reason: Object.freeze({
        code: 'insufficient_effort_data',
        message: 'Falta información de esfuerzo (RIR/RPE) en más del 50% de las series'
      })
    };
  }
  return {
    confidenceCap: 'moderate',
    unknownRatio,
    reason: Object.freeze({
      code: 'partial_unknown_effort',
      message: 'Algunas series no registran RIR o RPE'
    })
  };
}

/**
 * Aggregates semantic evidence conservatively across multiple exposures for a target.
 * - If any exposure has semanticConfidence = 'low' -> aggregated is 'low'
 * - Else if any has 'moderate' -> aggregated is 'moderate'
 * - Else if all are 'high' -> aggregated is 'high'
 * - If sources contain both 'semantic_v2' and 'legacy' -> source is 'mixed'
 */
export function aggregateSemanticEvidence(
  sources: ReadonlySet<MuscleExposureSource>,
  semanticConfidences: readonly (EvidenceConfidence | undefined)[]
): {
  source: 'semantic_v2' | 'legacy' | 'mixed';
  semanticConfidence?: EvidenceConfidence;
  confidenceCap: FatigueConfidence;
  reason?: FatigueReason;
} {
  let source: 'semantic_v2' | 'legacy' | 'mixed' = 'mixed';
  if (sources.size === 1) {
    source = sources.has('semantic_v2') ? 'semantic_v2' : 'legacy';
  }

  let aggregatedSemanticConfidence: EvidenceConfidence | undefined;
  const validConfidences = semanticConfidences.filter((c): c is EvidenceConfidence => Boolean(c));
  if (validConfidences.length > 0) {
    if (validConfidences.includes('low')) {
      aggregatedSemanticConfidence = 'low';
    } else if (validConfidences.includes('moderate')) {
      aggregatedSemanticConfidence = 'moderate';
    } else {
      aggregatedSemanticConfidence = 'high';
    }
  }

  if (source === 'legacy') {
    return {
      source,
      semanticConfidence: aggregatedSemanticConfidence,
      confidenceCap: 'low',
      reason: Object.freeze({
        code: 'legacy_anatomy',
        message: 'Anatomía basada en mapeo heredado general'
      })
    };
  }

  if (source === 'mixed') {
    return {
      source,
      semanticConfidence: aggregatedSemanticConfidence,
      confidenceCap: 'moderate',
      reason: Object.freeze({
        code: 'legacy_anatomy',
        message: 'Mapeo anatómico mixto (incluye ejercicios sin semántica curada v2)'
      })
    };
  }

  // Pure semantic_v2
  if (aggregatedSemanticConfidence === 'low') {
    return {
      source,
      semanticConfidence: aggregatedSemanticConfidence,
      confidenceCap: 'moderate'
    };
  }
  if (aggregatedSemanticConfidence === 'moderate') {
    return {
      source,
      semanticConfidence: aggregatedSemanticConfidence,
      confidenceCap: 'moderate'
    };
  }

  return {
    source,
    semanticConfidence: aggregatedSemanticConfidence,
    confidenceCap: 'high'
  };
}

export interface SetEffortResolution {
  readonly effortCoeff: number;
  readonly isUnknown: boolean;
  readonly effortConflict: boolean;
  readonly effectiveRir?: number;
}

/**
 * Resolves effort coefficient from a set's logged RIR/RPE.
 *
 * Priority: explicit RIR > RPE-derived RIR > UNKNOWN.
 * Material conflict: |RIR - (10 - RPE)| >= 2 flags effortConflict and reduces confidence.
 * Invariant: Missing RIR/RPE strictly yields 0 measured FEU and isUnknown = true. Never defaults to 2 or 3.
 */
export function resolveSetEffortV1(set: Pick<LoggedSet, 'rir' | 'rpe'>): SetEffortResolution {
  if (typeof set.rir === 'number' && Number.isFinite(set.rir)) {
    const rawRir = set.rir;
    const boundedRir = Math.max(0, Math.round(rawRir));
    const effortCoeff =
      boundedRir >= 6
        ? FATIGUE_EFFORT_COEFFICIENTS_V1[6]
        : FATIGUE_EFFORT_COEFFICIENTS_V1[boundedRir as keyof typeof FATIGUE_EFFORT_COEFFICIENTS_V1];

    let effortConflict = false;
    if (typeof set.rpe === 'number' && Number.isFinite(set.rpe)) {
      const derivedRirFromRpe = Math.max(0, Math.round(10 - set.rpe));
      if (Math.abs(boundedRir - derivedRirFromRpe) >= 2) {
        effortConflict = true;
      }
    }

    return Object.freeze({
      effortCoeff,
      isUnknown: false,
      effortConflict,
      effectiveRir: boundedRir
    });
  }

  if (typeof set.rpe === 'number' && Number.isFinite(set.rpe)) {
    const rawRpe = set.rpe;
    const derivedRir = Math.max(0, Math.round(10 - rawRpe));
    const effortCoeff =
      derivedRir >= 6
        ? FATIGUE_EFFORT_COEFFICIENTS_V1[6]
        : FATIGUE_EFFORT_COEFFICIENTS_V1[derivedRir as keyof typeof FATIGUE_EFFORT_COEFFICIENTS_V1];

    return Object.freeze({
      effortCoeff,
      isUnknown: false,
      effortConflict: false,
      effectiveRir: derivedRir
    });
  }

  return Object.freeze({
    effortCoeff: 0,
    isUnknown: true,
    effortConflict: false
  });
}

export interface PersonalWeeklyBaselineResult {
  readonly baseline: number | null;
  readonly modifier: number;
  readonly validWeeksCount: number;
  readonly isUsable: boolean;
}

/**
 * Calculates personal weekly baseline and clearance rate modifier.
 *
 * Lookback: 6 previous weeks.
 * Minimum usable history: 4 valid weeks (or custom minValidWeeks).
 * Baseline = median(valid previous weekly FEU totals).
 * If < minValidWeeks: modifier = 1.00, baseline = null, isUsable = false.
 *
 * ZERO BASELINE INVARIANT:
 * If median <= 0, baseline is unusable (isUsable = false, baseline = null, modifier = 1.00).
 * Never activates high-excess (0.80) penalty against a 0 baseline.
 *
 * Modifiers:
 * - Rolling7DayFEU <= 1.00 * baseline -> 1.00
 * - Rolling7DayFEU > 1.00 * baseline && <= 1.25 * baseline -> 0.90
 * - Rolling7DayFEU > 1.25 * baseline -> 0.80
 */
export function calculatePersonalWeeklyBaseline(
  historicalWeeklyTotals: readonly number[],
  rolling7DayFeu: number,
  minValidWeeks: number = 4
): PersonalWeeklyBaselineResult {
  const windowWeeks = historicalWeeklyTotals.slice(0, 6);
  if (windowWeeks.length < minValidWeeks) {
    return Object.freeze({
      baseline: null,
      modifier: 1.00,
      validWeeksCount: windowWeeks.length,
      isUsable: false
    });
  }

  const sorted = [...windowWeeks].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

  // Zero / Non-positive median baseline safety
  if (median <= 0) {
    return Object.freeze({
      baseline: null,
      modifier: 1.00,
      validWeeksCount: windowWeeks.length,
      isUsable: false
    });
  }

  let modifier = 1.00;
  if (rolling7DayFeu > 1.25 * median) {
    modifier = 0.80;
  } else if (rolling7DayFeu > 1.00 * median) {
    modifier = 0.90;
  } else {
    modifier = 1.00;
  }

  return Object.freeze({
    baseline: median,
    modifier,
    validWeeksCount: windowWeeks.length,
    isUsable: true
  });
}

/**
 * Result contract for FatiguePolicyV1.
 */
export interface MuscleFatigueResultV2 {
  readonly target: ResolvedExerciseContributionTarget;
  readonly residualFeu: number;
  readonly rolling7DayFeu: number;
  readonly state: FatigueState;
  readonly confidence: FatigueConfidence;
  readonly unknownEffortExposureCount: number;
  readonly totalEligibleSets: number;
  readonly lastExposureAt: string | null;
  readonly dominantRole?: MuscleRole;
  readonly reasons: readonly FatigueReason[];
  readonly baselineWeeklyFeu: number | null;
  readonly weeklyClearanceModifier: number;
  readonly semanticConfidence?: EvidenceConfidence;
  readonly source?: 'semantic_v2' | 'legacy' | 'mixed';
}

export interface TargetFatigueOptions {
  readonly referenceTimeMs?: number;
  readonly historicalWeeklyTotalsByTarget?: Readonly<Record<string, readonly number[]>>;
  readonly historicalLookbackWeeks?: number;
  readonly minValidWeeksForBaseline?: number;
}

/**
 * Calculates Fatigue v2 for each muscle target across history.
 *
 * Invariants:
 * - Single canonical state engine using multi-session independent residuals.
 * - Each session decays linearly from its own timestamp.
 * - Base clearance rate = 0.125 FEU/h.
 * - Rolling 7-day load = raw FEU in last 168 hours.
 * - Unknown effort sets generate 0 measured FEU, increase unknown count, and penalize confidence.
 * - Current fatigue confidence evaluates effort coverage strictly inside the active 168-hour window.
 * - Complete-window historical validation: candidate weeks only participate if coverage starts <= weekStart.
 */
export function calculateTargetFatigueV2(
  sessions: readonly WorkoutSession[],
  exercises: ExerciseLookup,
  options?: TargetFatigueOptions
): MuscleFatigueResultV2[] {
  const referenceTimeMs = options?.referenceTimeMs ?? Date.now();
  const exposures = extractMuscleExposures(sessions, exercises);

  interface TargetSessionLoad {
    readonly sessionId: string;
    readonly performedAt: string;
    readonly sessionMs: number;
    feu: number;
    eligibleSetsCount: number;
    unknownCount: number;
    conflictCount: number;
    roles: Set<MuscleRole>;
  }

  interface TargetAccumulator {
    target: ResolvedExerciseContributionTarget;
    sessionsMap: Map<string, TargetSessionLoad>;
    sources: Set<MuscleExposureSource>;
    semanticConfidences: (EvidenceConfidence | undefined)[];
    lastExposureAt: string | null;
  }

  const targetsMap = new Map<string, TargetAccumulator>();

  for (const exp of exposures) {
    const key = getContributionTargetKey(exp.target);
    let acc = targetsMap.get(key);
    if (!acc) {
      acc = {
        target: exp.target,
        sessionsMap: new Map<string, TargetSessionLoad>(),
        sources: new Set<MuscleExposureSource>(),
        semanticConfidences: [],
        lastExposureAt: null
      };
      targetsMap.set(key, acc);
    }

    acc.sources.add(exp.source);
    acc.semanticConfidences.push(exp.semanticConfidence);

    if (!acc.lastExposureAt || Date.parse(exp.performedAt) > Date.parse(acc.lastExposureAt)) {
      acc.lastExposureAt = exp.performedAt;
    }

    let sessionLoad = acc.sessionsMap.get(exp.sessionId);
    if (!sessionLoad) {
      sessionLoad = {
        sessionId: exp.sessionId,
        performedAt: exp.performedAt,
        sessionMs: Date.parse(exp.performedAt),
        feu: 0,
        eligibleSetsCount: 0,
        unknownCount: 0,
        conflictCount: 0,
        roles: new Set<MuscleRole>()
      };
      acc.sessionsMap.set(exp.sessionId, sessionLoad);
    }

    sessionLoad.eligibleSetsCount += 1;
    sessionLoad.roles.add(exp.role);

    const effortRes = resolveSetEffortV1({ rir: exp.rir, rpe: exp.rpe });
    const roleCoeff = FATIGUE_ROLE_COEFFICIENTS_V1[exp.role];
    const setFeu = effortRes.effortCoeff * roleCoeff;
    sessionLoad.feu += setFeu;

    if (effortRes.isUnknown) {
      sessionLoad.unknownCount += 1;
    }
    if (effortRes.effortConflict) {
      sessionLoad.conflictCount += 1;
    }
  }

  // Determine user earliest recorded session for historical baseline coverage validation
  let earliestSessionMs = Infinity;
  for (const s of sessions) {
    const t = Date.parse(s.endedAt ?? s.startedAt);
    if (!Number.isNaN(t) && t < earliestSessionMs) {
      earliestSessionMs = t;
    }
  }

  const results: MuscleFatigueResultV2[] = [];

  for (const [key, acc] of targetsMap.entries()) {
    let totalEligibleSets = 0;
    let recentEligibleSets = 0;
    let recentUnknownEffortSets = 0;
    let recentConflictSets = 0;
    let rolling7DayFeu = 0;
    const allRoles: MuscleRole[] = [];

    const rolling7DayCutoffMs = referenceTimeMs - 7 * 24 * 3600000;

    for (const sLoad of acc.sessionsMap.values()) {
      totalEligibleSets += sLoad.eligibleSetsCount;
      for (const r of sLoad.roles) {
        allRoles.push(r);
      }

      // Track recent sets, unknown sets, conflicts, and FEU strictly within the 168-hour evidence horizon
      if (sLoad.sessionMs >= rolling7DayCutoffMs && sLoad.sessionMs <= referenceTimeMs) {
        rolling7DayFeu += sLoad.feu;
        recentEligibleSets += sLoad.eligibleSetsCount;
        recentUnknownEffortSets += sLoad.unknownCount;
        recentConflictSets += sLoad.conflictCount;
      }
    }

    // Historical weekly totals: target-specific override or derived with COMPLETE-WINDOW validation
    let weeklyTotals: number[] = [];
    if (options?.historicalWeeklyTotalsByTarget && options.historicalWeeklyTotalsByTarget[key]) {
      weeklyTotals = [...options.historicalWeeklyTotalsByTarget[key]];
    } else if (earliestSessionMs !== Infinity) {
      const lookbackWeeks = options?.historicalLookbackWeeks ?? 6;
      for (let k = 1; k <= lookbackWeeks; k++) {
        const weekEnd = referenceTimeMs - k * 7 * 24 * 3600000;
        const weekStart = referenceTimeMs - (k + 1) * 7 * 24 * 3600000;

        // INVARIANT: Candidate week is valid iff historical coverage covers the COMPLETE 168-hour interval.
        if (earliestSessionMs <= weekStart) {
          let weekFeu = 0;
          for (const sLoad of acc.sessionsMap.values()) {
            if (sLoad.sessionMs >= weekStart && sLoad.sessionMs < weekEnd) {
              weekFeu += sLoad.feu;
            }
          }
          weeklyTotals.push(weekFeu);
        }
      }
    }

    const minValidWeeks = options?.minValidWeeksForBaseline ?? 4;
    const baselineResult = calculatePersonalWeeklyBaseline(weeklyTotals, rolling7DayFeu, minValidWeeks);
    const effectiveClearanceRate = BASE_CLEARANCE_RATE_V1 * baselineResult.modifier;

    // Multi-session independent residuals (authoritative canonical calculation)
    let totalResidualFeu = 0;
    for (const sLoad of acc.sessionsMap.values()) {
      if (sLoad.sessionMs > referenceTimeMs) continue;
      const elapsedHours = Math.max(0, (referenceTimeMs - sLoad.sessionMs) / 3600000);
      const sessionResidual = Math.max(0, sLoad.feu - effectiveClearanceRate * elapsedHours);
      totalResidualFeu += sessionResidual;
    }

    // State resolution from Residual FEU using canonical pure function
    const state = resolveFatigueStateFromResidualFeu(totalResidualFeu);

    // Dominant role resolution
    allRoles.sort((a, b) => MUSCLE_ROLE_RANK[b] - MUSCLE_ROLE_RANK[a]);
    const dominantRole = allRoles[0];

    // Conservative Semantic Confidence & Reasons Resolution
    const reasons: FatigueReason[] = [];
    const semanticSummary = aggregateSemanticEvidence(acc.sources, acc.semanticConfidences);
    if (semanticSummary.reason) {
      reasons.push(semanticSummary.reason);
    }

    let confidence: FatigueConfidence = semanticSummary.confidenceCap;

    if (recentConflictSets > 0) {
      confidence = 'low';
      reasons.push(
        Object.freeze({
          code: 'effort_conflict',
          message: 'Conflicto detectado entre valores registrados de RIR y RPE'
        })
      );
    }

    // Evaluate effort coverage strictly on recent eligible sets (within 168h window)
    const effortEval = evaluateEffortCoverageConfidence(recentUnknownEffortSets, recentEligibleSets);
    if (effortEval.reason) {
      reasons.push(effortEval.reason);
    }
    if (effortEval.confidenceCap === 'low') {
      confidence = 'low';
    } else if (effortEval.confidenceCap === 'moderate' && confidence === 'high') {
      confidence = 'moderate';
    }

    if (baselineResult.modifier < 1.00) {
      reasons.push(
        Object.freeze({
          code: 'elevated_weekly_load',
          message: 'Carga semanal superior a la línea base personal habitual'
        })
      );
    }

    if (state === 'fatigued') {
      reasons.push(
        Object.freeze({
          code: 'high_residual_load',
          message: 'Nivel elevado de carga residual fatigante'
        })
      );
    }

    // UNKNOWN-DATA SAFETY RULE:
    // If residual FEU < threshold (fresh/ready) but recent unknown effort sets exist,
    // state CANNOT be high confidence fresh!
    if (state === 'fresh' && recentUnknownEffortSets > 0 && confidence === 'high') {
      confidence = 'moderate';
    }

    results.push(
      Object.freeze({
        target: acc.target,
        residualFeu: totalResidualFeu,
        rolling7DayFeu,
        state,
        confidence,
        unknownEffortExposureCount: recentUnknownEffortSets,
        totalEligibleSets: recentEligibleSets > 0 ? recentEligibleSets : totalEligibleSets,
        lastExposureAt: acc.lastExposureAt,
        dominantRole,
        reasons: Object.freeze(reasons),
        baselineWeeklyFeu: baselineResult.baseline,
        weeklyClearanceModifier: baselineResult.modifier,
        semanticConfidence: semanticSummary.semanticConfidence,
        source: semanticSummary.source
      })
    );
  }

  return results;
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
    semanticConfidences: (EvidenceConfidence | undefined)[];
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
        semanticConfidences: [],
        exposures: []
      };
      map.set(key, acc);
    }

    acc.roles.add(exp.role);
    acc.sessionIds.add(exp.sessionId);
    acc.sources.add(exp.source);
    acc.semanticConfidences.push(exp.semanticConfidence);
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
    const semanticSummary = aggregateSemanticEvidence(acc.sources, acc.semanticConfidences);

    result.push(
      Object.freeze({
        target: acc.target,
        roles: Object.freeze([...acc.roles]),
        source: semanticSummary.source,
        lastExposureAt: acc.lastExposureAt,
        totalEligibleSets: acc.physicalSetIds.size,
        failureSets: acc.failureSetIds.size,
        hardSets: acc.hardSetIds.size,
        submaximalSets: acc.submaximalSetIds.size,
        unknownEffortSets: acc.unknownEffortSetIds.size,
        sessionCount: acc.sessionIds.size,
        semanticConfidence: semanticSummary.semanticConfidence,
        exposures: Object.freeze([...acc.exposures])
      })
    );
  }

  return result;
}

/**
 * Internal pure helper: resolves confidence from exposures that are already
 * known to be filtered to the relevant evaluation window.
 */
function resolveFatigueConfidenceFromExposures(
  recentExposures: readonly MuscleExposureEvent[]
): FatigueConfidence {
  const semanticSummary = aggregateSemanticEvidence(
    new Set(recentExposures.map((e) => e.source)),
    recentExposures.map((e) => e.semanticConfidence)
  );
  let conf: FatigueConfidence = semanticSummary.confidenceCap;

  const recentPhysicalSetIds = new Set<string>();
  const recentUnknownSetIds = new Set<string>();

  for (const exp of recentExposures) {
    const setId = `${exp.sessionId}:${exp.exerciseId}:${exp.setIndex}`;
    recentPhysicalSetIds.add(setId);
    if (exp.effort === 'unknown') {
      recentUnknownSetIds.add(setId);
    }
  }

  const effortEval = evaluateEffortCoverageConfidence(
    recentUnknownSetIds.size,
    recentPhysicalSetIds.size
  );

  if (effortEval.confidenceCap === 'low') {
    conf = 'low';
  } else if (effortEval.confidenceCap === 'moderate' && conf === 'high') {
    conf = 'moderate';
  }
  return conf;
}

/**
 * Resolves fatigue confidence for an evidence record strictly filtering exposures
 * to the canonical rolling 168-hour window [referenceTime - 168h, referenceTime].
 *
 * CANONICAL HORIZON INVARIANT:
 * `referenceTime` is mandatory. Old unknown-effort sets outside the 168-hour window
 * can never contaminate current confidence.
 */
export function resolveFatigueConfidence(
  evidence: MuscleFatigueEvidence,
  referenceTime: Date
): FatigueConfidence {
  const refTimeMs = referenceTime.getTime();
  const cutoffMs = refTimeMs - FATIGUE_POLICY_V1.rollingWindowHours * 3600000;

  const recentExposures = evidence.exposures.filter((e) => {
    const ms = Date.parse(e.performedAt);
    return !Number.isNaN(ms) && ms >= cutoffMs && ms <= refTimeMs;
  });

  return resolveFatigueConfidenceFromExposures(recentExposures);
}

/**
 * Replaceable policy boundary for Fatigue v2.
 *
 * CANONICAL ARCHITECTURE INVARIANT:
 * - Fatigue state resolution is intrinsically history-aware and requires personal
 *   historical session context (multi-session independent residuals and personal
 *   weekly baseline clearance modifier).
 * - Therefore, state is computed via `calculateTargetFatigueV2(sessions, catalog, ...)`
 *   and mapped to categorical states via pure `resolveFatigueStateFromResidualFeu(residualFeu)`.
 * - Policy contracts define stimulus classification and explicit, context-safe confidence.
 */
export interface FatiguePolicy {
  readonly version: string;
  readonly name: string;
  classifyStimulus(evidence: MuscleFatigueEvidence): FatigueStimulusClassification;
  resolveConfidence(
    evidence: MuscleFatigueEvidence,
    referenceTime: Date
  ): FatigueConfidence;
}

/**
 * Approved FatiguePolicyV1 singleton and centralized policy object.
 */
export const FATIGUE_POLICY_V1 = Object.freeze({
  name: 'FatiguePolicyV1' as const,
  version: '1.0.0' as const,
  baseClearanceRatePerHr: BASE_CLEARANCE_RATE_V1,
  baseClearanceRate: BASE_CLEARANCE_RATE_V1,
  rollingWindowHours: 168,
  lookbackWeeks: 6,
  minValidWeeksForBaseline: 4,
  effortCoefficients: FATIGUE_EFFORT_COEFFICIENTS_V1,
  rpeToRirMap: Object.freeze({
    10: 0,
    9: 1,
    8: 2,
    7: 3,
    6: 4,
    5: 5,
    4: 6,
  } as const),
  roleContributions: FATIGUE_ROLE_COEFFICIENTS_V1,
  roleCoefficients: FATIGUE_ROLE_COEFFICIENTS_V1,
  clearanceModifiers: Object.freeze({
    withinBaseline: 1.00,
    moderateExcess: 0.90,
    highExcess: 0.80,
  } as const),
  stateThresholds: FATIGUE_STATE_THRESHOLDS_V1,

  classifyStimulus(evidence: MuscleFatigueEvidence): FatigueStimulusClassification {
    const sortedRoles = [...evidence.roles].sort(
      (a, b) => MUSCLE_ROLE_RANK[b] - MUSCLE_ROLE_RANK[a]
    );
    return Object.freeze({
      target: evidence.target,
      totalSets: evidence.totalEligibleSets,
      effectiveHardSets: evidence.failureSets + evidence.hardSets,
      dominantRole: sortedRoles[0] ?? 'minimal'
    });
  },

  resolveConfidence(evidence: MuscleFatigueEvidence, referenceTime: Date): FatigueConfidence {
    return resolveFatigueConfidence(evidence, referenceTime);
  },

  resolveFatigueStateFromResidualFeu,
  resolveSetEffort: resolveSetEffortV1,
  calculatePersonalWeeklyBaseline,
  calculateTargetFatigue: calculateTargetFatigueV2
});

export const DefaultFatiguePolicy: FatiguePolicy = FATIGUE_POLICY_V1;
