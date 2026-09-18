import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mapDatasetBodypartToMuscle,
  mapDatasetEquipmentToCategory,
  mapDatasetSecondaryMuscles,
  mapDatasetExerciseToDomain,
  type RawDatasetExercise
} from './exerciseCatalogMapping.js';
import {
  auditExercise,
  auditExerciseCatalog,
  detectAuditFindings,
  inferMovementFamily,
  inferComplexity,
  inferMachineResistanceClass
} from './exerciseAudit.js';

const require = createRequire(import.meta.url);
const { EXDB } = require('../../../apps/web/src/lib/exercises-data.js') as { EXDB: RawDatasetExercise[] };

test('1. Web/API dataset mapper parity: pure functions preserve historical mappings exactly', () => {
  // Bodypart & target to muscle
  assert.equal(mapDatasetBodypartToMuscle('waist', 'abs'), 'core');
  assert.equal(mapDatasetBodypartToMuscle('upper arms', 'biceps'), 'biceps');
  assert.equal(mapDatasetBodypartToMuscle('upper arms', 'triceps'), 'triceps');
  assert.equal(mapDatasetBodypartToMuscle('back', 'lats'), 'back');
  assert.equal(mapDatasetBodypartToMuscle('chest', 'pectorals'), 'chest');
  assert.equal(mapDatasetBodypartToMuscle('shoulders', 'delts'), 'shoulders');
  assert.equal(mapDatasetBodypartToMuscle('upper legs', 'quads'), 'quadriceps');
  assert.equal(mapDatasetBodypartToMuscle('upper legs', 'hamstrings'), 'hamstrings');
  assert.equal(mapDatasetBodypartToMuscle('upper legs', 'glutes'), 'glutes');
  assert.equal(mapDatasetBodypartToMuscle('lower legs', 'calves'), 'calves');
  assert.equal(mapDatasetBodypartToMuscle('lower arms', 'forearms'), 'forearms');
  assert.equal(mapDatasetBodypartToMuscle('unknown', 'unknown'), 'core');

  // Equipment to category
  assert.equal(mapDatasetEquipmentToCategory('barbell'), 'barbell');
  assert.equal(mapDatasetEquipmentToCategory('olympic barbell'), 'barbell');
  assert.equal(mapDatasetEquipmentToCategory('dumbbell'), 'dumbbell');
  assert.equal(mapDatasetEquipmentToCategory('cable'), 'cable');
  assert.equal(mapDatasetEquipmentToCategory('body weight'), 'bodyweight');
  assert.equal(mapDatasetEquipmentToCategory('assisted'), 'bodyweight');
  assert.equal(mapDatasetEquipmentToCategory('leverage machine'), 'machine');
  assert.equal(mapDatasetEquipmentToCategory('smith machine'), 'machine');
  assert.equal(mapDatasetEquipmentToCategory('band'), 'other');

  // Secondary muscles mapping
  const secondary = mapDatasetSecondaryMuscles(['triceps', 'delts'], 'chest');
  assert.deepEqual(secondary, ['triceps', 'shoulders']);

  // Filters out duplicate of primary
  const secondaryWithPrimary = mapDatasetSecondaryMuscles(['pectorals', 'triceps'], 'chest');
  assert.deepEqual(secondaryWithPrimary, ['triceps']);
});

test('2. Audit record count matches EXDB.length exactly (1324) and all IDs unique', () => {
  assert.equal(EXDB.length, 1324);
  const { records, summary } = auditExerciseCatalog(EXDB);
  assert.equal(records.length, 1324);
  assert.equal(summary.totalExercises, 1324);

  const ids = records.map((r) => r.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, records.length);
});

test('3. Auditor is strictly deterministic', () => {
  const run1 = auditExerciseCatalog(EXDB);
  const run2 = auditExerciseCatalog(EXDB);
  assert.deepEqual(run1.records, run2.records);
  assert.deepEqual(run1.summary, run2.summary);
});

