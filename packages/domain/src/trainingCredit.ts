import {
  type MuscleEntityId,
  type FunctionalMuscleGroup,
  MUSCLE_ENTITY_METADATA,
  isFunctionalMuscleGroup
} from './muscleTaxonomy.js';
import {
  type MovementFamily,
  type MuscleContributionTarget,
  VALID_MOVEMENT_FAMILIES,
  getMuscleContributionTargetKey,
  EXERCISE_SEMANTICS_REGISTRY
} from './exerciseSemantics.js';

/**
 * Canonical classification of a muscle's training credit within an exercise variation.
 *
 * Invariant: MuscleRole != TrainingCreditClassification.
 * Training Credit is strictly decoupled from biomechanical muscle roles.
 * No automatic conversion or multiplier belongs in this domain layer.
 */
export const TRAINING_CREDIT_CLASSIFICATIONS = [
  'direct',
  'indirect',
  'exposure_only',
  'none',
  'unresolved'
] as const;

export type TrainingCreditClassification = (typeof TRAINING_CREDIT_CLASSIFICATIONS)[number];

const VALID_TRAINING_CREDIT_CLASSIFICATIONS = new Set<string>(TRAINING_CREDIT_CLASSIFICATIONS);

export const RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS = [
  'direct',
  'indirect',
  'exposure_only',
  'none'
] as const;

export type ResolvedTrainingCreditClassification = (typeof RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS)[number];

const _VALID_RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS = new Set<string>(RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS);

/**
 * Degree of confidence in a resolved training credit classification.
 * Confidence applies ONLY to resolved classifications; unresolved entries must not have confidence.
 */
export const CREDIT_CONFIDENCES = [
  'high',
  'moderate',
  'low'
] as const;

export type CreditConfidence = (typeof CREDIT_CONFIDENCES)[number];

const VALID_CREDIT_CONFIDENCES = new Set<string>(CREDIT_CONFIDENCES);

/**
 * Provenance category of evidence justifying the training credit classification.
 */
export const TRAINING_CREDIT_EVIDENCE_BASES = [
  'pelland',
  'longitudinal',
  'muscle_force',
  'biomechanics',
  'emg',
  'inherited',
  'product_inference'
] as const;

export type TrainingCreditEvidenceBasis = (typeof TRAINING_CREDIT_EVIDENCE_BASES)[number];

const VALID_TRAINING_CREDIT_EVIDENCE_BASES = new Set<string>(TRAINING_CREDIT_EVIDENCE_BASES);

/**
 * Consolidation status of a training credit decision.
 */
export const TRAINING_CREDIT_STATUSES = [
  'established',
  'provisional',
  'unresolved'
] as const;

export type TrainingCreditStatus = (typeof TRAINING_CREDIT_STATUSES)[number];

const VALID_TRAINING_CREDIT_STATUSES = new Set<string>(TRAINING_CREDIT_STATUSES);

/**
 * Resolved entry representing an audited muscle credit decision.
 */
export interface ResolvedTrainingCreditEntry {
  readonly target: MuscleContributionTarget;
  readonly classification: ResolvedTrainingCreditClassification;
  readonly confidence: CreditConfidence;
  readonly status: 'established' | 'provisional';
  readonly evidenceBasis: readonly TrainingCreditEvidenceBasis[];
  readonly evidenceRefs?: readonly string[];
}

/**
 * Unresolved entry representing a plausible but insufficiently evidenced contributor.
 * Must carry an explicit non-empty justification reason and must not carry confidence.
 */
export interface UnresolvedTrainingCreditEntry {
  readonly target: MuscleContributionTarget;
  readonly classification: 'unresolved';
  readonly status: 'unresolved';
  readonly confidence?: never;
  readonly evidenceBasis: readonly TrainingCreditEvidenceBasis[];
  readonly evidenceRefs?: readonly string[];
  readonly reason: string;
}

export type TrainingCreditEntry =
  | ResolvedTrainingCreditEntry
  | UnresolvedTrainingCreditEntry;

/**
 * Versioned profile holding training credit classifications for an exercise variation.
 * Uses the canonical MovementFamily and variation identity from Exercise Semantics.
 */
