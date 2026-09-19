import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, WorkoutSession } from '@light-weight/domain';
import {
  computeSemanticBalanceForHistory,
  getUnderexposedBodyPaths,
  getSortedBodyPathsByExposure
} from './balance-anatomy.js';
import {
  type BodyMusclePath,
  ALL_BODY_MUSCLE_PATHS,
  getBodyPathDisplayName
} from './exercise-anatomy.js';

const BARBELL_ROW: Exercise = {
  id: 'ex-0027',
  name: 'Barbell Row',
  category: 'barbell',
  primaryMuscle: 'back',
  secondaryMuscles: ['biceps']
};

const DUMBBELL_SHOULDER_PRESS: Exercise = {
  id: 'ex-0405',
  name: 'Dumbbell Shoulder Press',
  category: 'dumbbell',
  primaryMuscle: 'shoulders',
  secondaryMuscles: ['triceps']
};

const EXERCISES_BY_ID: Record<string, Exercise> = {
  [BARBELL_ROW.id]: BARBELL_ROW,
  [DUMBBELL_SHOULDER_PRESS.id]: DUMBBELL_SHOULDER_PRESS
};

test('1. Shared SVG Region: Barbell Row deduplicates physical sets while preserving all contributors', () => {
  // Barbell row has latissimus_dorsi (prime), rhomboids (co_prime), and teres_major (secondary)
  // All three map to the 'upper-back' SVG body path.
  const session: WorkoutSession = {
    id: 'sess-row-1',
    userId: 'user-1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BARBELL_ROW.id]: [
        {
          setIndex: 0,
          weightKg: 80,
          reps: 10,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 1 // hard
        }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);
  const upperBack = result.pathBalance['upper-back'];

  assert.ok(upperBack, 'upper-back path must have balance data');

  // CRITICAL INVARIANT: 1 physical set must NOT become 3 sets in upper-back!
  assert.equal(
    upperBack?.exposureCount,
    1,
    'exposureCount must be exactly 1 for a single physical set'
  );
  assert.equal(
    upperBack?.hardExposureCount,
    1,
    'hardExposureCount must be exactly 1'
  );

  // But ALL 3 semantic contributors must be preserved!
  assert.equal(
    upperBack?.contributors.length,
    3,
    'All 3 contributors (latissimus_dorsi, rhomboids, teres_major) must be preserved'
  );

  const entities = upperBack?.contributors.map((c) => (c.kind === 'anatomical' ? c.entity : null));
  assert.ok(entities?.includes('latissimus_dorsi'), 'Must include latissimus_dorsi');
  assert.ok(entities?.includes('rhomboids'), 'Must include rhomboids');
  assert.ok(entities?.includes('teres_major'), 'Must include teres_major');

  // Strongest role must be 'prime' (from latissimus_dorsi)
  assert.equal(upperBack?.strongestRole, 'prime');
});

