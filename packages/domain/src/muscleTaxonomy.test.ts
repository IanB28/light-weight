import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  resolveMuscleTerm,
  resolveAllMuscleTerms,
  MUSCLE_ENTITY_METADATA,
  type MuscleTermResolution,
  type RawDatasetExercise
} from './index.js';

const require = createRequire(import.meta.url);
const { EXDB } = require('../../../apps/web/src/lib/exercises-data.js') as { EXDB: RawDatasetExercise[] };

test('1. Anatomical aliases for quadriceps and quads resolve to entity quadriceps and region upper_legs', () => {
  const t1 = resolveMuscleTerm('quadriceps');
  assert.equal(t1.kind, 'anatomical');
  assert.equal(t1.entity, 'quadriceps');
  assert.equal(t1.region, 'upper_legs');
  assert.equal(t1.legacyGroup, 'quadriceps');
  assert.equal(t1.confidence, 'high');

  const t2 = resolveMuscleTerm('quads');
  assert.equal(t2.kind, 'anatomical');
  assert.equal(t2.entity, 'quadriceps');
  assert.equal(t2.region, 'upper_legs');
  assert.equal(t2.legacyGroup, 'quadriceps');

  const t3 = resolveMuscleTerm('quad');
  assert.equal(t3.kind, 'anatomical');
  assert.equal(t3.entity, 'quadriceps');
});

test('2. Chest (regional) and pectorals / pectoralis major (anatomical) resolve correctly without semantic loss', () => {
  const chest = resolveMuscleTerm('chest');
  assert.equal(chest.kind, 'regional');
  assert.equal(chest.region, 'chest');
  assert.equal(chest.legacyGroup, 'chest');

  const pecs = resolveMuscleTerm('pectorals');
  assert.equal(pecs.kind, 'anatomical');
  assert.equal(pecs.entity, 'pectoralis_major');
  assert.equal(pecs.region, 'chest');
  assert.equal(pecs.legacyGroup, 'chest');

  const pecMajor = resolveMuscleTerm('pectoralis major');
  assert.equal(pecMajor.kind, 'anatomical');
  assert.equal(pecMajor.entity, 'pectoralis_major');
  assert.equal(pecMajor.region, 'chest');

  const upperChest = resolveMuscleTerm('upper chest');
  assert.equal(upperChest.kind, 'anatomical');
  assert.equal(upperChest.entity, 'pectoralis_major');
  assert.equal(upperChest.region, 'chest');
});

test('3. Shoulders and delts resolve to region shoulders without forcing an arbitrary head entity', () => {
  const shoulders = resolveMuscleTerm('shoulders');
  assert.equal(shoulders.kind, 'regional');
  assert.equal(shoulders.region, 'shoulders');
  assert.equal(shoulders.legacyGroup, 'shoulders');

  const delts = resolveMuscleTerm('delts');
  assert.equal(delts.kind, 'regional');
  assert.equal(delts.region, 'shoulders');
  assert.equal(delts.legacyGroup, 'shoulders');

  const deltoids = resolveMuscleTerm('deltoids');
  assert.equal(deltoids.kind, 'regional');
  assert.equal(deltoids.region, 'shoulders');

  // Exact heads DO resolve to their specific entities
  const frontDelts = resolveMuscleTerm('front delts');
  assert.equal(frontDelts.kind, 'anatomical');
  assert.equal(frontDelts.entity, 'anterior_deltoid');
  assert.equal(frontDelts.region, 'shoulders');

  const sideDelts = resolveMuscleTerm('side delts');
  assert.equal(sideDelts.kind, 'anatomical');
  assert.equal(sideDelts.entity, 'lateral_deltoid');
  assert.equal(sideDelts.region, 'shoulders');

  const rearDelts = resolveMuscleTerm('rear delts');
  assert.equal(rearDelts.kind, 'anatomical');
  assert.equal(rearDelts.entity, 'posterior_deltoid');
  assert.equal(rearDelts.region, 'shoulders');
});

test('4. Traps resolve to entity trapezius with region back', () => {
  const traps = resolveMuscleTerm('traps');
  assert.equal(traps.kind, 'anatomical');
  assert.equal(traps.entity, 'trapezius');
  assert.equal(traps.region, 'back');
  assert.equal(traps.legacyGroup, 'back');

  const trapezius = resolveMuscleTerm('trapezius');
  assert.equal(trapezius.kind, 'anatomical');
  assert.equal(trapezius.entity, 'trapezius');
  assert.equal(trapezius.region, 'back');
});

