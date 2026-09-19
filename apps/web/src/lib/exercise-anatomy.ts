import type {
  Exercise,
  MuscleGroup,
  MuscleRole,
  MuscleEntityId,
  FunctionalMuscleGroup,
  ResolvedExerciseContributionTarget,
  ResolvedExerciseContribution
} from '@light-weight/domain';
import {
  resolveExerciseSemantics
} from '@light-weight/domain';

/**
 * 19 canonical SVG muscle paths supported by the Light Weight body geometry (BODY_PATHS).
 * Non-muscle silhouette paths (head, hair, neck, hands, knees, ankles, feet) are inert.
 */
export type BodyMusclePath =
  | 'chest'
  | 'abs'
  | 'biceps'
  | 'triceps'
  | 'deltoids'
  | 'obliques'
  | 'quadriceps'
  | 'calves'
  | 'adductors'
  | 'trapezius'
  | 'neck'
  | 'forearm'
  | 'tibialis'
  | 'serratus'
  | 'hip-flexors'
  | 'upper-back'
  | 'lower-back'
  | 'gluteal'
  | 'hamstring';

export const ALL_BODY_MUSCLE_PATHS: readonly BodyMusclePath[] = Object.freeze([
  'chest',
  'abs',
  'biceps',
  'triceps',
  'deltoids',
  'obliques',
  'quadriceps',
  'calves',
  'adductors',
  'trapezius',
  'neck',
  'forearm',
  'tibialis',
  'serratus',
  'hip-flexors',
  'upper-back',
  'lower-back',
  'gluteal',
  'hamstring'
]);

export interface ExerciseBodyMapRegion {
  readonly pathKey: BodyMusclePath;
  readonly contributions: readonly ResolvedExerciseContribution[];
  readonly strongestRole: MuscleRole;
  readonly visualIntensity: number;
}

export interface ExerciseBodyMapData {
  readonly source: 'semantic_v2' | 'legacy';
  readonly profileKey?: string;
  readonly regions: Partial<Record<BodyMusclePath, ExerciseBodyMapRegion>>;
  readonly allContributions: readonly ResolvedExerciseContribution[];
}

/**
 * Deterministic role precedence hierarchy for visual dominance.
 * prime > co_prime > secondary > resisted_isometric > stabilizer > minimal
 */
export const MUSCLE_ROLE_PRECEDENCE: readonly MuscleRole[] = Object.freeze([
  'prime',
  'co_prime',
  'secondary',
  'resisted_isometric',
  'stabilizer',
  'minimal'
]);

/**
 * STRICTLY INTERNAL visual intensity scale for SVG fill opacity rendering.
 * INVARIANT: Never displayed as physiological percentages to the user.
 * INVARIANT: Never reused for Strength or Training Credit calculations.
 */
export const ROLE_VISUAL_INTENSITY: Readonly<Record<MuscleRole, number>> = Object.freeze({
  prime: 1.0,
  co_prime: 0.82,
  secondary: 0.60,
  resisted_isometric: 0.42,
  stabilizer: 0.28,
  minimal: 0.14
});

/**
 * Adapts a ResolvedExerciseContributionTarget to a BodyMusclePath.
 *
 * Eliminates avoidable legacy collapses where supported by SVG geometry:
 * - serratus_anterior -> 'serratus'
 * - adductors / adductor_magnus -> 'adductors'
 * - erector_spinae -> 'lower-back'
 * - trapezius -> 'trapezius'
 * - tibialis_anterior -> 'tibialis'
 * - hip_flexors -> 'hip-flexors'
 *
 * Honors genuine geometry limitations without fabricating fake paths:
 * - anterior/lateral/posterior deltoid -> 'deltoids'
 * - gluteus maximus/medius/minimus -> 'gluteal'
 * - latissimus dorsi/rhomboids/teres major -> 'upper-back'
 *
 * Deep/unmapped targets (e.g. rotator_cuff) return null without error.
 */