test('4. Regression: Barbell hack squat (ex-0046) is NOT an inherent machine resistance candidate', () => {
  const raw = EXDB.find((e) => String(e.id) === '0046');
  assert.ok(raw, 'ex-0046 must exist in EXDB');
  assert.equal(raw.eq, 'barbell');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0046');
  assert.equal(record.current.loadMechanism, 'barbell');
  assert.equal(record.inferred.machineResistanceClass, 'none_expected');
  assert.equal(record.flags.includes('POSSIBLE_INHERENT_MACHINE_RESISTANCE'), false);
});

test('5. Sled hack squat (ex-0743) IS an inherent resistance candidate', () => {
  const raw = EXDB.find((e) => String(e.id) === '0743');
  assert.ok(raw, 'ex-0743 must exist in EXDB');
  assert.equal(raw.eq, 'sled machine');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0743');
  assert.equal(record.inferred.movementFamily, 'hack_squat');
  assert.equal(record.current.loadMechanism, 'plate_loaded');
  assert.equal(record.inferred.machineResistanceClass, 'inherent_resistance_candidate');
  assert.ok(record.flags.includes('POSSIBLE_INHERENT_MACHINE_RESISTANCE'));
});

test('6. Sled 45° leg press (ex-0739) IS an inherent resistance candidate', () => {
  const raw = EXDB.find((e) => String(e.id) === '0739');
  assert.ok(raw, 'ex-0739 must exist in EXDB');
  assert.equal(raw.eq, 'sled machine');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0739');
  assert.equal(record.inferred.movementFamily, 'leg_press');
  assert.equal(record.current.loadMechanism, 'plate_loaded');
  assert.equal(record.inferred.machineResistanceClass, 'inherent_resistance_candidate');
  assert.ok(record.flags.includes('POSSIBLE_INHERENT_MACHINE_RESISTANCE'));
});

test('7. Smith exercise (ex-0748) with resolved plateBase.kind=fixed -> known_current', () => {
  const raw = EXDB.find((e) => String(e.id) === '0748');
  assert.ok(raw, 'ex-0748 must exist in EXDB');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0748');
  assert.equal(record.current.plateBaseKind, 'fixed');
  assert.equal(record.inferred.machineResistanceClass, 'known_current');
});

test('8. known_current derives strictly from resolved loading profile plateBase.kind=fixed', () => {
  // Mock profile with plateBase kind 'fixed'
  const mockFixedProfile = {
    mechanism: 'plate_loaded' as const,
    loadMode: 'total' as const,
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: false,
    plateBase: { kind: 'fixed' as const, weightKg: 9.07 }
  };
  assert.equal(
    inferMachineResistanceClass({ id: 'mock', eq: 'machine', n: 'Custom Machine' }, mockFixedProfile),
    'known_current'
  );

  // Mock profile with user_bar (barbell) is NOT known_current machine
  const mockBarbellProfile = {
    mechanism: 'barbell' as const,
    loadMode: 'total' as const,
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true,
    plateBase: { kind: 'user_bar' as const }
  };
  assert.equal(
    inferMachineResistanceClass({ id: 'mock', eq: 'barbell', n: 'Smith Style Bar' }, mockBarbellProfile),
    'none_expected'
  );

  // Mock profile with none plateBase is NOT known_current
  const mockNoneProfile = {
    mechanism: 'selectorized' as const,
    loadMode: 'total' as const,
    supportsKeyboard: true,
    supportsPlates: false,
    supportsExternalLoad: true,
    includeBarWeight: false,
    plateBase: { kind: 'none' as const }
  };
  assert.equal(
    inferMachineResistanceClass({ id: 'mock', eq: 'smith machine', n: 'Broken Smith' }, mockNoneProfile),
    'none_expected'
  );
});

test('9. Sled calf press on leg press (ex-1391) -> movementFamily = calf_raise, not leg_press', () => {
  const raw = EXDB.find((e) => String(e.id) === '1391');
  assert.ok(raw, 'ex-1391 must exist in EXDB');
  assert.equal(inferMovementFamily(raw.n, raw.tg), 'calf_raise');
  const record = auditExercise(raw);
  assert.equal(record.inferred.movementFamily, 'calf_raise');
  // But retains machine platform context
  assert.equal(record.raw.equipment, 'sled machine');
  assert.equal(record.inferred.machineResistanceClass, 'inherent_resistance_candidate');
});

