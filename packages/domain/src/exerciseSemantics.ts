import {
  type MuscleEntityId,
  type FunctionalMuscleGroup,
  MUSCLE_ENTITY_METADATA,
  isFunctionalMuscleGroup
} from './muscleTaxonomy.js';

/**
 * High-level movement family classifying motor pattern mechanics.
 */
export type MovementFamily =
  // Lower body
  | 'squat'
  | 'leg_press'
  | 'hack_squat'
  | 'pendulum_squat'
  | 'split_squat'
  | 'lunge'
  | 'step_up'
  | 'deadlift'
  | 'romanian_deadlift'
  | 'hip_thrust'
  | 'knee_extension'
  | 'knee_flexion'
  | 'calf_raise'
  // Upper push
  | 'bench_press'
  | 'incline_press'
  | 'decline_press'
  | 'vertical_press'
  | 'fly'
  // Upper pull
  | 'row'
  | 'pulldown'
  | 'pull_up'
  | 'chin_up'
  // Arms
  | 'elbow_flexion'
  | 'elbow_extension'
  // Shoulders
  | 'lateral_raise'
  | 'rear_delt'
  | 'front_raise'
  // Other
  | 'core'
  | 'carry'
  | 'other';

export const VALID_MOVEMENT_FAMILIES = new Set<MovementFamily>([
  'squat',
  'leg_press',
  'hack_squat',
  'pendulum_squat',
  'split_squat',
  'lunge',
  'step_up',
  'deadlift',
  'romanian_deadlift',
  'hip_thrust',
  'knee_extension',
  'knee_flexion',
  'calf_raise',
  'bench_press',
  'incline_press',
  'decline_press',
  'vertical_press',
  'fly',
  'row',
  'pulldown',
  'pull_up',
  'chin_up',
  'elbow_flexion',
  'elbow_extension',
  'lateral_raise',
  'rear_delt',
  'front_raise',
  'core',
  'carry',
  'other'
]);

/**
 * Biomechanical role played by a canonical muscle node in an exercise movement.
 *
 * DEFINITIONS:
 * - prime: uno de los principales productores dinámicos de momento/trabajo
 *   necesario para completar la repetición.
 * - co_prime: otro productor dinámico principal con contribución mecánica material.
 * - secondary: contribución dinámica real pero menor, dependiente de fase,
 *   posición o magnitud.
 * - resisted_isometric: genera tensión/momento importante principalmente para resistir
 *   un momento externo o mantener configuración segmentaria.
 * - stabilizer: controla principalmente posición articular, pelvis, escápula,
 *   tronco o planos secundarios.
 * - minimal: participación insuficiente para considerarse una contribución
 *   relevante del perfil biomecánico base.
 *
 * INVARIANTE:
 * - MuscleRole NO representa hipertrofia.
 * - MuscleRole NO representa set credit / fractional sets.
 * - MuscleRole NO representa EMG percentage.
 */
export type MuscleRole =
  | 'prime'
  | 'co_prime'
  | 'secondary'
  | 'resisted_isometric'
  | 'stabilizer'
  | 'minimal';

export const VALID_MUSCLE_ROLES = new Set<MuscleRole>([
  'prime',
  'co_prime',
  'secondary',
  'resisted_isometric',
  'stabilizer',
  'minimal'
]);

/**
 * Calidad y fortaleza de la evidencia biomecánica subyacente.
 */
export type EvidenceConfidence =
  | 'high'
  | 'moderate'
  | 'low';

export const VALID_EVIDENCE_CONFIDENCES = new Set<EvidenceConfidence>([
  'high',
  'moderate',
  'low'
]);

/**
 * Qué tan lista y consolidada está la decisión para su uso dentro
 * de Exercise Semantics v2.
 */
export type SemanticEvidenceStatus =
  | 'established'
  | 'provisional'
  | 'unresolved';

export const VALID_SEMANTIC_EVIDENCE_STATUSES = new Set<SemanticEvidenceStatus>([
  'established',
  'provisional',
  'unresolved'
]);

/**
 * Target of a muscle contribution.
 * Discriminates between a canonical anatomical node (MuscleEntityId)
 * and a functional synergistic muscle complex (FunctionalMuscleGroup).
 *
 * Invariant: MuscleRegion is strictly NOT allowed as a contribution target.
 */
export type MuscleContributionTarget =
  | {
      readonly kind: 'anatomical';
      readonly entity: MuscleEntityId;
    }
  | {
      readonly kind: 'functional';
      readonly group: FunctionalMuscleGroup;
    };