export function mapContributionTargetToBodyPath(
  target: ResolvedExerciseContributionTarget
): BodyMusclePath | null {
  if (target.kind === 'anatomical') {
    switch (target.entity) {
      case 'pectoralis_major':
      case 'pectoralis_minor':
        return 'chest';
      case 'serratus_anterior':
        return 'serratus';
      case 'anterior_deltoid':
      case 'lateral_deltoid':
      case 'posterior_deltoid':
        return 'deltoids';
      case 'trapezius':
        return 'trapezius';
      case 'latissimus_dorsi':
      case 'rhomboids':
      case 'teres_major':
        return 'upper-back';
      case 'erector_spinae':
        return 'lower-back';
      case 'biceps_brachii':
      case 'brachialis':
        return 'biceps';
      case 'brachioradialis':
      case 'wrist_flexors':
      case 'wrist_extensors':
        return 'forearm';
      case 'triceps_brachii':
        return 'triceps';
      case 'rectus_abdominis':
      case 'transverse_abdominis':
        return 'abs';
      case 'obliques':
        return 'obliques';
      case 'gluteus_maximus':
      case 'gluteus_medius':
      case 'gluteus_minimus':
        return 'gluteal';
      case 'quadriceps':
        return 'quadriceps';
      case 'hamstrings':
        return 'hamstring';
      case 'adductors':
      case 'adductor_magnus':
        return 'adductors';
      case 'gastrocnemius':
      case 'soleus':
        return 'calves';
      case 'tibialis_anterior':
        return 'tibialis';
      case 'levator_scapulae':
      case 'sternocleidomastoid':
        return 'neck';
      default:
        return null;
    }
  }

  if (target.kind === 'functional') {
    switch (target.group) {
      case 'hip_flexors':
        return 'hip-flexors';
      case 'hip_abductors':
        return 'gluteal';
      case 'grip_muscles':
        return 'forearm';
      case 'ankle_stabilizers':
        return 'tibialis';
      case 'rotator_cuff':
        // Deep stabilizer complex under deltoid/scapula.
        // Conservatively unmapped to surface geometry to avoid fabricating surface anatomy.
        return null;
      default:
        return null;
    }
  }

  if (target.kind === 'legacy') {
    switch (target.group) {
      case 'chest':
        return 'chest';
      case 'back':
        return 'upper-back';
      case 'shoulders':
        return 'deltoids';
      case 'biceps':
        return 'biceps';
      case 'triceps':
        return 'triceps';
      case 'forearms':
        return 'forearm';
      case 'quadriceps':
        return 'quadriceps';
      case 'hamstrings':
        return 'hamstring';
      case 'glutes':
        return 'gluteal';
      case 'calves':
        return 'calves';
      case 'core':
        return 'abs';
      default:
        return null;
    }
  }

  return null;
}

/**
 * Aggregates muscle contributions by their mapped SVG body path.
 * Retains ALL contributors for shared regions (e.g. latissimus + rhomboids + teres major in upper-back).
 * Computes strongestRole deterministically using MUSCLE_ROLE_PRECEDENCE for visual dominance.
 */
export function aggregateContributionsByBodyPath(
  contributions: readonly ResolvedExerciseContribution[]
): Partial<Record<BodyMusclePath, ExerciseBodyMapRegion>> {
  const grouped = new Map<BodyMusclePath, ResolvedExerciseContribution[]>();

  for (const contrib of contributions) {
    const path = mapContributionTargetToBodyPath(contrib.target);
    if (!path) continue;

    const list = grouped.get(path);
    if (list) {
      list.push(contrib);
    } else {
      grouped.set(path, [contrib]);
    }
  }

  const result: Partial<Record<BodyMusclePath, ExerciseBodyMapRegion>> = {};

  for (const [pathKey, list] of grouped.entries()) {
    let strongestRole: MuscleRole = 'minimal';
    let bestPrecedenceIndex = Number.POSITIVE_INFINITY;

    for (const c of list) {
      const idx = MUSCLE_ROLE_PRECEDENCE.indexOf(c.role);
      if (idx !== -1 && idx < bestPrecedenceIndex) {
        bestPrecedenceIndex = idx;
        strongestRole = c.role;
      }
    }

    result[pathKey] = Object.freeze({
      pathKey,
      contributions: Object.freeze([...list]),
      strongestRole,
      visualIntensity: ROLE_VISUAL_INTENSITY[strongestRole]
    });
  }

  return Object.freeze(result);
}

