import type {
  Exercise,
  ExerciseCategory,
  ExerciseLoadingProfile,
  ExerciseLoadMechanism,
  ExerciseLoadMode,
  ExercisePlateBaseKind,
  MuscleGroup
} from './types.js';
import {
  mapDatasetBodypartToMuscle,
  mapDatasetEquipmentToCategory,
  mapDatasetSecondaryMuscles,
  type RawDatasetExercise
} from './exerciseCatalogMapping.js';
import { resolveExerciseLoadingProfile } from './exerciseLoading.js';

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

export type ExerciseComplexity = 'compound' | 'isolation' | 'unknown';

export type MachineResistanceClass =
  | 'none_expected'
  | 'inherent_resistance_candidate'
  | 'known_current'
  | 'unknown';

export interface ExerciseAuditRecord {
  id: string;
  name: string;
  raw: {
    bodyPart: string;
    target: string;
    secondaryMuscles: string[];
    equipment: string;
  };
  current: {
    equipmentCategory: ExerciseCategory;
    primaryMuscle: MuscleGroup;
    secondaryMuscles: MuscleGroup[];
    loadMechanism: ExerciseLoadMechanism;
    loadMode: ExerciseLoadMode;
    bodyweightFactor?: number;
    plateBaseKind?: ExercisePlateBaseKind;
  };
  inferred: {
    movementFamily: MovementFamily;
    complexity: ExerciseComplexity;
    machineResistanceClass: MachineResistanceClass;
  };
  flags: string[];
}

export interface CatalogAuditSummary {
  totalExercises: number;
  byRawEquipment: Record<string, number>;
  byCurrentCategory: Record<ExerciseCategory, number>;
  byRawTarget: Record<string, number>;
  byCurrentPrimaryMuscle: Record<MuscleGroup, number>;
  byLoadMechanism: Record<ExerciseLoadMechanism, number>;
  byLoadMode: Record<ExerciseLoadMode, number>;
  byComplexity: Record<ExerciseComplexity, number>;
  byMovementFamily: Record<MovementFamily, number>;
  byFlag: Record<string, number>;
  flaggedExerciseIds: Record<string, string[]>;
  machineResistanceCandidates: string[];
  plateLoadedCandidates: string[];
  bodyweightAssistedCandidates: string[];
}

