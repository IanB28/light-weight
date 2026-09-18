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

test('2 & 10. Audit record count matches EXDB.length exactly (1324)', () => {
  assert.equal(EXDB.length, 1324);
  const { records, summary } = auditExerciseCatalog(EXDB);
  assert.equal(records.length, 1324);
  assert.equal(summary.totalExercises, 1324);
});

test('3. Exercise IDs in audit are strictly unique', () => {
  const { records } = auditExerciseCatalog(EXDB);
  const ids = records.map((r) => r.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, records.length);
});

test('4. Auditor is strictly deterministic', () => {
  const run1 = auditExerciseCatalog(EXDB);
  const run2 = auditExerciseCatalog(EXDB);
  assert.deepEqual(run1.records, run2.records);
  assert.deepEqual(run1.summary, run2.summary);
});

test('5. ex-0739 (Sled 45° leg press) -> family leg_press and inherent_resistance_candidate', () => {
  const raw = EXDB.find((e) => String(e.id) === '0739');
  assert.ok(raw, 'ex-0739 must exist in EXDB');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0739');
  assert.equal(record.inferred.movementFamily, 'leg_press');
  assert.equal(record.current.loadMechanism, 'plate_loaded');
  assert.equal(record.inferred.machineResistanceClass, 'inherent_resistance_candidate');
  assert.ok(record.flags.includes('POSSIBLE_INHERENT_MACHINE_RESISTANCE'));
});

test('6. ex-0743 (Sled hack squat) -> family hack_squat and inherent_resistance_candidate', () => {
  const raw = EXDB.find((e) => String(e.id) === '0743');
  assert.ok(raw, 'ex-0743 must exist in EXDB');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0743');
  assert.equal(record.inferred.movementFamily, 'hack_squat');
  assert.equal(record.current.loadMechanism, 'plate_loaded');
  assert.equal(record.inferred.machineResistanceClass, 'inherent_resistance_candidate');
});

test('7. ex-0748 (Smith bench press) -> known_current for base resistance', () => {
  const raw = EXDB.find((e) => String(e.id) === '0748');
  assert.ok(raw, 'ex-0748 must exist in EXDB');
  const record = auditExercise(raw);
  assert.equal(record.id, 'ex-0748');
  assert.equal(record.current.plateBaseKind, 'fixed');
  assert.equal(record.inferred.machineResistanceClass, 'known_current');
});

test('8. No machine resistance candidate receives invented kilos from auditor', () => {
  const { records } = auditExerciseCatalog(EXDB);
  const candidates = records.filter(
    (r) => r.inferred.machineResistanceClass === 'inherent_resistance_candidate'
  );
  assert.ok(candidates.length > 0, 'There should be inherent resistance candidates');
  for (const candidate of candidates) {
    // Audit record must not invent a weightKg
    assert.equal((candidate.inferred as Record<string, unknown>).weightKg, undefined);
    assert.equal((candidate.inferred as Record<string, unknown>).tareKg, undefined);
  }
});

test('9. Auditor does not mutate input or runtime data', () => {
  const sample = JSON.parse(JSON.stringify(EXDB[0]));
  auditExercise(sample);
  assert.deepEqual(sample, EXDB[0]);
});

test('11. mapDatasetExerciseToDomain preserves bodyweightFactor for assisted and weighted bodyweight', () => {
  const assistedPullUp = EXDB.find((e) => String(e.id) === '0017');
  assert.ok(assistedPullUp, 'ex-0017 must exist');
  const domainAssisted = mapDatasetExerciseToDomain(assistedPullUp);
  assert.equal(domainAssisted.loading?.loadMode, 'assisted');
  assert.equal(domainAssisted.loading?.bodyweightFactor, 1);

  const weightedPullUp = EXDB.find((e) => String(e.id) === '0841');
  assert.ok(weightedPullUp, 'ex-0841 must exist');
  const domainWeighted = mapDatasetExerciseToDomain(weightedPullUp);
  assert.equal(domainWeighted.loading?.loadMode, 'added_weight');
  assert.equal(domainWeighted.loading?.bodyweightFactor, 1);
});