/**
 * Resolves the full exercise body map data pipeline for any Exercise object.
 */
export function resolveExerciseBodyMapData(
  exercise: Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>
): ExerciseBodyMapData {
  const semantics = resolveExerciseSemantics(exercise);
  const regions = aggregateContributionsByBodyPath(semantics.contributions);

  return Object.freeze({
    source: semantics.source,
    profileKey: semantics.profileKey,
    regions,
    allContributions: semantics.contributions
  });
}

// Localized qualitative names for muscle targets
export const SPANISH_ANATOMICAL_NAMES: Readonly<Record<MuscleEntityId, string>> = Object.freeze({
  pectoralis_major: 'Pectoral mayor',
  pectoralis_minor: 'Pectoral menor',
  serratus_anterior: 'Serrato anterior',
  anterior_deltoid: 'Deltoides anterior',
  lateral_deltoid: 'Deltoides lateral',
  posterior_deltoid: 'Deltoides posterior',
  teres_major: 'Redondo mayor',
  levator_scapulae: 'Elevador de la escápula',
  latissimus_dorsi: 'Dorsal ancho',
  trapezius: 'Trapecio',
  rhomboids: 'Romboides',
  erector_spinae: 'Erectores espinales',
  biceps_brachii: 'Bíceps braquial',
  brachialis: 'Braquial',
  brachioradialis: 'Braquiorradial',
  triceps_brachii: 'Tríceps braquial',
  wrist_flexors: 'Flexores de muñeca',
  wrist_extensors: 'Extensores de muñeca',
  rectus_abdominis: 'Recto abdominal',
  obliques: 'Oblicuos',
  transverse_abdominis: 'Transverso abdominal',
  gluteus_maximus: 'Glúteo mayor',
  gluteus_medius: 'Glúteo medio',
  gluteus_minimus: 'Glúteo menor',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  adductors: 'Aductores',
  adductor_magnus: 'Aductor mayor',
  gastrocnemius: 'Gastrocnemio',
  soleus: 'Sóleo',
  tibialis_anterior: 'Tibial anterior',
  sternocleidomastoid: 'Esternocleidomastoideo'
});

export const ENGLISH_ANATOMICAL_NAMES: Readonly<Record<MuscleEntityId, string>> = Object.freeze({
  pectoralis_major: 'Pectoralis Major',
  pectoralis_minor: 'Pectoralis Minor',
  serratus_anterior: 'Serratus Anterior',
  anterior_deltoid: 'Anterior Deltoid',
  lateral_deltoid: 'Lateral Deltoid',
  posterior_deltoid: 'Posterior Deltoid',
  teres_major: 'Teres Major',
  levator_scapulae: 'Levator Scapulae',
  latissimus_dorsi: 'Latissimus Dorsi',
  trapezius: 'Trapezius',
  rhomboids: 'Rhomboids',
  erector_spinae: 'Erector Spinae',
  biceps_brachii: 'Biceps Brachii',
  brachialis: 'Brachialis',
  brachioradialis: 'Brachioradialis',
  triceps_brachii: 'Triceps Brachii',
  wrist_flexors: 'Wrist Flexors',
  wrist_extensors: 'Wrist Extensors',
  rectus_abdominis: 'Rectus Abdominis',
  obliques: 'Obliques',
  transverse_abdominis: 'Transverse Abdominis',
  gluteus_maximus: 'Gluteus Maximus',
  gluteus_medius: 'Gluteus Medius',
  gluteus_minimus: 'Gluteus Minimus',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  adductor_magnus: 'Adductor Magnus',
  gastrocnemius: 'Gastrocnemius',
  soleus: 'Soleus',
  tibialis_anterior: 'Tibialis Anterior',
  sternocleidomastoid: 'Sternocleidomastoid'
});

export const SPANISH_FUNCTIONAL_NAMES: Readonly<Record<FunctionalMuscleGroup, string>> = Object.freeze({
  rotator_cuff: 'Manguito rotador',
  hip_flexors: 'Flexores de cadera',
  hip_abductors: 'Abductores de cadera',
  ankle_stabilizers: 'Estabilizadores de tobillo',
  grip_muscles: 'Músculos de agarre'
});