/**
 * Deterministic, pure helper to identify and key contribution targets.
 * Used for duplicate detection, modifier lookup, and tests without JSON.stringify reliance.
 */
export function getMuscleContributionTargetKey(target: MuscleContributionTarget): string {
  if (target.kind === 'anatomical') {
    return `anatomical:${target.entity}`;
  }
  if (target.kind === 'functional') {
    return `functional:${target.group}`;
  }
  return `unknown:${String((target as Record<string, unknown>).kind)}`;
}

/**
 * Contribución biomecánica canónica de un objetivo (nodo anatómico o grupo funcional) en un ejercicio.
 */
export interface ExerciseMuscleContribution {
  readonly target: MuscleContributionTarget;
  readonly role: MuscleRole;
  readonly confidence: EvidenceConfidence;
  readonly status: SemanticEvidenceStatus;
  readonly evidenceIds?: readonly string[];
}

/**
 * Condición biomecánica o postural bajo la cual un modifier altera el énfasis motor.
 */
export type SemanticsModifierCondition =
  // Lower body
  | 'deep_hip_flexion'
  | 'unilateral'
  | 'long_stride'
  | 'short_stride'
  | 'supported_trunk'
  // Upper body
  | 'higher_incline'
  | 'narrow_grip'
  | 'wide_grip'
  | 'elbow_path_tucked'
  | 'elbow_path_flared'
  | 'forearm_supinated'
  | 'forearm_pronated'
  | 'forearm_neutral'
  | 'machine_supported';

export const VALID_MODIFIER_CONDITIONS = new Set<SemanticsModifierCondition>([
  'deep_hip_flexion',
  'unilateral',
  'long_stride',
  'short_stride',
  'supported_trunk',
  'higher_incline',
  'narrow_grip',
  'wide_grip',
  'elbow_path_tucked',
  'elbow_path_flared',
  'forearm_supinated',
  'forearm_pronated',
  'forearm_neutral',
  'machine_supported'
]);

/**
 * Efecto cualitativo del modifier sobre la contribución muscular.
 */
export type SemanticsModifierEffect =
  | 'increased_contribution'
  | 'decreased_contribution';

export const VALID_MODIFIER_EFFECTS = new Set<SemanticsModifierEffect>([
  'increased_contribution',
  'decreased_contribution'
]);

/**
 * Modificador declarativo para variaciones de ROM, postura o agarre.
 * Metadata semántica pura: NO altera cálculos productivos en tiempo de ejecución.
 */
export interface ExerciseSemanticsModifier {
  readonly id: string;
  readonly target: MuscleContributionTarget;
  readonly condition: SemanticsModifierCondition;
  readonly effect: SemanticsModifierEffect;
  readonly confidence: EvidenceConfidence;
  readonly status: SemanticEvidenceStatus;
}

/**
 * Perfil semántico biomecánico canónico de un ejercicio (v2).
 */
export interface ExerciseSemanticsV2 {
  readonly version: 2;
  readonly movementFamily: MovementFamily;
  readonly variation?: string;
  readonly contributions: readonly ExerciseMuscleContribution[];
  readonly modifiers?: readonly ExerciseSemanticsModifier[];
}

export interface ExerciseSemanticsValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Función pura de validación runtime para perfiles de ExerciseSemanticsV2.
 * Detecta:
 * - Objeto nulo o versión incorrecta
 * - Movement family inválida
 * - Contribuciones vacías o malformadas
 * - Músculos duplicados en contributions
 * - Modifiers que referencian músculos que no existen en contributions
 * - Modifiers con condiciones o efectos inválidos
 */