test('5. Rhomboids are preserved as anatomical entity with region back', () => {
  const rhomboids = resolveMuscleTerm('rhomboids');
  assert.equal(rhomboids.kind, 'anatomical');
  assert.equal(rhomboids.entity, 'rhomboids');
  assert.equal(rhomboids.region, 'back');
  assert.equal(rhomboids.legacyGroup, 'back');
});

test('6. Adductors are preserved and NEVER resolved to quadriceps or core', () => {
  const adductors = resolveMuscleTerm('adductors');
  assert.equal(adductors.kind, 'anatomical');
  assert.equal(adductors.entity, 'adductors');
  assert.equal(adductors.region, 'upper_legs');
  assert.notEqual(adductors.entity, 'quadriceps');
  assert.equal(adductors.legacyGroup, undefined, 'Legacy cannot represent adductors; must be undefined, not core or quads');
});

test('7. Serratus anterior is preserved and NEVER resolved to core', () => {
  const serratus = resolveMuscleTerm('serratus anterior');
  assert.equal(serratus.kind, 'anatomical');
  assert.equal(serratus.entity, 'serratus_anterior');
  assert.equal(serratus.region, 'chest');
  assert.equal(serratus.legacyGroup, undefined, 'Legacy cannot represent serratus anterior; must be undefined, NEVER core');
});

test('8. Hip flexors are resolved as functional group and NEVER to core or iliopsoas', () => {
  const hipFlexors = resolveMuscleTerm('hip flexors');
  assert.equal(hipFlexors.kind, 'functional');
  assert.equal(hipFlexors.functionalGroup, 'hip_flexors');
  assert.equal(hipFlexors.entity, undefined, 'Must not assume iliopsoas or specific muscle entity');
  assert.equal(hipFlexors.region, undefined, 'Must NOT invent region for purely functional group');
  assert.equal(hipFlexors.legacyGroup, undefined, 'Must NEVER fall back to core');
});

test('9. Abductors are resolved as functional hip_abductors without assuming gluteus_medius', () => {
  const abductors = resolveMuscleTerm('abductors');
  assert.equal(abductors.kind, 'functional');
  assert.equal(abductors.functionalGroup, 'hip_abductors');
  assert.equal(abductors.entity, undefined, 'Must NOT assume gluteus_medius');
  assert.equal(abductors.region, undefined, 'Must NOT invent region for purely functional group');
  assert.equal(abductors.legacyGroup, undefined);
});

test('10. Rotator cuff is resolved as functional group without inventing a single member or entity', () => {
  const rc = resolveMuscleTerm('rotator cuff');
  assert.equal(rc.kind, 'functional');
  assert.equal(rc.functionalGroup, 'rotator_cuff');
  assert.equal(rc.entity, undefined, 'Must not invent supraspinatus/infraspinatus/subscapularis/teres minor');
  assert.equal(rc.region, undefined, 'Must NOT invent region for purely functional group');
  assert.equal(rc.legacyGroup, undefined);
});

test('11. Brachialis and brachioradialis entities are preserved with accurate regions', () => {
  const brachialis = resolveMuscleTerm('brachialis');
  assert.equal(brachialis.kind, 'anatomical');
  assert.equal(brachialis.entity, 'brachialis');
  assert.equal(brachialis.region, 'arms');
  assert.equal(brachialis.legacyGroup, 'biceps');

  const brachioradialis = resolveMuscleTerm('brachioradialis');
  assert.equal(brachioradialis.kind, 'anatomical');
  assert.equal(brachioradialis.entity, 'brachioradialis');
  assert.equal(brachioradialis.region, 'forearms');
  assert.equal(brachioradialis.legacyGroup, 'forearms');
});

test('12. Obliques entity is preserved with legacy core bridge', () => {
  const obliques = resolveMuscleTerm('obliques');
  assert.equal(obliques.kind, 'anatomical');
  assert.equal(obliques.entity, 'obliques');
  assert.equal(obliques.region, 'core');
  assert.equal(obliques.legacyGroup, 'core');
});

