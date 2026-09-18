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
import { resolveExerciseLoadingProfile, isAssistedBodyweightMovement } from './exerciseLoading.js';
import {
  resolveMuscleTerm,
  resolveAllMuscleTerms,
  type MuscleTermResolution,
  type MuscleTermResolutionKind
} from './muscleTaxonomy.js';

export { type MovementFamily } from './exerciseSemantics.js';
import type { MovementFamily } from './exerciseSemantics.js';

export type ExerciseComplexity = 'compound' | 'isolation' | 'unknown';

export type MachineResistanceClass =
  | 'none_expected'
  | 'inherent_resistance_candidate'
  | 'known_current'
  | 'unknown';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AuditFinding {
  flag: string;
  severity: FindingSeverity;
  description: string;
}

export interface ExerciseAuditRecord {
  id: string;
  name: string;
  raw: {
    bodyPart: string;
    target: string;
    muscleMetadata: string;
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
  v2: {
    target: MuscleTermResolution;
    muscleMetadata?: MuscleTermResolution;
    secondaryMuscles: MuscleTermResolution[];
  };
  flags: string[];
  findings: AuditFinding[];
  highestSeverity?: FindingSeverity;
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
  byMachineResistanceClass: Record<MachineResistanceClass, number>;
  bySeverity: Record<FindingSeverity, number>;
  byFlag: Record<string, number>;
  flaggedExerciseIds: Record<string, string[]>;
  machineResistanceCandidates: string[];
  plateLoadedCandidates: string[];
  bodyweightAssistedCandidates: string[];
  v2Taxonomy: {
    targetsByResolutionKind: Record<MuscleTermResolutionKind, number>;
    allTermsByResolutionKind: Record<MuscleTermResolutionKind, number>;
    byResolutionKind: Record<MuscleTermResolutionKind, number>;
    byEntity: Record<string, number>;
    byRegion: Record<string, number>;
    byFunctionalGroup: Record<string, number>;
    unknownRawTerms: string[];
  };
}

export function inferMovementFamily(
  name = '',
  target = '',
  _category: ExerciseCategory = 'other'
): MovementFamily {
  const n = name.toLowerCase();
  const tg = target.toLowerCase();

  // 1. Calf movements MUST be prioritized before leg press so that
  // "Sled calf press on leg press" is classified by movement performed (calf_raise),
  // not by the platform machine (leg press).
  if (/\bcalf(?:\s+raise|\s+press)?\b/i.test(n) || tg.includes('calves')) {
    return 'calf_raise';
  }

  // 2. Specific lower body compound variations
  if (/\bleg\s+press\b/i.test(n) || /\bsquat\s+press\b/i.test(n)) return 'leg_press';
  if (/\bhack\s+squat\b/i.test(n)) return 'hack_squat';
  if (/\bpendulum\s+squat\b/i.test(n)) return 'pendulum_squat';
  if (/\bsplit\s+squat\b/i.test(n) || /\bbulgarian\b/i.test(n)) return 'split_squat';
  if (/\blunge\b/i.test(n)) return 'lunge';
  if (/\bstep[ -]?up\b/i.test(n)) return 'step_up';

  // 3. Deadlift variants
  if (/\b(?:romanian|rdl|stiff[ -]leg(?:ged)?|straight[ -]leg)\s+(?:deadlift|lift)\b/i.test(n)) {
    return 'romanian_deadlift';
  }
  if (/\bdeadlift\b/i.test(n)) return 'deadlift';

  // 4. Hip thrust & glute drive
  if (/\b(?:hip\s+thrust|glute\s+bridge|glute\s+drive)\b/i.test(n)) return 'hip_thrust';

  // 5. Squat general
  if (/\b(?:squat|v-squat|super\s+squat|belt\s+squat)\b/i.test(n)) return 'squat';

  // 6. Knee flexion / extension
  if (/\b(?:leg|knee)\s+extension\b/i.test(n)) return 'knee_extension';
  if (/\b(?:leg|knee|hamstring)\s+curl\b/i.test(n)) return 'knee_flexion';

  // 7. Upper push: Angle specific presses
  if (/\bincline\s+(?:bench\s+)?(?:press|chest\s+press)\b/i.test(n)) return 'incline_press';
  if (/\bdecline\s+(?:bench\s+)?(?:press|chest\s+press)\b/i.test(n)) return 'decline_press';
  if (/\b(?:overhead\s+press|shoulder\s+press|military\s+press|push\s+press|strict\s+press|arnold\s+press|pike\s+press|seated\s+front\s+press)\b/i.test(n)) {
    return 'vertical_press';
  }
  if (/\b(?:bench\s+press|chest\s+press|push[ -]?ups?)\b/i.test(n) || (/\bpress\b/i.test(n) && tg.includes('pectorals'))) {
    return 'bench_press';
  }
  if (/\b(?:fly|flye?s?|pec\s+deck|pec\s+fly|cable\s+crossover)\b/i.test(n) && !/\breverse\s+fly\b/i.test(n)) {
    return 'fly';
  }

  // 8. Upper pull
  if (/\bchin[ -]?ups?\b/i.test(n)) return 'chin_up';
  if (/\bpull[ -]?ups?\b/i.test(n)) return 'pull_up';
  if (/\b(?:lat\s+)?pull[ -]?down\b/i.test(n)) return 'pulldown';
  if (/\brow(?:ing)?\b/i.test(n)) return 'row';

  // 9. Shoulders isolation
  if (/\blateral\s+raise\b/i.test(n)) return 'lateral_raise';
  if (/\b(?:rear\s+delt|face\s+pull|reverse\s+fly)\b/i.test(n)) return 'rear_delt';
  if (/\bfront\s+raise\b/i.test(n)) return 'front_raise';

  // 10. Arms
  if (/\b(?:biceps?\s+)?curl\b/i.test(n) || (tg.includes('biceps') && /\bcurl\b/i.test(n))) {
    return 'elbow_flexion';
  }
  if (/\b(?:triceps?\s+)?(?:extension|pushdown|kickback|skull\s*crusher|french\s+press|dip|dips)\b/i.test(n)) {
    return 'elbow_extension';
  }

  // 11. Other / Core / Carry
  if (/\b(?:farmer'?s?\s+walk|carry)\b/i.test(n)) return 'carry';
  if (tg.includes('abs') || tg.includes('waist') || /\b(?:crunch|plank|sit[ -]?up|leg\s+raise|ab\s+wheel|v-up)\b/i.test(n)) {
    return 'core';
  }

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
  // 1. Known current: explicitly modeled fixed plate tare base (e.g. Smith machine with 20/22 lb base)
  if (loading.plateBase?.kind === 'fixed') {
    return 'known_current';
  }

  const eq = (raw.eq || '').toLowerCase();
  const n = (raw.n || '').toLowerCase();

  // 2. Pure free weights, bodyweight, cable, band, etc. can NEVER have inherent machine resistance.
  const nonMachineEquipments = new Set([
    'barbell', 'olympic barbell', 'ez barbell', 'trap bar',
    'dumbbell', 'body weight', 'cable', 'band', 'resistance band',
    'kettlebell', 'medicine ball', 'stability ball', 'bosu ball',
    'rope', 'roller', 'wheel roller', 'hammer', 'tire'
  ]);
  if (nonMachineEquipments.has(eq) && loading.mechanism !== 'plate_loaded') {
    return 'none_expected';
  }

  if (loading.mechanism === 'barbell' || loading.mechanism === 'dumbbell' || loading.mechanism === 'bodyweight' || loading.mechanism === 'cable') {
    return 'none_expected';
  }

  // 3. Inherent resistance candidate:
  // Requires MACHINE CONTEXT + physical sled / carriage movement mass before plates are added.
  // Note: leverage machines without sled carriages are candidates for plate-loaded vs selectorized,
  // but do NOT qualify as inherent resistance candidates without physical carriage evidence.
  const isMachineContext = eq.includes('sled machine')
    || eq.includes('plate loaded')
    || eq.includes('plate-loaded')
    || (loading.mechanism === 'plate_loaded' && (eq.includes('machine') || eq.includes('sled')));

  const isSledOrCarriage = eq.includes('sled machine')
    || /\b(?:sled|45°?\s+leg\s+press|hack\s+squat|pendulum|super\s+squat|v-squat)\b/i.test(n);

  if (isMachineContext && isSledOrCarriage && loading.mechanism === 'plate_loaded') {
    return 'inherent_resistance_candidate';
  }

  // Standard selectorized stack machines without sled
  if (loading.mechanism === 'selectorized') {
    return 'none_expected';
  }

  // If equipment is machine or leverage machine without sled carriage
  if (eq.includes('machine') || eq.includes('leverage')) {
    return 'unknown';
  }

  return 'none_expected';
}

function getCanonicalMuscleForMg(mg = ''): MuscleGroup | null {
  const s = (mg || '').toLowerCase().trim();
  if (s.includes('quad')) return 'quadriceps';
  if (s.includes('glute')) return 'glutes';
  if (s.includes('hamstring')) return 'hamstrings';
  if (s.includes('bicep')) return 'biceps';
  if (s.includes('tricep')) return 'triceps';
  if (s.includes('chest') || s.includes('pectoral')) return 'chest';
  if (s.includes('delt') || s.includes('shoulder') || s.includes('rotator')) return 'shoulders';
  if (s.includes('lat') || s.includes('back') || s.includes('rhomboid') || s.includes('trap')) return 'back';
  if (s.includes('calf') || s.includes('calves') || s.includes('soleus') || s.includes('ankle')) return 'calves';
  if (s.includes('forearm') || s.includes('wrist') || s.includes('hand')) return 'forearms';
  if (s.includes('ab') || s.includes('core') || s.includes('oblique') || s.includes('hip flexor') || s.includes('lower back')) return 'core';
  return null;
}

export function detectAuditFindings(
  raw: RawDatasetExercise,
  current: ExerciseAuditRecord['current'],
  inferred: ExerciseAuditRecord['inferred']
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const rawEq = (raw.eq || '').toLowerCase();
  const rawTg = (raw.tg || '').trim().toLowerCase();
  const rawMg = (raw.mg || '').trim().toLowerCase();
  const rawBp = (raw.bp || '').toLowerCase();
  const name = (raw.n || '').toLowerCase();

  // 1. Unmapped equipment
  if (!rawEq || current.equipmentCategory === 'other') {
    findings.push({
      flag: 'UNMAPPED_EQUIPMENT',
      severity: 'low',
      description: `Raw equipment "${raw.eq || 'none'}" was not recognized as a primary category and mapped to "other".`
    });
  }

  // 2 & 3. Unmapped target & Fallback to core
  const recognizedTargetTerms = [
    'biceps', 'triceps', 'lats', 'upper back', 'spine', 'pectorals', 'delts',
    'quads', 'hamstrings', 'glutes', 'calves', 'forearms', 'abs'
  ];
  const hasRecognizedTarget = recognizedTargetTerms.some((term) => rawTg.includes(term));
  if (!hasRecognizedTarget && rawBp !== 'waist') {
    findings.push({
      flag: 'UNMAPPED_TARGET',
      severity: 'high',
      description: `Raw target "${raw.tg}" is not directly covered in canonical muscle groups.`
    });
    if (current.primaryMuscle === 'core') {
      findings.push({
        flag: 'TARGET_FALLBACK_TO_CORE',
        severity: 'high',
        description: `Unmapped target "${raw.tg}" silently fell back to "core". Semantic loss.`
      });
    }
  }

  // 4 & 5. Compound metadata: single muscle metadata & no secondaries
  if (inferred.complexity === 'compound') {
    if (current.secondaryMuscles.length === 0) {
      findings.push({
        flag: 'COMPOUND_WITH_NO_SECONDARIES',
        severity: 'medium',
        description: 'Multi-joint compound movement has 0 secondary muscles mapped.'
      });
      findings.push({
        flag: 'COMPOUND_SINGLE_MUSCLE_METADATA',
        severity: 'medium',
        description: 'Multi-joint compound movement has single-muscle metadata.'
      });
    } else if (current.secondaryMuscles.length === 1 && current.secondaryMuscles[0] === 'core' && current.primaryMuscle !== 'core') {
      findings.push({
        flag: 'COMPOUND_SINGLE_MUSCLE_METADATA',
        severity: 'medium',
        description: 'Multi-joint compound movement secondaries collapsed to generic fallback "core".'
      });
    }
  }

  // 6 & 7. Lower body compound single primary attribution
  // NOTE: "ONLY" denotes that the current production model attributes primary volume exclusively
  // to that muscle group in primary-muscle-dependent metrics, NOT that the movement physically recruits only one muscle.
  const lowerBodyCompounds = new Set<MovementFamily>([
    'squat', 'leg_press', 'hack_squat', 'pendulum_squat', 'split_squat', 'lunge', 'step_up'
  ]);
  if (lowerBodyCompounds.has(inferred.movementFamily)) {
    if (current.primaryMuscle === 'glutes') {
      findings.push({
        flag: 'LOWER_BODY_COMPOUND_PRIMARY_GLUTES_ONLY',
        severity: 'low',
        description: "Lower body compound attributed strictly to 'glutes' in primary-muscle dependent metrics."
      });
    }
    if (current.primaryMuscle === 'quadriceps') {
      findings.push({
        flag: 'LOWER_BODY_COMPOUND_PRIMARY_QUADRICEPS_ONLY',
        severity: 'low',
        description: "Lower body compound attributed strictly to 'quadriceps' in primary-muscle dependent metrics."
      });
    }
  }

  // 8. RAW secondary duplicates target
  const rawSmList = (raw.sm || []).map((s) => s.trim().toLowerCase());
  const hasRawSecondaryDuplicatingTarget = rawSmList.some((s) => s === rawTg);
  if (hasRawSecondaryDuplicatingTarget) {
    findings.push({
      flag: 'RAW_SECONDARY_DUPLICATES_TARGET',
      severity: 'medium',
      description: `Raw secondary muscles array explicitly contains raw target "${raw.tg}". Dataset duplication.`
    });
  }

  // 9. Canonical muscle collapse
  // When different raw secondary terms map to the same canonical MuscleGroup as primaryMuscle
  const rawSecondaryMusclesMapped = (raw.sm || []).map((m) => mapDatasetBodypartToMuscle('', m));
  const hasCanonicalCollapse = rawSmList.some((s, idx) => {
    return s !== rawTg && rawSecondaryMusclesMapped[idx] === current.primaryMuscle;
  });
  if (hasCanonicalCollapse) {
    findings.push({
      flag: 'CANONICAL_MUSCLE_COLLAPSE',
      severity: inferred.complexity === 'compound' ? 'high' : 'medium',
      description: 'Distinct raw target and secondary muscles collapsed into the same canonical MuscleGroup.'
    });
  }

  // 10. Audit mg against tg
  if (rawMg && rawMg !== rawTg) {
    findings.push({
      flag: 'RAW_MG_DIFFERS_FROM_TARGET',
      severity: 'info',
      description: `Raw muscle metadata (mg: "${raw.mg}") differs from raw target (tg: "${raw.tg}").`
    });

    // Check if concept in mg is represented in canonical muscles
    const canonicalMg = getCanonicalMuscleForMg(raw.mg);
    const allCanonicalMuscles = [current.primaryMuscle, ...current.secondaryMuscles];
    if (canonicalMg && !allCanonicalMuscles.includes(canonicalMg)) {
      findings.push({
        flag: 'RAW_MG_NOT_REPRESENTED_IN_CANONICAL_MUSCLES',
        severity: 'medium',
        description: `Concept in raw.mg ("${raw.mg}") is absent from canonical primary and secondary muscles.`
      });
    }
  }

  // 11. Plate loaded without base resistance metadata
  if (current.loadMechanism === 'plate_loaded' && current.plateBaseKind !== 'fixed' && current.plateBaseKind !== 'user_bar') {
    findings.push({
      flag: 'PLATE_LOADED_NO_BASE_RESISTANCE_METADATA',
      severity: 'high',
      description: 'Plate-loaded machine lacks explicit tare base resistance metadata.'
    });
  }

  // 12. Possible plate loaded machine resolved as selectorized
  const appearsPlateLoaded = rawEq.includes('sled')
    || rawEq.includes('plate loaded')
    || rawEq.includes('plate-loaded')
    || rawEq.includes('leverage')
    || /\b(?:sled|45°?\s+leg\s+press|hack\s+squat|pendulum|super\s+squat|v-squat|leverage)\b/i.test(name);
  if (appearsPlateLoaded && current.loadMechanism === 'selectorized') {
    findings.push({
      flag: 'POSSIBLE_PLATE_LOADED_MACHINE',
      severity: 'medium',
      description: 'Machine could be plate-loaded but was resolved as selectorized stack.'
    });
  }

  // 13. Inherent machine resistance candidate
  if (inferred.machineResistanceClass === 'inherent_resistance_candidate') {
    findings.push({
      flag: 'POSSIBLE_INHERENT_MACHINE_RESISTANCE',
      severity: 'medium',
      description: 'Machine has movable sled/carriage mass candidate for inherent initial resistance.'
    });
  }

  // 14. Smith without fixed base
  if ((rawEq.includes('smith') || name.includes('smith')) && current.plateBaseKind !== 'fixed') {
    findings.push({
      flag: 'SMITH_WITHOUT_FIXED_BASE',
      severity: 'high',
      description: 'Smith machine resolved without fixed base tare resistance.'
    });
  }

  // 15. Machine category with unknown load mechanism
  if (current.equipmentCategory === 'machine' && current.loadMechanism === 'other') {
    findings.push({
      flag: 'MACHINE_UNKNOWN_LOAD_MECHANISM',
      severity: 'high',
      description: 'Machine category resolved with unknown load mechanism.'
    });
  }

  // 16. Sled resolved non-plate loaded
  if ((rawEq.includes('sled') || name.includes('sled')) && current.loadMechanism !== 'plate_loaded') {
    findings.push({
      flag: 'SLED_RESOLVED_NON_PLATE_LOADED',
      severity: 'high',
      description: 'Sled machine exercise resolved as non-plate-loaded.'
    });
  }

  // 17. Leverage / lever resolved selectorized only
  if ((rawEq.includes('leverage') || name.includes('leverage') || name.includes('lever ')) && current.loadMechanism === 'selectorized') {
    findings.push({
      flag: 'LEVER_RESOLVED_SELECTOR_ONLY',
      severity: 'medium',
      description: 'Leverage machine resolved only as selectorized stack.'
    });
  }

  // 18. Assisted metadata inconsistent
  const isAssistedLoadMovement = current.loadMode === 'assisted'
    || isAssistedBodyweightMovement(name, rawEq);

  if (isAssistedLoadMovement) {
    if (current.loadMode !== 'assisted' || current.loadMechanism !== 'bodyweight' || current.bodyweightFactor === undefined) {
      findings.push({
        flag: 'ASSISTED_METADATA_INCONSISTENT',
        severity: 'high',
        description: 'Assisted exercise metadata is inconsistent with domain model (expected bodyweight mechanism with assisted load mode and explicit factor).'
      });
    }
  }

  // 19. Bodyweight metadata inconsistent
  if (current.equipmentCategory === 'bodyweight') {
    if (current.loadMechanism !== 'bodyweight' || (current.loadMode === 'assisted' && current.bodyweightFactor === undefined)) {
      findings.push({
        flag: 'BODYWEIGHT_METADATA_INCONSISTENT',
        severity: 'high',
        description: 'Bodyweight category exercise has inconsistent mechanism or factor.'
      });
    }
  }

  return findings;
}

export function detectAuditFlags(
  raw: RawDatasetExercise,
  current: ExerciseAuditRecord['current'],
  inferred: ExerciseAuditRecord['inferred']
): string[] {
  const findings = detectAuditFindings(raw, current, inferred);
  return Array.from(new Set(findings.map((f) => f.flag)));
}

export function deriveHighestSeverity(findings: AuditFinding[]): FindingSeverity | undefined {
  if (findings.length === 0) return undefined;
  if (findings.some((f) => f.severity === 'critical')) return 'critical';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  if (findings.some((f) => f.severity === 'low')) return 'low';
  return undefined;
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

  const findings = detectAuditFindings(raw, current, inferred);
  const flags = Array.from(new Set(findings.map((f) => f.flag)));
  const highestSeverity = deriveHighestSeverity(findings);

  const v2 = {
    target: resolveMuscleTerm(raw.tg || ''),
    muscleMetadata: raw.mg ? resolveMuscleTerm(raw.mg) : undefined,
    secondaryMuscles: resolveAllMuscleTerms(raw.sm || [])
  };

  return {
    id: `ex-${raw.id}`,
    name: raw.n ? raw.n.charAt(0).toUpperCase() + raw.n.slice(1) : 'Ejercicio',
    raw: {
      bodyPart: raw.bp || '',
      target: raw.tg || '',
      muscleMetadata: raw.mg || '',
      secondaryMuscles: raw.sm || [],
      equipment: raw.eq || ''
    },
    current,
    inferred,
    v2,
    flags,
    findings,
    highestSeverity
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
    byMachineResistanceClass: {
      none_expected: 0,
      inherent_resistance_candidate: 0,
      known_current: 0,
      unknown: 0
    },
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    byFlag: {},
    flaggedExerciseIds: {},
    machineResistanceCandidates: [],
    plateLoadedCandidates: [],
    bodyweightAssistedCandidates: [],
    v2Taxonomy: {
      targetsByResolutionKind: { anatomical: 0, functional: 0, regional: 0, unknown: 0 },
      allTermsByResolutionKind: { anatomical: 0, functional: 0, regional: 0, unknown: 0 },
      byResolutionKind: { anatomical: 0, functional: 0, regional: 0, unknown: 0 },
      byEntity: {},
      byRegion: {},
      byFunctionalGroup: {},
      unknownRawTerms: []
    }
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

    // Machine resistance class
    summary.byMachineResistanceClass[record.inferred.machineResistanceClass] =
      (summary.byMachineResistanceClass[record.inferred.machineResistanceClass] || 0) + 1;

    // Severity breakdown (by finding severity)
    for (const finding of record.findings) {
      summary.bySeverity[finding.severity] =
        (summary.bySeverity[finding.severity] || 0) + 1;
    }

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

    // v2 Taxonomy aggregation
    const targetV2 = record.v2.target;
    summary.v2Taxonomy.targetsByResolutionKind[targetV2.kind] =
      (summary.v2Taxonomy.targetsByResolutionKind[targetV2.kind] || 0) + 1;

    const allV2Terms = [
      record.v2.target,
      ...(record.v2.muscleMetadata ? [record.v2.muscleMetadata] : []),
      ...record.v2.secondaryMuscles
    ];

    for (const term of allV2Terms) {
      summary.v2Taxonomy.byResolutionKind[term.kind] =
        (summary.v2Taxonomy.byResolutionKind[term.kind] || 0) + 1;
      summary.v2Taxonomy.allTermsByResolutionKind[term.kind] =
        (summary.v2Taxonomy.allTermsByResolutionKind[term.kind] || 0) + 1;

      if (term.entity) {
        summary.v2Taxonomy.byEntity[term.entity] =
          (summary.v2Taxonomy.byEntity[term.entity] || 0) + 1;
      }
      if (term.region) {
        summary.v2Taxonomy.byRegion[term.region] =
          (summary.v2Taxonomy.byRegion[term.region] || 0) + 1;
      }
      if (term.functionalGroup) {
        summary.v2Taxonomy.byFunctionalGroup[term.functionalGroup] =
          (summary.v2Taxonomy.byFunctionalGroup[term.functionalGroup] || 0) + 1;
      }
      if (term.kind === 'unknown' && !summary.v2Taxonomy.unknownRawTerms.includes(term.raw)) {
        summary.v2Taxonomy.unknownRawTerms.push(term.raw);
      }
    }
  }

  return { records, summary };
}