test('10. Raw mg (muscleMetadata) is preserved in audit record', () => {
  const raw0852 = EXDB.find((e) => String(e.id) === '0852');
  assert.ok(raw0852, 'ex-0852 must exist');
  assert.equal(raw0852.mg, 'quadriceps');
  const record = auditExercise(raw0852);
  assert.equal(record.raw.muscleMetadata, 'quadriceps');
  assert.ok(record.flags.includes('RAW_MG_DIFFERS_FROM_TARGET'));
  assert.ok(record.flags.includes('RAW_MG_NOT_REPRESENTED_IN_CANONICAL_MUSCLES'));
});

test('11. RAW_SECONDARY_DUPLICATES_TARGET vs CANONICAL_MUSCLE_COLLAPSE are distinguishable', () => {
  // Case A: Raw dataset duplicate (raw.tg === raw.sm)
  const rawWithRawDup: RawDatasetExercise = {
    id: 'test-raw-dup',
    n: 'Test Exercise',
    bp: 'waist',
    tg: 'abs',
    eq: 'body weight',
    sm: ['abs']
  };
  const recordA = auditExercise(rawWithRawDup);
  assert.ok(recordA.flags.includes('RAW_SECONDARY_DUPLICATES_TARGET'), 'Must flag RAW_SECONDARY_DUPLICATES_TARGET');
  assert.equal(recordA.flags.includes('CANONICAL_MUSCLE_COLLAPSE'), false, 'Must NOT flag CANONICAL_MUSCLE_COLLAPSE when raw strings are identical');

  // Case B: Canonical collapse (lats + upper back -> both map to back)
  const rawWithCollapse: RawDatasetExercise = {
    id: 'test-collapse',
    n: 'Test Pulldown',
    bp: 'back',
    tg: 'lats',
    eq: 'cable',
    sm: ['upper back']
  };
  const recordB = auditExercise(rawWithCollapse);
  assert.ok(recordB.flags.includes('CANONICAL_MUSCLE_COLLAPSE'), 'Must flag CANONICAL_MUSCLE_COLLAPSE');
  assert.equal(recordB.flags.includes('RAW_SECONDARY_DUPLICATES_TARGET'), false, 'Must NOT flag RAW_SECONDARY_DUPLICATES_TARGET when raw strings differ');
});

test('12. Unknown target falling to core triggers TARGET_FALLBACK_TO_CORE with high severity', () => {
  const rawWithUnknownTarget: RawDatasetExercise = {
    id: 'test-fallback',
    n: 'Neck Stretch',
    bp: 'neck',
    tg: 'levator scapulae',
    eq: 'body weight',
    sm: []
  };
  const record = auditExercise(rawWithUnknownTarget);
  assert.equal(record.current.primaryMuscle, 'core');
  assert.ok(record.flags.includes('UNMAPPED_TARGET'));
  assert.ok(record.flags.includes('TARGET_FALLBACK_TO_CORE'));
  assert.equal(record.highestSeverity, 'high');
  const targetFinding = record.findings.find((f) => f.flag === 'TARGET_FALLBACK_TO_CORE');
  assert.ok(targetFinding);
  assert.equal(targetFinding.severity, 'high');
});