export const ENGLISH_FUNCTIONAL_NAMES: Readonly<Record<FunctionalMuscleGroup, string>> = Object.freeze({
  rotator_cuff: 'Rotator Cuff',
  hip_flexors: 'Hip Flexors',
  hip_abductors: 'Hip Abductors',
  ankle_stabilizers: 'Ankle Stabilizers',
  grip_muscles: 'Grip Muscles'
});

export const SPANISH_LEGACY_NAMES: Readonly<Record<MuscleGroup, string>> = Object.freeze({
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  core: 'Abdomen / Core'
});

export const ENGLISH_LEGACY_NAMES: Readonly<Record<MuscleGroup, string>> = Object.freeze({
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core'
});

export const SPANISH_BODY_PATH_NAMES: Readonly<Record<BodyMusclePath, string>> = Object.freeze({
  chest: 'Pecho',
  abs: 'Abdomen',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  deltoids: 'Hombros',
  obliques: 'Oblicuos',
  quadriceps: 'Cuádriceps',
  calves: 'Pantorrillas',
  adductors: 'Aductores',
  trapezius: 'Trapecio',
  neck: 'Cuello',
  forearm: 'Antebrazos',
  tibialis: 'Tibial',
  serratus: 'Serrato',
  'hip-flexors': 'Flexores de cadera',
  'upper-back': 'Espalda alta',
  'lower-back': 'Espalda baja',
  gluteal: 'Glúteos',
  hamstring: 'Isquiotibiales'
});

export const ENGLISH_BODY_PATH_NAMES: Readonly<Record<BodyMusclePath, string>> = Object.freeze({
  chest: 'Chest',
  abs: 'Abs',
  biceps: 'Biceps',
  triceps: 'Triceps',
  deltoids: 'Deltoids',
  obliques: 'Obliques',
  quadriceps: 'Quadriceps',
  calves: 'Calves',
  adductors: 'Adductors',
  trapezius: 'Trapezius',
  neck: 'Neck',
  forearm: 'Forearms',
  tibialis: 'Tibialis',
  serratus: 'Serratus',
  'hip-flexors': 'Hip Flexors',
  'upper-back': 'Upper Back',
  'lower-back': 'Lower Back',
  gluteal: 'Glutes',
  hamstring: 'Hamstrings'
});

export function getBodyPathDisplayName(path: BodyMusclePath, locale: 'es' | 'en' = 'es'): string {
  return locale === 'es' ? SPANISH_BODY_PATH_NAMES[path] || path : ENGLISH_BODY_PATH_NAMES[path] || path;
}

export const ROLE_DISPLAY_NAMES: Readonly<Record<MuscleRole, { es: string; en: string }>> = Object.freeze({
  prime: { es: 'Principal', en: 'Prime' },
  co_prime: { es: 'Co-principal', en: 'Co-prime' },
  secondary: { es: 'Secundario', en: 'Secondary' },
  resisted_isometric: { es: 'Isométrico', en: 'Isometric' },
  stabilizer: { es: 'Estabilizador', en: 'Stabilizer' },
  minimal: { es: 'Mínimo', en: 'Minimal' }
});

export function getMuscleTargetDisplayName(
  target: ResolvedExerciseContributionTarget,
  locale: 'es' | 'en' = 'es'
): string {
  if (target.kind === 'anatomical') {
    return locale === 'es'
      ? SPANISH_ANATOMICAL_NAMES[target.entity] || target.entity
      : ENGLISH_ANATOMICAL_NAMES[target.entity] || target.entity;
  }
  if (target.kind === 'functional') {
    return locale === 'es'
      ? SPANISH_FUNCTIONAL_NAMES[target.group] || target.group
      : ENGLISH_FUNCTIONAL_NAMES[target.group] || target.group;
  }
  if (target.kind === 'legacy') {
    return locale === 'es'
      ? SPANISH_LEGACY_NAMES[target.group] || target.group
      : ENGLISH_LEGACY_NAMES[target.group] || target.group;
  }
  return locale === 'es' ? 'Músculo' : 'Muscle';
}
