import type { MuscleGroup } from './types.js';

/**
 * Canonical anatomical node.
 * Represents a discrete, recognized anatomical unit in the musculoskeletal system,
 * which may be:
 * - an individual muscle (e.g. 'pectoralis_major', 'brachialis', 'latissimus_dorsi')
 * - a recognized anatomical muscle group (e.g. 'quadriceps', 'hamstrings', 'adductors')
 */
export type MuscleEntityId =
  // Chest & anterior trunk
  | 'pectoralis_major'
  | 'pectoralis_minor'
  | 'serratus_anterior'
  // Shoulders & scapular stabilisers
  | 'anterior_deltoid'
  | 'lateral_deltoid'
  | 'posterior_deltoid'
  | 'teres_major'
  | 'levator_scapulae'
  // Back & posterior trunk
  | 'latissimus_dorsi'
  | 'trapezius'
  | 'rhomboids'
  | 'erector_spinae'
  // Upper arms
  | 'biceps_brachii'
  | 'brachialis'
  | 'brachioradialis'
  | 'triceps_brachii'
  // Forearms
  | 'wrist_flexors'
  | 'wrist_extensors'
  // Abdominal wall & core
  | 'rectus_abdominis'
  | 'obliques'
  | 'transverse_abdominis'
  // Hips & Gluteal complex
  | 'gluteus_maximus'
  | 'gluteus_medius'
  | 'gluteus_minimus'
  // Thighs (Upper legs)
  | 'quadriceps'
  | 'hamstrings'
  | 'adductors'
  // Lower legs
  | 'gastrocnemius'
  | 'soleus'
  | 'tibialis_anterior'
  // Neck
  | 'sternocleidomastoid';

/**
 * Anatomical / product regions used for visual grouping, analytics roll-ups, and broad queries.
 */
export type MuscleRegion =
  | 'chest'
  | 'shoulders'
  | 'back'
  | 'arms'
  | 'forearms'
  | 'core'
  | 'lower_back'
  | 'glutes'
  | 'upper_legs'
  | 'lower_legs'
  | 'neck';

/**
 * Functional muscle groups representing a biomechanical action or synergistic complex
 * without assuming a specific single muscle entity.
 */
export type FunctionalMuscleGroup =
  | 'hip_flexors'
  | 'hip_abductors'
  | 'rotator_cuff'
  | 'ankle_stabilizers'
  | 'grip_muscles';

export type MuscleTermResolutionKind =
  | 'anatomical'
  | 'functional'
  | 'regional'
  | 'unknown';

export type MuscleTermResolutionConfidence = 'high' | 'moderate' | 'low';

export interface MuscleTermResolution {
  raw: string;
  normalized: string;
  kind: MuscleTermResolutionKind;
  entity?: MuscleEntityId;
  region?: MuscleRegion;
  functionalGroup?: FunctionalMuscleGroup;
  legacyGroup?: MuscleGroup;
  confidence: MuscleTermResolutionConfidence;
}

export interface MuscleEntityMetadata {
  region: MuscleRegion;
  legacyGroup?: MuscleGroup;
  standardName: string;
}