export function inferMovementFamily(name = '', target = '', category: ExerciseCategory = 'other'): MovementFamily {
  const n = name.toLowerCase();
  const tg = target.toLowerCase();

  // Specific lower body variations first
  if (/\bleg\s+press\b/i.test(n) || /\bsquat\s+press\b/i.test(n)) return 'leg_press';
  if (/\bhack\s+squat\b/i.test(n)) return 'hack_squat';
  if (/\bpendulum\s+squat\b/i.test(n)) return 'pendulum_squat';
  if (/\bsplit\s+squat\b/i.test(n) || /\bbulgarian\b/i.test(n)) return 'split_squat';
  if (/\blunge\b/i.test(n)) return 'lunge';
  if (/\bstep[ -]?up\b/i.test(n)) return 'step_up';

  // Deadlift variants
  if (/\b(?:romanian|rdl|stiff[ -]leg(?:ged)?|straight[ -]leg)\s+(?:deadlift|lift)\b/i.test(n)) return 'romanian_deadlift';
  if (/\bdeadlift\b/i.test(n)) return 'deadlift';

  // Hip thrust & glute drive
  if (/\b(?:hip\s+thrust|glute\s+bridge|glute\s+drive)\b/i.test(n)) return 'hip_thrust';

  // Squat general
  if (/\b(?:squat|v-squat|super\s+squat|belt\s+squat)\b/i.test(n)) return 'squat';

  // Knee flexion / extension / calves
  if (/\b(?:leg|knee)\s+extension\b/i.test(n)) return 'knee_extension';
  if (/\b(?:leg|knee|hamstring)\s+curl\b/i.test(n)) return 'knee_flexion';
  if (/\bcalf(?:\s+raise|\s+press)?\b/i.test(n) || tg.includes('calves')) return 'calf_raise';

  // Upper push: Angle specific presses
  if (/\bincline\s+(?:bench\s+)?(?:press|chest\s+press)\b/i.test(n)) return 'incline_press';
  if (/\bdecline\s+(?:bench\s+)?(?:press|chest\s+press)\b/i.test(n)) return 'decline_press';
  if (/\b(?:overhead\s+press|shoulder\s+press|military\s+press|push\s+press|strict\s+press|arnold\s+press|pike\s+press|seated\s+front\s+press)\b/i.test(n)) return 'vertical_press';
  if (/\b(?:bench\s+press|chest\s+press|push[ -]?ups?)\b/i.test(n) || (/\bpress\b/i.test(n) && tg.includes('pectorals'))) return 'bench_press';
  if (/\b(?:fly|flye?s?|pec\s+deck|pec\s+fly|cable\s+crossover)\b/i.test(n) && !/\breverse\s+fly\b/i.test(n)) return 'fly';

  // Upper pull
  if (/\bchin[ -]?ups?\b/i.test(n)) return 'chin_up';
  if (/\bpull[ -]?ups?\b/i.test(n)) return 'pull_up';
  if (/\b(?:lat\s+)?pull[ -]?down\b/i.test(n)) return 'pulldown';
  if (/\brow(?:ing)?\b/i.test(n)) return 'row';

  // Shoulders isolation
  if (/\blateral\s+raise\b/i.test(n)) return 'lateral_raise';
  if (/\b(?:rear\s+delt|face\s+pull|reverse\s+fly)\b/i.test(n)) return 'rear_delt';
  if (/\bfront\s+raise\b/i.test(n)) return 'front_raise';

  // Arms
  if (/\b(?:biceps?\s+)?curl\b/i.test(n) || (tg.includes('biceps') && /\bcurl\b/i.test(n))) return 'elbow_flexion';
  if (/\b(?:triceps?\s+)?(?:extension|pushdown|kickback|skull\s*crusher|french\s+press|dip|dips)\b/i.test(n)) return 'elbow_extension';

  // Other / Core / Carry
  if (/\b(?:farmer'?s?\s+walk|carry)\b/i.test(n)) return 'carry';
  if (tg.includes('abs') || tg.includes('waist') || /\b(?:crunch|plank|sit[ -]?up|leg\s+raise|ab\s+wheel|v-up)\b/i.test(n)) return 'core';

  return 'other';
}

export function inferComplexity(name = '', family: MovementFamily): ExerciseComplexity {
  const n = name.toLowerCase();

  const compoundFamilies = new Set<MovementFamily>([
    'squat', 'leg_press', 'hack_squat', 'pendulum_squat', 'split_squat',
    'lunge', 'step_up', 'deadlift', 'romanian_deadlift', 'hip_thrust',
    'bench_press', 'incline_press', 'decline_press', 'vertical_press',
    'row', 'pulldown', 'pull_up', 'chin_up'
  ]);

  if (compoundFamilies.has(family)) return 'compound';
  if (/\b(?:dip|dips|push[ -]?ups?|muscle[ -]?ups?)\b/i.test(n)) return 'compound';

  const isolationFamilies = new Set<MovementFamily>([
    'knee_extension', 'knee_flexion', 'calf_raise', 'fly',
    'elbow_flexion', 'elbow_extension', 'lateral_raise', 'rear_delt', 'front_raise'
  ]);

  if (isolationFamilies.has(family)) {
    // Dips are compound even though elbow extension is involved
    if (/\bdip\b/i.test(n)) return 'compound';
    return 'isolation';
  }

  if (/\b(?:curl|extension|kickback|pullover|shrug|wrist|raise)\b/i.test(n)) return 'isolation';

  return 'unknown';
}

export function inferMachineResistanceClass(
  raw: RawDatasetExercise,
  loading: ExerciseLoadingProfile
): MachineResistanceClass {
  // Known current with fixed tare base (e.g. Smith machine)
  if (loading.plateBase?.kind === 'fixed') {
    return 'known_current';
  }

  const eq = (raw.eq || '').toLowerCase();
  const n = (raw.n || '').toLowerCase();

  // Distinct from selectorized stack machines: sled / plate loaded machines with inherent carriage mass
  const isSledOrPlateLoaded = loading.mechanism === 'plate_loaded'
    || eq.includes('sled')
    || eq.includes('plate loaded')
    || eq.includes('plate-loaded')
    || /\b(?:sled|45°?\s+leg\s+press|hack\s+squat|pendulum|squat\s+press|v-squat|super\s+squat|glute\s+drive|belt\s+squat)\b/i.test(n);

  if (isSledOrPlateLoaded) {
    return 'inherent_resistance_candidate';
  }

  // Pure bodyweight, dumbbells, barbells, or pure selectorized stacks without sled
  if (loading.mechanism === 'barbell' || loading.mechanism === 'dumbbell' || loading.mechanism === 'bodyweight') {
    return 'none_expected';
  }

  if (loading.mechanism === 'selectorized' && !isSledOrPlateLoaded) {
    return 'none_expected';
  }

  if (eq.includes('machine') || eq.includes('leverage')) {
    return 'unknown';
  }

  return 'none_expected';
}

export function detectAuditFlags(
  raw: RawDatasetExercise,
  current: ExerciseAuditRecord['current'],
  inferred: ExerciseAuditRecord['inferred']
): string[] {
  const flags: string[] = [];
  const rawEq = (raw.eq || '').toLowerCase();
  const rawTg = (raw.tg || '').toLowerCase();
  const rawBp = (raw.bp || '').toLowerCase();
  const name = (raw.n || '').toLowerCase();

  // 1. Unmapped equipment
  if (!rawEq || current.equipmentCategory === 'other') {
    flags.push('UNMAPPED_EQUIPMENT');
  }

  // 2 & 3. Unmapped target / fallback to core
  const recognizedTargetTerms = [
    'biceps', 'triceps', 'lats', 'upper back', 'spine', 'pectorals', 'delts',
    'quads', 'hamstrings', 'glutes', 'calves', 'forearms', 'abs'
  ];
  const hasRecognizedTarget = recognizedTargetTerms.some((term) => rawTg.includes(term));
  if (!hasRecognizedTarget && rawBp !== 'waist') {
    flags.push('UNMAPPED_TARGET');
    if (current.primaryMuscle === 'core') {
      flags.push('TARGET_FALLBACK_TO_CORE');
    }
  }

  // 4 & 7. Compound with no secondaries / single muscle metadata
  if (inferred.complexity === 'compound') {
    if (current.secondaryMuscles.length === 0) {
      flags.push('COMPOUND_WITH_NO_SECONDARIES');
      flags.push('COMPOUND_SINGLE_MUSCLE_METADATA');
    } else if (current.secondaryMuscles.length === 1 && current.secondaryMuscles[0] === 'core' && current.primaryMuscle !== 'core') {
      flags.push('COMPOUND_SINGLE_MUSCLE_METADATA');
    }
  }

  // 5 & 6. Lower body compound with glutes only or quadriceps only
  const lowerBodyCompounds = new Set<MovementFamily>([
    'squat', 'leg_press', 'hack_squat', 'pendulum_squat', 'split_squat', 'lunge', 'step_up'
  ]);
  if (lowerBodyCompounds.has(inferred.movementFamily)) {
    if (current.primaryMuscle === 'glutes') {
      flags.push('LOWER_BODY_COMPOUND_PRIMARY_GLUTES_ONLY');
    }
    if (current.primaryMuscle === 'quadriceps') {
      flags.push('LOWER_BODY_COMPOUND_PRIMARY_QUADRICEPS_ONLY');
    }
  }

  // 8. Secondary duplicates primary in raw
  const rawSecondaryMusclesMapped = (raw.sm || []).map((m) => mapDatasetBodypartToMuscle('', m));
  if (rawSecondaryMusclesMapped.includes(current.primaryMuscle)) {
    flags.push('SECONDARY_DUPLICATES_PRIMARY');
  }

  // 9. Plate loaded without base resistance metadata
  if (current.loadMechanism === 'plate_loaded' && current.plateBaseKind !== 'fixed' && current.plateBaseKind !== 'user_bar') {
    flags.push('PLATE_LOADED_NO_BASE_RESISTANCE_METADATA');
  }

  // 10. Possible plate loaded machine resolved as selectorized
  const appearsPlateLoaded = rawEq.includes('sled')
    || rawEq.includes('plate loaded')
    || rawEq.includes('plate-loaded')
    || rawEq.includes('leverage')
    || /\b(?:sled|45°?\s+leg\s+press|hack\s+squat|pendulum|super\s+squat|v-squat|leverage)\b/i.test(name);
  if (appearsPlateLoaded && current.loadMechanism === 'selectorized') {
    flags.push('POSSIBLE_PLATE_LOADED_MACHINE');
  }

  // 11. Inherent machine resistance candidate
  if (inferred.machineResistanceClass === 'inherent_resistance_candidate') {
    flags.push('POSSIBLE_INHERENT_MACHINE_RESISTANCE');
  }

  // 12. Smith without fixed base
  if ((rawEq.includes('smith') || name.includes('smith')) && current.plateBaseKind !== 'fixed') {
    flags.push('SMITH_WITHOUT_FIXED_BASE');
  }

  // 13. Machine category with unknown load mechanism
  if (current.equipmentCategory === 'machine' && current.loadMechanism === 'other') {
    flags.push('MACHINE_UNKNOWN_LOAD_MECHANISM');
  }

  // 14. Sled resolved non-plate loaded
  if ((rawEq.includes('sled') || name.includes('sled')) && current.loadMechanism !== 'plate_loaded') {
    flags.push('SLED_RESOLVED_NON_PLATE_LOADED');
  }

  // 15. Leverage / lever resolved selectorized only
  if ((rawEq.includes('leverage') || name.includes('leverage') || name.includes('lever ')) && current.loadMechanism === 'selectorized') {
    flags.push('LEVER_RESOLVED_SELECTOR_ONLY');
  }

  // 16. Assisted metadata inconsistent
  if (rawEq.includes('assisted') || name.includes('assisted')) {
    if (current.loadMode !== 'assisted' || current.bodyweightFactor === undefined) {
      flags.push('ASSISTED_METADATA_INCONSISTENT');
    }
  }

  // 17. Bodyweight metadata inconsistent
  if (current.equipmentCategory === 'bodyweight') {
    if (current.loadMechanism !== 'bodyweight' || (current.loadMode === 'assisted' && current.bodyweightFactor === undefined)) {
      flags.push('BODYWEIGHT_METADATA_INCONSISTENT');
    }
  }

  return Array.from(new Set(flags));
}

export function auditExercise(raw: RawDatasetExercise): ExerciseAuditRecord {
  const primaryMuscle = mapDatasetBodypartToMuscle(raw.bp, raw.tg);
  const secondaryMuscles = mapDatasetSecondaryMuscles(raw.sm, primaryMuscle);
  const equipmentCategory = mapDatasetEquipmentToCategory(raw.eq);

  const exercise: Exercise = {
    id: `ex-${raw.id}`,
    name: raw.n ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1) : 'Ejercicio',
    category: equipmentCategory,
    primaryMuscle,
    secondaryMuscles,
    instructions: raw.st || [],
    img: raw.img,
    gif: raw.gif,
    targetMuscle: raw.tg,
    isCustom: false
  };

  const loading = resolveExerciseLoadingProfile(exercise, { legacyEquipment: raw.eq }).profile;

  const movementFamily = inferMovementFamily(raw.n || '', raw.tg || '', equipmentCategory);
  const complexity = inferComplexity(raw.n || '', movementFamily);
  const machineResistanceClass = inferMachineResistanceClass(raw, loading);

  const inferred: ExerciseAuditRecord['inferred'] = {
    movementFamily,
    complexity,
    machineResistanceClass
  };

  const current: ExerciseAuditRecord['current'] = {
    equipmentCategory,
    primaryMuscle,
    secondaryMuscles,
    loadMechanism: loading.mechanism,
    loadMode: loading.loadMode,
    bodyweightFactor: loading.bodyweightFactor,
    plateBaseKind: loading.plateBase?.kind
  };

  const flags = detectAuditFlags(raw, current, inferred);

  return {
    id: `ex-${raw.id}`,
    name: raw.n ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1) : 'Ejercicio',
    raw: {
      bodyPart: raw.bp || '',
      target: raw.tg || '',
      secondaryMuscles: raw.sm || [],
      equipment: raw.eq || ''
    },
    current,
    inferred,
    flags
  };
}

