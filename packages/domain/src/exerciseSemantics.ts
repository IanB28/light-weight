import { type MuscleEntityId, MUSCLE_ENTITY_METADATA } from './muscleTaxonomy.js';

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
 * Contribución biomecánica canónica de un nodo anatómico en un ejercicio.
 * Utiliza estrictamente MuscleEntityId (nodo anatómico canónico), NO regiones ni grupos funcionales.
 */
export interface ExerciseMuscleContribution {
  readonly muscle: MuscleEntityId;
  readonly role: MuscleRole;
  readonly confidence: EvidenceConfidence;
  readonly status: SemanticEvidenceStatus;
  readonly evidenceIds?: readonly string[];
}

/**
 * Condición biomecánica o postural bajo la cual un modifier altera el énfasis motor.
 */
export type SemanticsModifierCondition =
  | 'deep_hip_flexion'
  | 'unilateral'
  | 'long_stride'
  | 'short_stride'
  | 'supported_trunk';

export const VALID_MODIFIER_CONDITIONS = new Set<SemanticsModifierCondition>([
  'deep_hip_flexion',
  'unilateral',
  'long_stride',
  'short_stride',
  'supported_trunk'
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
 * Modificador declarativo para variaciones de ROM o postura.
 * Metadata semántica pura: NO altera cálculos productivos en tiempo de ejecución.
 */
export interface ExerciseSemanticsModifier {
  readonly id: string;
  readonly muscle: MuscleEntityId;
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

  const seenMuscles = new Set<string>();

  for (let i = 0; i < p.contributions.length; i++) {
    const item = p.contributions[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`contributions[${i}] must be an object`);
      continue;
    }

    const c = item as Record<string, unknown>;

    if (typeof c.muscle !== 'string' || !(c.muscle in MUSCLE_ENTITY_METADATA)) {
      errors.push(`contributions[${i}].muscle is not a recognized MuscleEntityId: ${String(c.muscle)}`);
    } else {
      if (seenMuscles.has(c.muscle)) {
        errors.push(`Duplicate muscle contribution: ${c.muscle}`);
      }
      seenMuscles.add(c.muscle);
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

        if (typeof m.muscle !== 'string' || !(m.muscle in MUSCLE_ENTITY_METADATA)) {
          errors.push(`modifiers[${i}].muscle is not a recognized MuscleEntityId: ${String(m.muscle)}`);
        } else if (!seenMuscles.has(m.muscle)) {
          errors.push(`modifiers[${i}] references muscle "${m.muscle}" which does not exist in profile contributions`);
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
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'gluteus_maximus', role: 'co_prime', confidence: 'high', status: 'established' },
      { muscle: 'hamstrings', role: 'secondary', confidence: 'high', status: 'established' },
      { muscle: 'adductor_magnus', role: 'secondary', confidence: 'moderate', status: 'established' },
      { muscle: 'erector_spinae', role: 'resisted_isometric', confidence: 'high', status: 'established' },
      { muscle: 'gluteus_medius', role: 'stabilizer', confidence: 'moderate', status: 'established' },
      { muscle: 'gluteus_minimus', role: 'stabilizer', confidence: 'moderate', status: 'established' }
    ],
    modifiers: [
      {
        id: 'back_squat_deep_hip_flexion',
        muscle: 'adductor_magnus',
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
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'gluteus_maximus', role: 'co_prime', confidence: 'high', status: 'established' },
      { muscle: 'adductor_magnus', role: 'secondary', confidence: 'moderate', status: 'established' },
      { muscle: 'hamstrings', role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  },

  conventional_deadlift: {
    version: 2,
    movementFamily: 'deadlift',
    variation: 'conventional',
    contributions: [
      { muscle: 'gluteus_maximus', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'hamstrings', role: 'co_prime', confidence: 'high', status: 'established' },
      { muscle: 'quadriceps', role: 'secondary', confidence: 'high', status: 'established' },
      { muscle: 'adductor_magnus', role: 'secondary', confidence: 'moderate', status: 'established' },
      { muscle: 'erector_spinae', role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  sumo_deadlift: {
    version: 2,
    movementFamily: 'deadlift',
    variation: 'sumo',
    contributions: [
      { muscle: 'gluteus_maximus', role: 'prime', confidence: 'moderate', status: 'established' },
      { muscle: 'quadriceps', role: 'co_prime', confidence: 'high', status: 'established' },
      { muscle: 'hamstrings', role: 'secondary', confidence: 'moderate', status: 'established' },
      { muscle: 'adductor_magnus', role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { muscle: 'erector_spinae', role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  romanian_deadlift: {
    version: 2,
    movementFamily: 'romanian_deadlift',
    variation: 'standard',
    contributions: [
      { muscle: 'hamstrings', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'gluteus_maximus', role: 'co_prime', confidence: 'high', status: 'established' },
      { muscle: 'adductor_magnus', role: 'secondary', confidence: 'moderate', status: 'provisional' },
      { muscle: 'quadriceps', role: 'minimal', confidence: 'high', status: 'established' },
      { muscle: 'erector_spinae', role: 'resisted_isometric', confidence: 'high', status: 'established' }
    ]
  },

  hip_thrust: {
    version: 2,
    movementFamily: 'hip_thrust',
    variation: 'barbell',
    contributions: [
      { muscle: 'gluteus_maximus', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'hamstrings', role: 'secondary', confidence: 'high', status: 'established' },
      { muscle: 'quadriceps', role: 'secondary', confidence: 'moderate', status: 'established' }
    ]
  }
});

/**
 * Registro general de perfiles semánticos v2.
 * Inicialmente contiene exclusivamente el Lower Body Registry v1 consolidado.
 */
export const EXERCISE_SEMANTICS_REGISTRY: Readonly<Record<string, ExerciseSemanticsV2>> = Object.freeze({
  ...LOWER_BODY_SEMANTICS_REGISTRY
});