export const MUSCLE_ENTITY_METADATA: Readonly<Record<MuscleEntityId, MuscleEntityMetadata>> = Object.freeze({
  pectoralis_major: { region: 'chest', legacyGroup: 'chest', standardName: 'Pectoralis Major' },
  pectoralis_minor: { region: 'chest', legacyGroup: 'chest', standardName: 'Pectoralis Minor' },
  serratus_anterior: { region: 'chest', legacyGroup: undefined, standardName: 'Serratus Anterior' },

  anterior_deltoid: { region: 'shoulders', legacyGroup: 'shoulders', standardName: 'Anterior Deltoid' },
  lateral_deltoid: { region: 'shoulders', legacyGroup: 'shoulders', standardName: 'Lateral Deltoid' },
  posterior_deltoid: { region: 'shoulders', legacyGroup: 'shoulders', standardName: 'Posterior Deltoid' },
  teres_major: { region: 'back', legacyGroup: 'back', standardName: 'Teres Major' },
  levator_scapulae: { region: 'neck', legacyGroup: undefined, standardName: 'Levator Scapulae' },

  latissimus_dorsi: { region: 'back', legacyGroup: 'back', standardName: 'Latissimus Dorsi' },
  trapezius: { region: 'back', legacyGroup: 'back', standardName: 'Trapezius' },
  rhomboids: { region: 'back', legacyGroup: 'back', standardName: 'Rhomboids' },
  erector_spinae: { region: 'lower_back', legacyGroup: 'back', standardName: 'Erector Spinae' },

  biceps_brachii: { region: 'arms', legacyGroup: 'biceps', standardName: 'Biceps Brachii' },
  brachialis: { region: 'arms', legacyGroup: 'biceps', standardName: 'Brachialis' },
  brachioradialis: { region: 'forearms', legacyGroup: 'forearms', standardName: 'Brachioradialis' },
  triceps_brachii: { region: 'arms', legacyGroup: 'triceps', standardName: 'Triceps Brachii' },

  wrist_flexors: { region: 'forearms', legacyGroup: 'forearms', standardName: 'Wrist Flexors' },
  wrist_extensors: { region: 'forearms', legacyGroup: 'forearms', standardName: 'Wrist Extensors' },

  rectus_abdominis: { region: 'core', legacyGroup: 'core', standardName: 'Rectus Abdominis' },
  obliques: { region: 'core', legacyGroup: 'core', standardName: 'Obliques' },
  transverse_abdominis: { region: 'core', legacyGroup: 'core', standardName: 'Transverse Abdominis' },

  gluteus_maximus: { region: 'glutes', legacyGroup: 'glutes', standardName: 'Gluteus Maximus' },
  gluteus_medius: { region: 'glutes', legacyGroup: 'glutes', standardName: 'Gluteus Medius' },
  gluteus_minimus: { region: 'glutes', legacyGroup: 'glutes', standardName: 'Gluteus Minimus' },

  quadriceps: { region: 'upper_legs', legacyGroup: 'quadriceps', standardName: 'Quadriceps' },
  hamstrings: { region: 'upper_legs', legacyGroup: 'hamstrings', standardName: 'Hamstrings' },
  adductors: { region: 'upper_legs', legacyGroup: undefined, standardName: 'Adductors' },

  gastrocnemius: { region: 'lower_legs', legacyGroup: 'calves', standardName: 'Gastrocnemius' },
  soleus: { region: 'lower_legs', legacyGroup: 'calves', standardName: 'Soleus' },
  tibialis_anterior: { region: 'lower_legs', legacyGroup: undefined, standardName: 'Tibialis Anterior' },

  sternocleidomastoid: { region: 'neck', legacyGroup: undefined, standardName: 'Sternocleidomastoid' }
});

interface InternalTermMatch {
  kind: MuscleTermResolutionKind;
  entity?: MuscleEntityId;
  region?: MuscleRegion;
  functionalGroup?: FunctionalMuscleGroup;
  legacyGroup?: MuscleGroup;
  confidence: MuscleTermResolutionConfidence;
}