export interface TrainingCreditProfileV1 {
  readonly version: 1;
  readonly family: MovementFamily;
  readonly variation: string;
  readonly credits: readonly TrainingCreditEntry[];
}

export interface TrainingCreditValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Pure runtime validation function for TrainingCreditProfileV1.
 * Enforces all 22 domain integrity invariants:
 * 1. profile is an object
 * 2. version === 1
 * 3. family is a valid MovementFamily
 * 4. variation is a non-empty string
 * 5. matching Exercise Semantics profile exists
 * 6. credits is a non-empty array
 * 7. every target is valid
 * 8. duplicate target keys are rejected
 * 9. every target exists in corresponding Exercise Semantics contributions
 * 10. classification is valid
 * 11. status is valid
 * 12. confidence is valid for resolved entries
 * 13. resolved entry requires confidence
 * 14. unresolved entry must NOT have confidence
 * 15. unresolved entry requires status === 'unresolved'
 * 16. unresolved entry requires non-empty reason
 * 17. resolved entry cannot use status === 'unresolved'
 * 18. evidenceBasis is non-empty
 * 19. every evidenceBasis value is valid
 * 20. evidenceRefs, when present, is an array of non-empty strings
 * 21. inherited entries must be provisional
 * 22. inherited-only evidence cannot have confidence === 'high'
 */