test('2. Multi-set aggregation: multiple sets accurately accumulate deduplicated exposures', () => {
  const session: WorkoutSession = {
    id: 'sess-row-multi',
    userId: 'user-1',
    startedAt: '2026-09-18T11:00:00Z',
    sets: {
      [BARBELL_ROW.id]: [
        {
          setIndex: 0,
          weightKg: 80,
          reps: 10,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 1 // hard
        },
        {
          setIndex: 1,
          weightKg: 80,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 3 // submaximal
        },
        {
          setIndex: 2,
          weightKg: 80,
          reps: 6,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 0 // failure
        }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);
  const upperBack = result.pathBalance['upper-back'];

  assert.equal(upperBack?.exposureCount, 3, '3 physical sets performed');
  assert.equal(upperBack?.hardExposureCount, 2, 'Sets 1 and 3 were hard/failure');
});

test('3. Uncollapsed distinct paths: serratus and trapezius render independently from core and back', () => {
  // Dumbbell shoulder press contributes:
  // - anterior_deltoid (prime) -> deltoids
  // - lateral_deltoid (secondary) -> deltoids
  // - triceps_brachii (co_prime) -> triceps
  // - trapezius (secondary) -> trapezius (distinct, NOT collapsed to back!)
  // - serratus_anterior (secondary) -> serratus (distinct, NOT collapsed to core!)
  const session: WorkoutSession = {
    id: 'sess-press-1',
    userId: 'user-1',
    startedAt: '2026-09-18T12:00:00Z',
    sets: {
      [DUMBBELL_SHOULDER_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 24,
          reps: 10,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 1
        }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);

  // Serratus path
  const serratus = result.pathBalance['serratus'];
  assert.ok(serratus, 'serratus path must exist and receive exposure');
  assert.equal(serratus?.exposureCount, 1);
  assert.equal(serratus?.strongestRole, 'secondary');

  // Trapezius path
  const trapezius = result.pathBalance['trapezius'];
  assert.ok(trapezius, 'trapezius path must exist and receive exposure');
  assert.equal(trapezius?.exposureCount, 1);
  assert.equal(trapezius?.strongestRole, 'secondary');

  // Deltoids path: 2 contributors (anterior & lateral deltoid), 1 physical set
  const deltoids = result.pathBalance['deltoids'];
  assert.ok(deltoids, 'deltoids path must exist');
  assert.equal(deltoids?.exposureCount, 1, 'deltoids deduplicates 2 targets into 1 physical set');
  assert.equal(deltoids?.contributors.length, 2);
  assert.equal(deltoids?.strongestRole, 'prime');
});

test('4. Warmup sets and unknown effort handling', () => {
  const session: WorkoutSession = {
    id: 'sess-mixed',
    userId: 'user-1',
    startedAt: '2026-09-18T13:00:00Z',
    sets: {
      [BARBELL_ROW.id]: [
        {
          setIndex: 0,
          weightKg: 40,
          reps: 12,
          completed: true,
          setType: 'warmup',
          isWarmup: true
        },
        {
          setIndex: 1,
          weightKg: 80,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false // no RIR or RPE logged
        }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);
  const upperBack = result.pathBalance['upper-back'];

  // Only set 2 counted
  assert.equal(upperBack?.exposureCount, 1);
  // Because effort was unknown, hardExposureCount is 0 (never assumed!)
  assert.equal(upperBack?.hardExposureCount, 0);
});

test('5. getUnderexposedBodyPaths accurately identifies zero-exposure paths', () => {
  const session: WorkoutSession = {
    id: 'sess-press-only',
    userId: 'user-1',
    startedAt: '2026-09-18T14:00:00Z',
    sets: {
      [DUMBBELL_SHOULDER_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 20,
          reps: 10,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 2
        }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);
  const underexposed = getUnderexposedBodyPaths(result.pathBalance);

  // Press stimulated deltoids, triceps, trapezius, serratus, and chest (via clavicular head / pectoralis major)
  assert.equal(underexposed.includes('deltoids'), false, 'deltoids should NOT be underexposed');
  assert.equal(underexposed.includes('triceps'), false, 'triceps should NOT be underexposed');
  assert.equal(underexposed.includes('trapezius'), false, 'trapezius should NOT be underexposed');
  assert.equal(underexposed.includes('serratus'), false, 'serratus should NOT be underexposed');
  assert.equal(underexposed.includes('chest'), false, 'chest should NOT be underexposed');

  // But calves, adductors, hamstrings, tibialis, quadriceps received zero sets
  assert.equal(underexposed.includes('calves'), true, 'calves must be underexposed');
  assert.equal(underexposed.includes('adductors'), true, 'adductors must be underexposed');
  assert.equal(underexposed.includes('hamstring'), true, 'hamstring must be underexposed');
  assert.equal(underexposed.includes('tibialis'), true, 'tibialis must be underexposed');
  assert.equal(underexposed.includes('quadriceps'), true, 'quadriceps must be underexposed');
});

test('6. getSortedBodyPathsByExposure sorts paths descending by exposure count', () => {
  const session: WorkoutSession = {
    id: 'sess-mixed-counts',
    userId: 'user-1',
    startedAt: '2026-09-18T15:00:00Z',
    sets: {
      [BARBELL_ROW.id]: [
        { setIndex: 0, weightKg: 80, reps: 10, completed: true, setType: 'working', isWarmup: false, rir: 2 },
        { setIndex: 1, weightKg: 80, reps: 10, completed: true, setType: 'working', isWarmup: false, rir: 2 },
        { setIndex: 2, weightKg: 80, reps: 10, completed: true, setType: 'working', isWarmup: false, rir: 2 }
      ],
      [DUMBBELL_SHOULDER_PRESS.id]: [
        { setIndex: 0, weightKg: 20, reps: 10, completed: true, setType: 'working', isWarmup: false, rir: 2 }
      ]
    }
  };

  const result = computeSemanticBalanceForHistory([session], EXERCISES_BY_ID);
  const sorted = getSortedBodyPathsByExposure(result.pathBalance);

  // deltoids received 3 sets from row (posterior deltoid) + 1 set from shoulder press = 4 physical sets
  // trapezius received 3 sets from row (trapezius co_prime) + 1 set from shoulder press = 4 physical sets
  // upper-back received 3 sets from row (latissimus dorsi, rhomboids, teres major) = 3 physical sets
  assert.equal(sorted[0], 'deltoids', 'Top exposed path is deltoids with 4 sets');
  assert.equal(result.pathBalance[sorted[0]]?.exposureCount, 4);

  assert.equal(sorted[1], 'trapezius', 'Second exposed path is trapezius with 4 sets');
  assert.equal(result.pathBalance[sorted[1]]?.exposureCount, 4);

  assert.equal(result.pathBalance['upper-back']?.exposureCount, 3);
  assert.ok(sorted.indexOf('upper-back') >= 2 && sorted.indexOf('upper-back') <= 5);

  const countLast = result.pathBalance[sorted[sorted.length - 1]]?.exposureCount ?? 0;
  assert.equal(countLast, 0, 'Last paths have 0 sets');
});

test('7. Subregion isolation: adductors, serratus, trapezius, lower-back, tibialis exist and display independently', () => {
  const subregions: BodyMusclePath[] = ['adductors', 'serratus', 'trapezius', 'lower-back', 'tibialis'];

  for (const sr of subregions) {
    assert.ok(
      ALL_BODY_MUSCLE_PATHS.includes(sr),
      `Subregion ${sr} must be in ALL_BODY_MUSCLE_PATHS`
    );
    const displayName = getBodyPathDisplayName(sr, 'es');
    assert.ok(displayName.length > 0, `Subregion ${sr} must have a non-empty Spanish display name`);
    // Ensure display names don't collapse to broad generic names
    if (sr === 'adductors') assert.equal(displayName, 'Aductores');
    if (sr === 'serratus') assert.equal(displayName, 'Serrato');
    if (sr === 'trapezius') assert.equal(displayName, 'Trapecio');
    if (sr === 'lower-back') assert.equal(displayName, 'Espalda baja');
    if (sr === 'tibialis') assert.equal(displayName, 'Tibial');
  }
});