test('13. Lower back is regional and does NOT assume exact erector spinae', () => {
  const lowerBack = resolveMuscleTerm('lower back');
  assert.equal(lowerBack.kind, 'regional');
  assert.equal(lowerBack.region, 'lower_back');
  assert.equal(lowerBack.entity, undefined, 'Must not assume erector_spinae');
  assert.equal(lowerBack.legacyGroup, 'back');
});

test('14. Upper back and back are regional and do NOT assume traps/rhomboids/lats', () => {
  const upperBack = resolveMuscleTerm('upper back');
  assert.equal(upperBack.kind, 'regional');
  assert.equal(upperBack.region, 'back');
  assert.equal(upperBack.entity, undefined, 'Must not assume traps or rhomboids');
  assert.equal(upperBack.legacyGroup, 'back');

  const back = resolveMuscleTerm('back');
  assert.equal(back.kind, 'regional');
  assert.equal(back.region, 'back');
  assert.equal(back.entity, undefined, 'Must not assume lats');
});

test('15. Glutes is a broad regional aggregate and does NOT assume gluteus maximus', () => {
  const glutes = resolveMuscleTerm('glutes');
  assert.equal(glutes.kind, 'regional');
  assert.equal(glutes.region, 'glutes');
  assert.equal(glutes.entity, undefined, 'Must not assume gluteus_maximus');

  // Exact glute heads DO resolve to entities
  const gMax = resolveMuscleTerm('gluteus maximus');
  assert.equal(gMax.kind, 'anatomical');
  assert.equal(gMax.entity, 'gluteus_maximus');

  const gMed = resolveMuscleTerm('gluteus medius');
  assert.equal(gMed.kind, 'anatomical');
  assert.equal(gMed.entity, 'gluteus_medius');
});

test('16. Completely unknown strings and non-skeletal targets resolve to unknown and NEVER fall back to core', () => {
  const rand = resolveMuscleTerm('completely unexpected-arbitrary-string-123');
  assert.equal(rand.kind, 'unknown');
  assert.equal(rand.raw, 'completely unexpected-arbitrary-string-123');
  assert.equal(rand.entity, undefined);
  assert.equal(rand.region, undefined);
  assert.equal(rand.legacyGroup, undefined, 'Must NEVER fall back to core');
  assert.equal(rand.confidence, 'low');

  const empty = resolveMuscleTerm('');
  assert.equal(empty.kind, 'unknown');

  const cardio = resolveMuscleTerm('cardiovascular system');
  assert.equal(cardio.kind, 'unknown');
  assert.equal(cardio.raw, 'cardiovascular system');
  assert.equal(cardio.legacyGroup, undefined, 'Cardiovascular system must NEVER fall back to core');
});

test('17. Every one of the 50 distinct EXDB raw muscle terms resolves deterministically without unhandled errors', () => {
  const rawTerms = new Set<string>();
  for (const e of EXDB) {
    if (e.tg) rawTerms.add(e.tg);
    if (e.mg) rawTerms.add(e.mg);
    if (e.sm) {
      for (const s of e.sm) rawTerms.add(s);
    }
  }

  assert.equal(rawTerms.size, 50, 'EXDB has exactly 50 distinct raw muscle terms');

  const resolutions = resolveAllMuscleTerms([...rawTerms]);
  assert.equal(resolutions.length, 50);

  const unknownTerms = resolutions.filter((r) => r.kind === 'unknown').map((r) => r.raw);
  // Only non-skeletal muscle strings like 'cardiovascular system' should be unknown
  assert.deepEqual(unknownTerms, ['cardiovascular system']);

  for (const res of resolutions) {
    assert.ok(['anatomical', 'functional', 'regional', 'unknown'].includes(res.kind));
    if (res.kind === 'anatomical') {
      assert.ok(res.entity, `Entity expected for anatomical term "${res.raw}"`);
      assert.ok(res.region, `Region expected for anatomical term "${res.raw}"`);
      assert.ok(MUSCLE_ENTITY_METADATA[res.entity!], `Metadata expected for entity "${res.entity}"`);
    } else if (res.kind === 'functional') {
      assert.ok(res.functionalGroup, `Functional group expected for "${res.raw}"`);
      assert.equal(res.entity, undefined, `No specific entity should be forced on functional term "${res.raw}"`);
    } else if (res.kind === 'regional') {
      assert.ok(res.region, `Region expected for regional term "${res.raw}"`);
      assert.equal(res.entity, undefined, `No specific entity should be forced on regional term "${res.raw}"`);
    }
  }
});