export function validateExerciseSemantics(profile: unknown): ExerciseSemanticsValidationResult {
  const errors: string[] = [];

  if (typeof profile !== 'object' || profile === null) {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  const p = profile as Record<string, unknown>;

  if (p.version !== 2) {
    errors.push(`Invalid version: expected 2, got ${String(p.version)}`);
  }

  if (typeof p.movementFamily !== 'string' || !VALID_MOVEMENT_FAMILIES.has(p.movementFamily as MovementFamily)) {
    errors.push(`Invalid movementFamily: ${String(p.movementFamily)}`);
  }

  if (p.variation !== undefined && (typeof p.variation !== 'string' || p.variation.trim().length === 0)) {
    errors.push('variation must be a non-empty string when provided');
  }

  if (!Array.isArray(p.contributions) || p.contributions.length === 0) {
    errors.push('contributions must be a non-empty array');
    return { valid: false, errors };
  }

  const seenTargetKeys = new Set<string>();

  for (let i = 0; i < p.contributions.length; i++) {
    const item = p.contributions[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`contributions[${i}] must be an object`);
      continue;
    }

    const c = item as Record<string, unknown>;

    if (typeof c.target !== 'object' || c.target === null) {
      errors.push(`contributions[${i}].target must be a valid MuscleContributionTarget object`);
    } else {
      const t = c.target as Record<string, unknown>;
      let targetValid = false;

      if (t.kind === 'anatomical') {
        if (typeof t.entity !== 'string' || !(t.entity in MUSCLE_ENTITY_METADATA)) {
          errors.push(`contributions[${i}].target.entity is not a recognized MuscleEntityId: ${String(t.entity)}`);
        } else {
          targetValid = true;
        }
      } else if (t.kind === 'functional') {
        if (!isFunctionalMuscleGroup(t.group)) {
          errors.push(`contributions[${i}].target.group is not a recognized FunctionalMuscleGroup: ${String(t.group)}`);
        } else {
          targetValid = true;
        }
      } else {
        errors.push(`contributions[${i}].target.kind is invalid: ${String(t.kind)} (regions and unknown kinds are not permitted)`);
      }

      if (targetValid) {
        const key = getMuscleContributionTargetKey(c.target as MuscleContributionTarget);
        if (seenTargetKeys.has(key)) {
          errors.push(`Duplicate target contribution: ${key}`);
        }
        seenTargetKeys.add(key);
      }
    }

    if (typeof c.role !== 'string' || !VALID_MUSCLE_ROLES.has(c.role as MuscleRole)) {
      errors.push(`contributions[${i}].role is invalid: ${String(c.role)}`);
    }

    if (typeof c.confidence !== 'string' || !VALID_EVIDENCE_CONFIDENCES.has(c.confidence as EvidenceConfidence)) {
      errors.push(`contributions[${i}].confidence is invalid: ${String(c.confidence)}`);
    }

    if (typeof c.status !== 'string' || !VALID_SEMANTIC_EVIDENCE_STATUSES.has(c.status as SemanticEvidenceStatus)) {
      errors.push(`contributions[${i}].status is invalid: ${String(c.status)}`);
    }

    if (c.evidenceIds !== undefined) {
      if (!Array.isArray(c.evidenceIds) || c.evidenceIds.some((id) => typeof id !== 'string')) {
        errors.push(`contributions[${i}].evidenceIds must be an array of strings`);
      }
    }
  }

  if (p.modifiers !== undefined) {
    if (!Array.isArray(p.modifiers)) {
      errors.push('modifiers must be an array when provided');
    } else {
      for (let i = 0; i < p.modifiers.length; i++) {
        const item = p.modifiers[i];
        if (typeof item !== 'object' || item === null) {
          errors.push(`modifiers[${i}] must be an object`);
          continue;
        }

        const m = item as Record<string, unknown>;

        if (typeof m.id !== 'string' || m.id.trim().length === 0) {
          errors.push(`modifiers[${i}].id must be a non-empty string`);
        }

        if (typeof m.target !== 'object' || m.target === null) {
          errors.push(`modifiers[${i}].target must be a valid MuscleContributionTarget object`);
        } else {
          const mt = m.target as Record<string, unknown>;
          let modifierTargetValid = false;

          if (mt.kind === 'anatomical') {
            if (typeof mt.entity !== 'string' || !(mt.entity in MUSCLE_ENTITY_METADATA)) {
              errors.push(`modifiers[${i}].target.entity is not a recognized MuscleEntityId: ${String(mt.entity)}`);
            } else {
              modifierTargetValid = true;
            }
          } else if (mt.kind === 'functional') {
            if (!isFunctionalMuscleGroup(mt.group)) {
              errors.push(`modifiers[${i}].target.group is not a recognized FunctionalMuscleGroup: ${String(mt.group)}`);
            } else {
              modifierTargetValid = true;
            }
          } else {
            errors.push(`modifiers[${i}].target.kind is invalid: ${String(mt.kind)}`);
          }

          if (modifierTargetValid) {
            const mKey = getMuscleContributionTargetKey(m.target as MuscleContributionTarget);
            if (!seenTargetKeys.has(mKey)) {
              errors.push(`modifiers[${i}] references target "${mKey}" which does not exist in profile contributions`);
            }
          }
        }

        if (typeof m.condition !== 'string' || !VALID_MODIFIER_CONDITIONS.has(m.condition as SemanticsModifierCondition)) {
          errors.push(`modifiers[${i}].condition is invalid: ${String(m.condition)}`);
        }

        if (typeof m.effect !== 'string' || !VALID_MODIFIER_EFFECTS.has(m.effect as SemanticsModifierEffect)) {
          errors.push(`modifiers[${i}].effect is invalid: ${String(m.effect)}`);
        }

        if (typeof m.confidence !== 'string' || !VALID_EVIDENCE_CONFIDENCES.has(m.confidence as EvidenceConfidence)) {
          errors.push(`modifiers[${i}].confidence is invalid: ${String(m.confidence)}`);
        }

        if (typeof m.status !== 'string' || !VALID_SEMANTIC_EVIDENCE_STATUSES.has(m.status as SemanticEvidenceStatus)) {
          errors.push(`modifiers[${i}].status is invalid: ${String(m.status)}`);
        }
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
 * LOWER BODY SEMANTICS REGISTRY v1
 * ============================================================================
 * Perfiles biomecánicos canónicos para patrones compuestos de tren inferior
 * suficientemente consolidados por la investigación biomecánica.
 *
 * NO conectado todavía a cálculos de usuario ni asignación de set credits.
 */
export const LOWER_BODY_SEMANTICS_REGISTRY: Readonly<Record<string, ExerciseSemanticsV2>> = Object.freeze({
  back_squat: {
    version: 2,
    movementFamily: 'squat',
    variation: 'back_squat',
    contributions: [
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'secondary', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'adductor_magnus' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'gluteus_medius' }, role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'gluteus_minimus' }, role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ],
    modifiers: [
      {
        id: 'back_squat_deep_hip_flexion',
        target: { kind: 'anatomical', entity: 'adductor_magnus' },
        condition: 'deep_hip_flexion',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'provisional'
      }
    ]
  },

  generic_leg_press: {
    version: 2,
    movementFamily: 'leg_press',
    variation: 'generic_leg_press',
    contributions: [
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'adductor_magnus' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  },

  conventional_deadlift: {
    version: 2,
    movementFamily: 'deadlift',
    variation: 'conventional',
    contributions: [
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'secondary', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'adductor_magnus' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  sumo_deadlift: {
    version: 2,
    movementFamily: 'deadlift',
    variation: 'sumo',
    contributions: [
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'prime', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'adductor_magnus' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  romanian_deadlift: {
    version: 2,
    movementFamily: 'romanian_deadlift',
    variation: 'standard',
    contributions: [
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'adductor_magnus' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'minimal', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  hip_thrust: {
    version: 2,
    movementFamily: 'hip_thrust',
    variation: 'barbell',
    contributions: [
      { target: { kind: 'anatomical', entity: 'gluteus_maximus' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'hamstrings' }, role: 'secondary', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  }
});

/**
 * ============================================================================
 * UPPER BODY SEMANTICS REGISTRY v1
 * ============================================================================
 * Perfiles biomecánicos canónicos para patrones compuestos de tren superior
 * consolidados con base en literatura biomecánica y electromiográfica rigurosa.
 *
 * NOTAS DE MODELADO:
 * - Rotator cuff se modela como functional target stabilizer sin inventar subdivisiones anatómicas.
 * - Flat Bench utiliza anterior_deltoid = secondary (no co_prime) para reflejar el perfil global.
 * - High Flared Row modela posterior_deltoid = prime y latissimus_dorsi = secondary.
 * - Chest-supported Row omite erector_spinae base por descarga postural completa del torso.
 * - Machine Shoulder Press omite estabilizadores de columna/core por el soporte rígido del respaldo.
 * - Chin-Up modela biceps_brachii = co_prime con estatus provisional por falta de normalización unificada con lats.
 */
export const UPPER_BODY_SEMANTICS_REGISTRY: Readonly<Record<string, ExerciseSemanticsV2>> = Object.freeze({
  flat_bench_press: {
    version: 2,
    movementFamily: 'bench_press',
    variation: 'flat_barbell',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'secondary', confidence: 'high', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'flat_bench_narrow_grip_triceps',
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        condition: 'narrow_grip',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'established'
      },
      {
        id: 'flat_bench_narrow_grip_anterior_deltoid',
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        condition: 'narrow_grip',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'established'
      },
      {
        id: 'flat_bench_wide_grip_triceps',
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        condition: 'wide_grip',
        effect: 'decreased_contribution',
        confidence: 'moderate',
        status: 'established'
      }
    ]
  },

  incline_bench_press: {
    version: 2,
    movementFamily: 'incline_press',
    variation: 'low_incline',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'secondary', confidence: 'high', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'incline_bench_higher_incline_anterior_deltoid',
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        condition: 'higher_incline',
        effect: 'increased_contribution',
        confidence: 'high',
        status: 'established'
      }
    ]
  },

  moderate_incline_bench_press: {
    version: 2,
    movementFamily: 'incline_press',
    variation: 'moderate_incline_transition',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ]
  },

  decline_bench_press: {
    version: 2,
    movementFamily: 'decline_press',
    variation: 'standard',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ]
  },

  standing_barbell_overhead_press: {
    version: 2,
    movementFamily: 'vertical_press',
    variation: 'barbell_standing',
    contributions: [
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'lateral_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'serratus_anterior' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rectus_abdominis' }, role: 'resisted_isometric', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'obliques' }, role: 'resisted_isometric', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'moderate', status: 'established' }
    ]
  },

  dumbbell_shoulder_press: {
    version: 2,
    movementFamily: 'vertical_press',
    variation: 'dumbbell',
    contributions: [
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'lateral_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'serratus_anterior' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ]
  },

  machine_shoulder_press: {
    version: 2,
    movementFamily: 'vertical_press',
    variation: 'machine_supported',
    contributions: [
      { target: { kind: 'anatomical', entity: 'anterior_deltoid' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'triceps_brachii' }, role: 'co_prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'lateral_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ]
  },

  barbell_row: {
    version: 2,
    movementFamily: 'row',
    variation: 'barbell_low_elbow',
    contributions: [
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'posterior_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'erector_spinae' }, role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'barbell_row_flared_elbows_posterior_deltoid',
        target: { kind: 'anatomical', entity: 'posterior_deltoid' },
        condition: 'elbow_path_flared',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'established'
      },
      {
        id: 'barbell_row_flared_elbows_trapezius',
        target: { kind: 'anatomical', entity: 'trapezius' },
        condition: 'elbow_path_flared',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'established'
      },
      {
        id: 'barbell_row_flared_elbows_rhomboids',
        target: { kind: 'anatomical', entity: 'rhomboids' },
        condition: 'elbow_path_flared',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'established'
      },
      {
        id: 'barbell_row_flared_elbows_latissimus_dorsi',
        target: { kind: 'anatomical', entity: 'latissimus_dorsi' },
        condition: 'elbow_path_flared',
        effect: 'decreased_contribution',
        confidence: 'moderate',
        status: 'established'
      }
    ]
  },

  chest_supported_row: {
    version: 2,
    movementFamily: 'row',
    variation: 'chest_supported_low_elbow',
    contributions: [
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'posterior_deltoid' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  },

  high_flared_row: {
    version: 2,
    movementFamily: 'row',
    variation: 'high_flared',
    contributions: [
      { target: { kind: 'anatomical', entity: 'posterior_deltoid' }, role: 'prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'low', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  },

  pull_up: {
    version: 2,
    movementFamily: 'pull_up',
    variation: 'pronated_standard',
    contributions: [
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'secondary', confidence: 'low', status: 'provisional' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rectus_abdominis' }, role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'obliques' }, role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ]
  },

  chin_up: {
    version: 2,
    movementFamily: 'chin_up',
    variation: 'supinated_standard',
    contributions: [
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'co_prime', confidence: 'moderate', status: 'provisional' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'secondary', confidence: 'low', status: 'provisional' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rectus_abdominis' }, role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'obliques' }, role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ]
  },

  lat_pulldown: {
    version: 2,
    movementFamily: 'pulldown',
    variation: 'pronated_standard',
    contributions: [
      { target: { kind: 'anatomical', entity: 'latissimus_dorsi' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'teres_major' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'biceps_brachii' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'brachioradialis' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'trapezius' }, role: 'secondary', confidence: 'moderate', status: 'established' },
      { target: { kind: 'anatomical', entity: 'rhomboids' }, role: 'secondary', confidence: 'low', status: 'provisional' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ],
    modifiers: [
      {
        id: 'lat_pulldown_forearm_supinated',
        target: { kind: 'anatomical', entity: 'biceps_brachii' },
        condition: 'forearm_supinated',
        effect: 'increased_contribution',
        confidence: 'high',
        status: 'established'
      },
      {
        id: 'lat_pulldown_forearm_neutral',
        target: { kind: 'anatomical', entity: 'brachioradialis' },
        condition: 'forearm_neutral',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'provisional'
      }
    ]
  }
});

/**
 * Registro general de perfiles semánticos v2.
 * Consolida Lower Body Registry v1 y Upper Body Registry v1.
 */
export const EXERCISE_SEMANTICS_REGISTRY: Readonly<Record<string, ExerciseSemanticsV2>> = Object.freeze({
  ...LOWER_BODY_SEMANTICS_REGISTRY,
  ...UPPER_BODY_SEMANTICS_REGISTRY
});