export function auditExerciseCatalog(rawDataset: RawDatasetExercise[]): {
  records: ExerciseAuditRecord[];
  summary: CatalogAuditSummary;
} {
  const records = rawDataset.map(auditExercise);

  const summary: CatalogAuditSummary = {
    totalExercises: records.length,
    byRawEquipment: {},
    byCurrentCategory: {} as Record<ExerciseCategory, number>,
    byRawTarget: {},
    byCurrentPrimaryMuscle: {} as Record<MuscleGroup, number>,
    byLoadMechanism: {} as Record<ExerciseLoadMechanism, number>,
    byLoadMode: {} as Record<ExerciseLoadMode, number>,
    byComplexity: { compound: 0, isolation: 0, unknown: 0 },
    byMovementFamily: {} as Record<MovementFamily, number>,
    byFlag: {},
    flaggedExerciseIds: {},
    machineResistanceCandidates: [],
    plateLoadedCandidates: [],
    bodyweightAssistedCandidates: []
  };

  for (const record of records) {
    // Raw equipment
    const eq = record.raw.equipment || 'none';
    summary.byRawEquipment[eq] = (summary.byRawEquipment[eq] || 0) + 1;

    // Current category
    summary.byCurrentCategory[record.current.equipmentCategory] =
      (summary.byCurrentCategory[record.current.equipmentCategory] || 0) + 1;

    // Raw target
    const tg = record.raw.target || 'none';
    summary.byRawTarget[tg] = (summary.byRawTarget[tg] || 0) + 1;

    // Current primary muscle
    summary.byCurrentPrimaryMuscle[record.current.primaryMuscle] =
      (summary.byCurrentPrimaryMuscle[record.current.primaryMuscle] || 0) + 1;

    // Load mechanism
    summary.byLoadMechanism[record.current.loadMechanism] =
      (summary.byLoadMechanism[record.current.loadMechanism] || 0) + 1;

    // Load mode
    summary.byLoadMode[record.current.loadMode] =
      (summary.byLoadMode[record.current.loadMode] || 0) + 1;

    // Complexity
    summary.byComplexity[record.inferred.complexity] =
      (summary.byComplexity[record.inferred.complexity] || 0) + 1;

    // Movement family
    summary.byMovementFamily[record.inferred.movementFamily] =
      (summary.byMovementFamily[record.inferred.movementFamily] || 0) + 1;

    // Flags
    for (const flag of record.flags) {
      summary.byFlag[flag] = (summary.byFlag[flag] || 0) + 1;
      if (!summary.flaggedExerciseIds[flag]) {
        summary.flaggedExerciseIds[flag] = [];
      }
      summary.flaggedExerciseIds[flag].push(record.id);
    }

    // Candidates
    if (record.inferred.machineResistanceClass === 'inherent_resistance_candidate') {
      summary.machineResistanceCandidates.push(record.id);
    }
    if (record.current.loadMechanism === 'plate_loaded') {
      summary.plateLoadedCandidates.push(record.id);
    }
    if (record.current.loadMode === 'assisted') {
      summary.bodyweightAssistedCandidates.push(record.id);
    }
  }

  return { records, summary };
}