test('13. Exact bodyweightFactor resolution: weighted, assisted, full, and general bodyweight', () => {
  // A. Weighted pull-up (ex-0841)
  const ex0841 = EXDB.find((e) => String(e.id) === '0841');
  assert.ok(ex0841);
  const domain0841 = mapDatasetExerciseToDomain(ex0841);
  assert.equal(domain0841.loading?.mechanism, 'bodyweight');
  assert.equal(domain0841.loading?.loadMode, 'added_weight');
  assert.equal(domain0841.loading?.bodyweightFactor, 1);

  // B. Assisted pull-up (ex-0017)
  const ex0017 = EXDB.find((e) => String(e.id) === '0017');
  assert.ok(ex0017);
  const domain0017 = mapDatasetExerciseToDomain(ex0017);
  assert.equal(domain0017.loading?.mechanism, 'bodyweight');
  assert.equal(domain0017.loading?.loadMode, 'assisted');
  assert.equal(domain0017.loading?.bodyweightFactor, 1);

  // C. Standard pull-up (ex-0652)
  const ex0652 = EXDB.find((e) => String(e.id) === '0652');
  assert.ok(ex0652);
  const domain0652 = mapDatasetExerciseToDomain(ex0652);
  assert.equal(domain0652.loading?.mechanism, 'bodyweight');
  assert.equal(domain0652.loading?.loadMode, 'added_weight');
  assert.equal(domain0652.loading?.bodyweightFactor, 1);

  // D. General bodyweight exercise without validated factor (ex-0662 push-up)
  const ex0662 = EXDB.find((e) => String(e.id) === '0662');
  assert.ok(ex0662);
  const domain0662 = mapDatasetExerciseToDomain(ex0662);
  assert.equal(domain0662.loading?.mechanism, 'bodyweight');
  assert.equal(domain0662.loading?.loadMode, 'added_weight');
  assert.equal(domain0662.loading?.bodyweightFactor, undefined);
});

test('14. No machine resistance candidate receives invented kilos from auditor', () => {
  const { records } = auditExerciseCatalog(EXDB);
  const candidates = records.filter(
    (r) => r.inferred.machineResistanceClass === 'inherent_resistance_candidate'
  );
  assert.equal(candidates.length, 15, 'Exactly 15 machine resistance candidates expected');
  for (const candidate of candidates) {
    assert.equal((candidate.inferred as Record<string, unknown>).weightKg, undefined);
    assert.equal((candidate.inferred as Record<string, unknown>).tareKg, undefined);
  }
});

test('15. (Req A) Exercise with raw mg != tg has RAW_MG_DIFFERS_FROM_TARGET as info and highestSeverity undefined', () => {
  const cleanExerciseWithDifferentMg: RawDatasetExercise = {
    id: 'test-info-mg',
    n: 'Barbell Biceps Curl',
    bp: 'upper arms',
    tg: 'biceps',
    mg: 'biceps brachii',
    eq: 'barbell',
    sm: []
  };
  const record = auditExercise(cleanExerciseWithDifferentMg);
  assert.ok(record.flags.includes('RAW_MG_DIFFERS_FROM_TARGET'), 'Must include RAW_MG_DIFFERS_FROM_TARGET');
  const mgFinding = record.findings.find((f) => f.flag === 'RAW_MG_DIFFERS_FROM_TARGET');
  assert.ok(mgFinding);
  assert.equal(mgFinding.severity, 'info', 'RAW_MG_DIFFERS_FROM_TARGET must have severity = info');
  assert.equal(record.highestSeverity, undefined, 'highestSeverity must be undefined when only info findings exist');
});

test('16. (Req B & C) Correctly resolved assisted pull-up, triceps dip, and chest dip do NOT receive ASSISTED_METADATA_INCONSISTENT', () => {
  // Assisted pull-up (ex-0017)
  const ex0017 = EXDB.find((e) => String(e.id) === '0017');
  assert.ok(ex0017);
  const record0017 = auditExercise(ex0017);
  assert.equal(record0017.current.loadMechanism, 'bodyweight');
  assert.equal(record0017.current.loadMode, 'assisted');
  assert.equal(record0017.current.bodyweightFactor, 1);
  assert.equal(record0017.flags.includes('ASSISTED_METADATA_INCONSISTENT'), false, 'ex-0017 must not be flagged');

  // Assisted triceps dip (kneeling) (ex-0019)
  const ex0019 = EXDB.find((e) => String(e.id) === '0019');
  assert.ok(ex0019);
  const record0019 = auditExercise(ex0019);
  assert.equal(record0019.current.loadMechanism, 'bodyweight');
  assert.equal(record0019.current.loadMode, 'assisted');
  assert.equal(record0019.current.bodyweightFactor, 1);
  assert.equal(record0019.flags.includes('ASSISTED_METADATA_INCONSISTENT'), false, 'ex-0019 must not be flagged');

  // Assisted chest dip (kneeling) (ex-0009)
  const ex0009 = EXDB.find((e) => String(e.id) === '0009');
  assert.ok(ex0009);
  const record0009 = auditExercise(ex0009);
  assert.equal(record0009.current.loadMechanism, 'bodyweight');
  assert.equal(record0009.current.loadMode, 'assisted');
  assert.equal(record0009.current.bodyweightFactor, 1);
  assert.equal(record0009.flags.includes('ASSISTED_METADATA_INCONSISTENT'), false, 'ex-0009 must not be flagged');
});