const EXACT_TERM_MAP: Readonly<Record<string, InternalTermMatch>> = Object.freeze({
  // Quadriceps
  quadriceps: { kind: 'anatomical', entity: 'quadriceps', confidence: 'high' },
  quads: { kind: 'anatomical', entity: 'quadriceps', confidence: 'high' },
  quad: { kind: 'anatomical', entity: 'quadriceps', confidence: 'high' },

  // Hamstrings
  hamstrings: { kind: 'anatomical', entity: 'hamstrings', confidence: 'high' },
  hamstring: { kind: 'anatomical', entity: 'hamstrings', confidence: 'high' },

  // Adductors (NEVER quadriceps, NEVER core!)
  adductors: { kind: 'anatomical', entity: 'adductors', confidence: 'high' },
  adductor: { kind: 'anatomical', entity: 'adductors', confidence: 'high' },

  // Chest / Pectorals
  pectorals: { kind: 'anatomical', entity: 'pectoralis_major', confidence: 'high' },
  pectoral: { kind: 'anatomical', entity: 'pectoralis_major', confidence: 'high' },
  'pectoralis major': { kind: 'anatomical', entity: 'pectoralis_major', confidence: 'high' },
  'pectoralis minor': { kind: 'anatomical', entity: 'pectoralis_minor', confidence: 'high' },
  'upper chest': { kind: 'anatomical', entity: 'pectoralis_major', confidence: 'high' },

  // Scapular & Anterior Trunk
  'serratus anterior': { kind: 'anatomical', entity: 'serratus_anterior', confidence: 'high' },
  'levator scapulae': { kind: 'anatomical', entity: 'levator_scapulae', confidence: 'high' },

  // Deltoids (Heads)
  'anterior deltoid': { kind: 'anatomical', entity: 'anterior_deltoid', confidence: 'high' },
  'anterior deltoids': { kind: 'anatomical', entity: 'anterior_deltoid', confidence: 'high' },
  'front delts': { kind: 'anatomical', entity: 'anterior_deltoid', confidence: 'high' },
  'front delt': { kind: 'anatomical', entity: 'anterior_deltoid', confidence: 'high' },

  'lateral deltoid': { kind: 'anatomical', entity: 'lateral_deltoid', confidence: 'high' },
  'lateral deltoids': { kind: 'anatomical', entity: 'lateral_deltoid', confidence: 'high' },
  'side delts': { kind: 'anatomical', entity: 'lateral_deltoid', confidence: 'high' },
  'side delt': { kind: 'anatomical', entity: 'lateral_deltoid', confidence: 'high' },

  'posterior deltoid': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },
  'posterior deltoids': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },
  'rear deltoids': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },
  'rear deltoid': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },
  'rear delts': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },
  'rear delt': { kind: 'anatomical', entity: 'posterior_deltoid', confidence: 'high' },

  // Back Muscles
  'latissimus dorsi': { kind: 'anatomical', entity: 'latissimus_dorsi', confidence: 'high' },
  lats: { kind: 'anatomical', entity: 'latissimus_dorsi', confidence: 'high' },
  lat: { kind: 'anatomical', entity: 'latissimus_dorsi', confidence: 'high' },

  trapezius: { kind: 'anatomical', entity: 'trapezius', confidence: 'high' },
  traps: { kind: 'anatomical', entity: 'trapezius', confidence: 'high' },
  trap: { kind: 'anatomical', entity: 'trapezius', confidence: 'high' },

  rhomboids: { kind: 'anatomical', entity: 'rhomboids', confidence: 'high' },
  rhomboid: { kind: 'anatomical', entity: 'rhomboids', confidence: 'high' },

  'teres major': { kind: 'anatomical', entity: 'teres_major', confidence: 'high' },
  'erector spinae': { kind: 'anatomical', entity: 'erector_spinae', confidence: 'high' },

  // Arms
  biceps: { kind: 'anatomical', entity: 'biceps_brachii', confidence: 'high' },
  'biceps brachii': { kind: 'anatomical', entity: 'biceps_brachii', confidence: 'high' },
  brachialis: { kind: 'anatomical', entity: 'brachialis', confidence: 'high' },
  brachioradialis: { kind: 'anatomical', entity: 'brachioradialis', confidence: 'high' },

  triceps: { kind: 'anatomical', entity: 'triceps_brachii', confidence: 'high' },
  'triceps brachii': { kind: 'anatomical', entity: 'triceps_brachii', confidence: 'high' },

  // Forearms
  'wrist flexors': { kind: 'anatomical', entity: 'wrist_flexors', confidence: 'high' },
  'wrist flexor': { kind: 'anatomical', entity: 'wrist_flexors', confidence: 'high' },
  'wrist extensors': { kind: 'anatomical', entity: 'wrist_extensors', confidence: 'high' },
  'wrist extensor': { kind: 'anatomical', entity: 'wrist_extensors', confidence: 'high' },

  // Abdominal Wall & Core
  abs: { kind: 'anatomical', entity: 'rectus_abdominis', confidence: 'high' },
  'rectus abdominis': { kind: 'anatomical', entity: 'rectus_abdominis', confidence: 'high' },
  'lower abs': { kind: 'anatomical', entity: 'rectus_abdominis', confidence: 'high' },
  obliques: { kind: 'anatomical', entity: 'obliques', confidence: 'high' },
  oblique: { kind: 'anatomical', entity: 'obliques', confidence: 'high' },
  'transverse abdominis': { kind: 'anatomical', entity: 'transverse_abdominis', confidence: 'high' },

  // Glutes (Heads)
  'gluteus maximus': { kind: 'anatomical', entity: 'gluteus_maximus', confidence: 'high' },
  'gluteus medius': { kind: 'anatomical', entity: 'gluteus_medius', confidence: 'high' },
  'gluteus minimus': { kind: 'anatomical', entity: 'gluteus_minimus', confidence: 'high' },

  // Lower Legs
  gastrocnemius: { kind: 'anatomical', entity: 'gastrocnemius', confidence: 'high' },
  soleus: { kind: 'anatomical', entity: 'soleus', confidence: 'high' },
  'tibialis anterior': { kind: 'anatomical', entity: 'tibialis_anterior', confidence: 'high' },

  // Neck
  sternocleidomastoid: { kind: 'anatomical', entity: 'sternocleidomastoid', confidence: 'high' },

  // ==========================================
  // Functional Muscle Groups (DO NOT OVERINTERPRET)
  // ==========================================
  'hip flexors': {
    kind: 'functional',
    functionalGroup: 'hip_flexors',
    region: undefined, // Purely functional, no invented region
    legacyGroup: undefined, // NEVER core! NO iliopsoas!
    confidence: 'high'
  },
  'hip flexor': {
    kind: 'functional',
    functionalGroup: 'hip_flexors',
    region: undefined,
    legacyGroup: undefined,
    confidence: 'high'
  },
  abductors: {
    kind: 'functional',
    functionalGroup: 'hip_abductors',
    region: undefined, // Purely functional, no invented region
    legacyGroup: undefined, // NO automatic gluteus_medius!
    confidence: 'high'
  },
  abductor: {
    kind: 'functional',
    functionalGroup: 'hip_abductors',
    region: undefined,
    legacyGroup: undefined,
    confidence: 'high'
  },
  'rotator cuff': {
    kind: 'functional',
    functionalGroup: 'rotator_cuff',
    region: undefined, // Purely functional, no invented region
    legacyGroup: undefined, // NEVER core! No invented individual member
    confidence: 'high'
  },
  'ankle stabilizers': {
    kind: 'functional',
    functionalGroup: 'ankle_stabilizers',
    region: undefined,
    legacyGroup: undefined,
    confidence: 'high'
  },
  'grip muscles': {
    kind: 'functional',
    functionalGroup: 'grip_muscles',
    region: undefined,
    legacyGroup: undefined,
    confidence: 'high'
  },

  // ==========================================
  // Broad Regional Terms (DO NOT OVERINTERPRET)
  // ==========================================
  chest: { kind: 'regional', region: 'chest', legacyGroup: 'chest', confidence: 'high' },

  shoulders: { kind: 'regional', region: 'shoulders', legacyGroup: 'shoulders', confidence: 'high' },
  shoulder: { kind: 'regional', region: 'shoulders', legacyGroup: 'shoulders', confidence: 'high' },
  delts: { kind: 'regional', region: 'shoulders', legacyGroup: 'shoulders', confidence: 'high' },
  deltoids: { kind: 'regional', region: 'shoulders', legacyGroup: 'shoulders', confidence: 'high' },
  deltoid: { kind: 'regional', region: 'shoulders', legacyGroup: 'shoulders', confidence: 'high' },

  back: { kind: 'regional', region: 'back', legacyGroup: 'back', confidence: 'high' }, // NO lats assumption
  'upper back': { kind: 'regional', region: 'back', legacyGroup: 'back', confidence: 'high' }, // NO traps/rhomboids assumption
  'lower back': { kind: 'regional', region: 'lower_back', legacyGroup: 'back', confidence: 'high' }, // NO erector spinae assumption
  spine: { kind: 'regional', region: 'back', legacyGroup: 'back', confidence: 'moderate' },

  glutes: { kind: 'regional', region: 'glutes', legacyGroup: 'glutes', confidence: 'high' }, // NO gluteus maximus assumption
  gluteals: { kind: 'regional', region: 'glutes', legacyGroup: 'glutes', confidence: 'high' },
  glute: { kind: 'regional', region: 'glutes', legacyGroup: 'glutes', confidence: 'high' },

  calves: { kind: 'regional', region: 'lower_legs', legacyGroup: 'calves', confidence: 'high' },
  calf: { kind: 'regional', region: 'lower_legs', legacyGroup: 'calves', confidence: 'high' },

  forearms: { kind: 'regional', region: 'forearms', legacyGroup: 'forearms', confidence: 'high' },
  forearm: { kind: 'regional', region: 'forearms', legacyGroup: 'forearms', confidence: 'high' },
  wrists: { kind: 'regional', region: 'forearms', legacyGroup: undefined, confidence: 'moderate' },
  wrist: { kind: 'regional', region: 'forearms', legacyGroup: undefined, confidence: 'moderate' },
  hands: { kind: 'regional', region: 'forearms', legacyGroup: undefined, confidence: 'moderate' },
  hand: { kind: 'regional', region: 'forearms', legacyGroup: undefined, confidence: 'moderate' },

  core: { kind: 'regional', region: 'core', legacyGroup: 'core', confidence: 'high' },
  abdominals: { kind: 'regional', region: 'core', legacyGroup: 'core', confidence: 'high' },

  'inner thighs': { kind: 'regional', region: 'upper_legs', legacyGroup: undefined, confidence: 'moderate' },
  groin: { kind: 'regional', region: 'upper_legs', legacyGroup: undefined, confidence: 'moderate' },

  shins: { kind: 'regional', region: 'lower_legs', legacyGroup: undefined, confidence: 'moderate' },
  ankles: { kind: 'regional', region: 'lower_legs', legacyGroup: undefined, confidence: 'moderate' },
  feet: { kind: 'regional', region: 'lower_legs', legacyGroup: undefined, confidence: 'moderate' },
  neck: { kind: 'regional', region: 'neck', legacyGroup: undefined, confidence: 'moderate' }
});