export function validateTrainingCreditProfile(profile: unknown): TrainingCreditValidationResult {
  const errors: string[] = [];

  if (typeof profile !== 'object' || profile === null) {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  const p = profile as Record<string, unknown>;

  if (p.version !== 1) {
    errors.push(`Invalid version: expected 1, got ${String(p.version)}`);
  }

  if (typeof p.family !== 'string' || !VALID_MOVEMENT_FAMILIES.has(p.family as MovementFamily)) {
    errors.push(`Invalid family: ${String(p.family)}`);
  }

  if (typeof p.variation !== 'string' || p.variation.trim().length === 0) {
    errors.push('variation must be a non-empty string');
  }

  let matchingSemanticsTargets: Set<string> | null = null;
  if (typeof p.family === 'string' && typeof p.variation === 'string' && p.variation.trim().length > 0) {
    const matchingProfile = Object.values(EXERCISE_SEMANTICS_REGISTRY).find(
      (s) => s.movementFamily === p.family && s.variation === p.variation
    );
    if (!matchingProfile) {
      errors.push(
        `No matching ExerciseSemanticsV2 profile found for family "${p.family}" and variation "${p.variation}"`
      );
    } else {
      matchingSemanticsTargets = new Set(
        matchingProfile.contributions.map((c) => getMuscleContributionTargetKey(c.target))
      );
    }
  }

  if (!Array.isArray(p.credits) || p.credits.length === 0) {
    errors.push('credits must be a non-empty array');
    return { valid: errors.length === 0, errors };
  }

  const seenTargetKeys = new Set<string>();

  for (let i = 0; i < p.credits.length; i++) {
    const item = p.credits[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`credits[${i}] must be an object`);
      continue;
    }

    const c = item as Record<string, unknown>;

    // 1. Target validation
    let targetKey: string | null = null;
    if (typeof c.target !== 'object' || c.target === null) {
      errors.push(`credits[${i}].target must be a valid MuscleContributionTarget object`);
    } else {
      const t = c.target as Record<string, unknown>;
      let targetValid = false;

      if (t.kind === 'anatomical') {
        if (typeof t.entity !== 'string' || !(t.entity in MUSCLE_ENTITY_METADATA)) {
          errors.push(`credits[${i}].target.entity is not a recognized MuscleEntityId: ${String(t.entity)}`);
        } else {
          targetValid = true;
        }
      } else if (t.kind === 'functional') {
        if (!isFunctionalMuscleGroup(t.group)) {
          errors.push(`credits[${i}].target.group is not a recognized FunctionalMuscleGroup: ${String(t.group)}`);
        } else {
          targetValid = true;
        }
      } else {
        errors.push(`credits[${i}].target.kind is invalid: ${String(t.kind)} (regions and unknown kinds are not permitted)`);
      }

      if (targetValid) {
        targetKey = getMuscleContributionTargetKey(c.target as MuscleContributionTarget);
        if (seenTargetKeys.has(targetKey)) {
          errors.push(`Duplicate target credit entry: ${targetKey}`);
        }
        seenTargetKeys.add(targetKey);

        if (matchingSemanticsTargets && !matchingSemanticsTargets.has(targetKey)) {
          errors.push(
            `credits[${i}] target "${targetKey}" does not exist in corresponding ExerciseSemanticsV2 profile contributions`
          );
        }
      }
    }

    // 2. Classification validation
    const isClassificationValid =
      typeof c.classification === 'string' &&
      VALID_TRAINING_CREDIT_CLASSIFICATIONS.has(c.classification as TrainingCreditClassification);

    if (!isClassificationValid) {
      errors.push(`credits[${i}].classification is invalid: ${String(c.classification)}`);
    }

    // 3. Status validation
    const isStatusValid =
      typeof c.status === 'string' &&
      VALID_TRAINING_CREDIT_STATUSES.has(c.status as TrainingCreditStatus);

    if (!isStatusValid) {
      errors.push(`credits[${i}].status is invalid: ${String(c.status)}`);
    }

    // 4. Resolved vs Unresolved rules
    if (c.classification === 'unresolved') {
      if (c.status !== 'unresolved') {
        errors.push(`credits[${i}] unresolved classification must have status === "unresolved"`);
      }
      if (c.confidence !== undefined) {
        errors.push(`credits[${i}] unresolved classification must NOT have confidence`);
      }
      if (typeof c.reason !== 'string' || c.reason.trim().length === 0) {
        errors.push(`credits[${i}] unresolved classification requires a non-empty reason string`);
      }
    } else if (isClassificationValid) {
      if (c.status === 'unresolved') {
        errors.push(`credits[${i}] resolved classification cannot have status === "unresolved"`);
      }
      if (typeof c.confidence !== 'string' || !VALID_CREDIT_CONFIDENCES.has(c.confidence as CreditConfidence)) {
        errors.push(`credits[${i}] resolved classification requires valid confidence ("high" | "moderate" | "low")`);
      }
    }

    // 5. Evidence Basis validation
    if (!Array.isArray(c.evidenceBasis) || c.evidenceBasis.length === 0) {
      errors.push(`credits[${i}].evidenceBasis must be a non-empty array`);
    } else {
      let allEvidenceValid = true;
      for (let j = 0; j < c.evidenceBasis.length; j++) {
        const ev = c.evidenceBasis[j];
        if (typeof ev !== 'string' || !VALID_TRAINING_CREDIT_EVIDENCE_BASES.has(ev as TrainingCreditEvidenceBasis)) {
          errors.push(`credits[${i}].evidenceBasis[${j}] contains invalid evidence: ${String(ev)}`);
          allEvidenceValid = false;
        }
      }

      if (allEvidenceValid) {
        const hasInherited = c.evidenceBasis.includes('inherited');
        if (hasInherited) {
          if (c.status !== 'provisional') {
            errors.push(`credits[${i}] entries with inherited evidence must have status === "provisional"`);
          }
          const isInheritedOnly = c.evidenceBasis.every((ev: string) => ev === 'inherited');
          if (isInheritedOnly && c.confidence === 'high') {
            errors.push(`credits[${i}] inherited-only evidence cannot have confidence === "high"`);
          }
        }
      }
    }

    // 6. Evidence Refs validation
    if (c.evidenceRefs !== undefined) {
      if (
        !Array.isArray(c.evidenceRefs) ||
        c.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.trim().length === 0)
      ) {
        errors.push(`credits[${i}].evidenceRefs must be an array of non-empty strings when provided`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * ============================================================================
 * TRAINING CREDIT V1 REGISTRY
 * ============================================================================
 * Canonical, explicit, immutable registry of training credit profiles.
 * Intentionally partial seed registry covering 13 audited compound movements.
 *
 * ABSENCE SEMANTICS:
 * - Profile absent: movement variation has not yet been audited for training credit.
 * - Target absent from existing profile: target is not modeled for training credit in this profile.
 * - Explicit classification = 'none': audited and deliberately classified as conferring no credit.
 */
export const TRAINING_CREDIT_V1_REGISTRY: Readonly<Record<string, TrainingCreditProfileV1>> = Object.freeze({
  back_squat: {
    version: 1,
    family: 'squat',
    variation: 'back_squat',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'quadriceps' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'gluteus_maximus' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'adductor_magnus' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['longitudinal', 'muscle_force', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'hamstrings' },
        classification: 'exposure_only',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'erector_spinae' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'gluteus_medius' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'gluteus_minimus' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  generic_leg_press: {
    version: 1,
    family: 'leg_press',
    variation: 'generic_leg_press',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'quadriceps' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'gluteus_maximus' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'adductor_magnus' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'hamstrings' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['longitudinal', 'biomechanics']
      }
    ]
  },

  conventional_deadlift: {
    version: 1,
    family: 'deadlift',
    variation: 'conventional',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'gluteus_maximus' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['muscle_force', 'biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'hamstrings' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'quadriceps' },
        classification: 'indirect',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'adductor_magnus' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['muscle_force', 'biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'erector_spinae' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      }
    ]
  },

  romanian_deadlift: {
    version: 1,
    family: 'romanian_deadlift',
    variation: 'standard',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'hamstrings' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics', 'longitudinal']
      },
      {
        target: { kind: 'anatomical', entity: 'gluteus_maximus' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'adductor_magnus' },
        classification: 'indirect',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'product_inference']
      },
      {
        target: { kind: 'anatomical', entity: 'erector_spinae' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      }
    ]
  },

  hip_thrust: {
    version: 1,
    family: 'hip_thrust',
    variation: 'barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'gluteus_maximus' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'hamstrings' },
        classification: 'exposure_only',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'quadriceps' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['longitudinal', 'biomechanics']
      }
    ]
  },

  flat_bench_press: {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  incline_bench_press: {
    version: 1,
    family: 'incline_press',
    variation: 'low_incline',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  decline_bench_press: {
    version: 1,
    family: 'decline_press',
    variation: 'standard',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'longitudinal']
      },
      {
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  standing_barbell_overhead_press: {
    version: 1,
    family: 'vertical_press',
    variation: 'barbell_standing',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'lateral_deltoid' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'indirect',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'trapezius' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'serratus_anterior' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  barbell_row: {
    version: 1,
    family: 'row',
    variation: 'barbell_low_elbow',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'latissimus_dorsi' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'biceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'trapezius' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'teres_major' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'posterior_deltoid' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'brachialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'brachioradialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'erector_spinae' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      }
    ]
  },

  pull_up: {
    version: 1,
    family: 'pull_up',
    variation: 'pronated_standard',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'latissimus_dorsi' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'teres_major' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'biceps_brachii' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'brachialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'brachioradialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'trapezius' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'rhomboids' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'rectus_abdominis' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'obliques' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  chin_up: {
    version: 1,
    family: 'chin_up',
    variation: 'supinated_standard',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'latissimus_dorsi' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'biceps_brachii' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'teres_major' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'brachialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'brachioradialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'trapezius' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'rhomboids' },
        classification: 'exposure_only',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'rectus_abdominis' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'obliques' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  },

  lat_pulldown: {
    version: 1,
    family: 'pulldown',
    variation: 'pronated_standard',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'latissimus_dorsi' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'biceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'longitudinal', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'trapezius' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['pelland', 'biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'teres_major' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics', 'emg']
      },
      {
        target: { kind: 'anatomical', entity: 'brachialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'brachioradialis' },
        classification: 'indirect',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  }
});

/**
 * Pure lookup helper to find a TrainingCreditProfileV1 by movementFamily and variation.
 */
export function getTrainingCreditProfile(
  family: MovementFamily,
  variation: string
): TrainingCreditProfileV1 | undefined {
  return Object.values(TRAINING_CREDIT_V1_REGISTRY).find(
    (p) => p.family === family && p.variation === variation
  );
}

/**
 * Pure lookup helper to find a specific muscle's credit entry within a profile.
 * Reuses canonical target key representation to guarantee exact matching.
 */
export function getTrainingCreditEntry(
  profile: TrainingCreditProfileV1,
  target: MuscleContributionTarget
): TrainingCreditEntry | undefined {
  const targetKey = getMuscleContributionTargetKey(target);
  return profile.credits.find(
    (entry) => getMuscleContributionTargetKey(entry.target) === targetKey
  );
}