test('17. (Req D & E) Assisted stretches do NOT receive ASSISTED_METADATA_INCONSISTENT', () => {
  // Assisted lying calves stretch (ex-1708)
  const ex1708 = EXDB.find((e) => String(e.id) === '1708');
  assert.ok(ex1708);
  const record1708 = auditExercise(ex1708);
  assert.equal(record1708.flags.includes('ASSISTED_METADATA_INCONSISTENT'), false, 'ex-1708 must not be flagged');

  // Assisted lying glutes stretch (ex-1709)
  const ex1709 = EXDB.find((e) => String(e.id) === '1709');
  assert.ok(ex1709);
  const record1709 = auditExercise(ex1709);
  assert.equal(record1709.flags.includes('ASSISTED_METADATA_INCONSISTENT'), false, 'ex-1709 must not be flagged');
});

test('18. (Req F) Synthetic counterweighted movement with corrupted profile triggers ASSISTED_METADATA_INCONSISTENT', () => {
  const syntheticRaw: RawDatasetExercise = {
    id: 'synth-assisted',
    n: 'Assisted Chin-Up',
    bp: 'back',
    tg: 'lats',
    eq: 'leverage machine',
    sm: ['biceps']
  };
  const corruptedCurrent = {
    equipmentCategory: 'machine' as const,
    primaryMuscle: 'back' as const,
    secondaryMuscles: ['biceps' as const],
    loadMechanism: 'selectorized' as const, // Corrupted: should be bodyweight with assisted mode
    loadMode: 'total' as const,
    bodyweightFactor: undefined
  };
  const inferred = {
    movementFamily: 'chin_up' as const,
    complexity: 'compound' as const,
    machineResistanceClass: 'none_expected' as const
  };
  const findings = detectAuditFindings(syntheticRaw, corruptedCurrent, inferred);
  const assistedFinding = findings.find((f: { flag: string }) => f.flag === 'ASSISTED_METADATA_INCONSISTENT');
  assert.ok(assistedFinding, 'Must trigger ASSISTED_METADATA_INCONSISTENT for corrupted assisted movement');
  assert.equal(assistedFinding.severity, 'high');
});

test('19. Catalog audit summary invariants: 0 assisted inconsistencies, 15 inherent, 48 smith, info count = 1322', () => {
  const { summary } = auditExerciseCatalog(EXDB);
  assert.equal(summary.bySeverity.critical, 0);
  assert.equal(summary.bySeverity.info, 1322);
  assert.equal(summary.byFlag['ASSISTED_METADATA_INCONSISTENT'] || 0, 0, 'Catalog must have 0 ASSISTED_METADATA_INCONSISTENT');
  assert.equal(summary.machineResistanceCandidates.length, 15);
  assert.equal(summary.byMachineResistanceClass.known_current, 48);
  assert.equal(summary.byFlag['CANONICAL_MUSCLE_COLLAPSE'], 197);
  assert.equal(summary.byFlag['RAW_MG_NOT_REPRESENTED_IN_CANONICAL_MUSCLES'], 451);

  // Barbell hack squat must NOT be inherent resistance candidate
  const hackSquat = auditExercise(EXDB.find((e) => String(e.id) === '0046')!);
  assert.equal(hackSquat.inferred.machineResistanceClass, 'none_expected');
});