/**
 * Pure deterministic resolver that turns any raw muscle string into a structured
 * domain resolution with exact kind (anatomical, functional, regional, or unknown).
 *
 * Invariant: Unknown strings are NEVER resolved to 'core' or arbitrary entities.
 */
export function resolveMuscleTerm(rawTerm: unknown): MuscleTermResolution {
  const raw = typeof rawTerm === 'string' ? rawTerm : '';
  const normalized = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return {
      raw,
      normalized,
      kind: 'unknown',
      confidence: 'low'
    };
  }

  const match = EXACT_TERM_MAP[normalized];
  if (match) {
    if (match.kind === 'anatomical' && match.entity) {
      const meta = MUSCLE_ENTITY_METADATA[match.entity];
      return {
        raw,
        normalized,
        kind: 'anatomical',
        entity: match.entity,
        region: match.region ?? meta.region,
        legacyGroup: match.legacyGroup ?? meta.legacyGroup,
        confidence: match.confidence
      };
    }

    return {
      raw,
      normalized,
      kind: match.kind,
      region: match.region,
      functionalGroup: match.functionalGroup,
      legacyGroup: match.legacyGroup,
      confidence: match.confidence
    };
  }

  // Explicit unknown (e.g. 'cardiovascular system', typos, arbitrary strings)
  return {
    raw,
    normalized,
    kind: 'unknown',
    confidence: 'low'
  };
}

/**
 * Resolves a list of raw muscle terms preserving original order and duplicates.
 */
export function resolveAllMuscleTerms(rawTerms: unknown[]): MuscleTermResolution[] {
  if (!Array.isArray(rawTerms)) return [];
  return rawTerms.map(resolveMuscleTerm);
}
