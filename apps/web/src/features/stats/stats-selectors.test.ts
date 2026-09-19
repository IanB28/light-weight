import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type Exercise,
  type WorkoutSession,
  type BodyweightEntry,
  type LoggedSet
} from '@light-weight/domain';
import { selectStrengthSnapshot, buildExercisesById } from './stats-selectors.js';

function s(weightKg: number, reps: number, options: Partial<LoggedSet> = {}): LoggedSet {
  return {
    setIndex: 1,
    weightKg,
    reps,
    completed: true,
    setType: 'working',
    isWarmup: false,
    ...options
  };
}

const mockChestExercise: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

const mockBackExercise: Exercise = {
  id: 'ex-pullup',
  name: 'Pull Up',
  category: 'bodyweight',
  primaryMuscle: 'back',
  loading: {
    mechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: 1,
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: false
  }
};

const exercisesById = buildExercisesById([mockChestExercise, mockBackExercise]);

test('1. normal multi-rep working set can generate high Strength Rank', () => {
  // Lifter (80kg BW, male): 100kg x 8 reps on Bench Press -> e1RM ≈ 126.7kg -> ratio ≈ 1.58 -> Maestro
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [s(100, 8)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.rank, 'maestro');
  assert.equal(chest.strengthEvaluation.rankIndex, 5);
  assert.ok(chest.topEst1RmKg > 120);
});

test('2. a lighter multi-rep set can produce a higher e1RM/rank than a heavier one-rep set when mathematically appropriate', () => {
  // Set A: 90kg x 1 rep -> e1RM = 90kg -> Gladiador (ratio 1.125)
  // Set B: 85kg x 10 reps -> e1RM ≈ 111.2kg -> Élite (ratio 1.39)
  // 85kg x 10 yields higher e1RM and thus higher rank
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(90, 1),
          s(85, 10)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  // e1RM should reflect the 85x10 set (> 110 kg), not the 90kg set
  assert.ok(chest.topEst1RmKg > 110);
  assert.equal(chest.strengthEvaluation.rank, 'elite');
});

test('3. multiple sets are NOT averaged', () => {
  // Sets: 120x5 (e1RM ~138.6), 120x4 (e1RM ~134), 115x4 (e1RM ~129), 110x5 (e1RM ~127)
  // If averaged: ~132. But demonstrated strength is MAX: ~138.6.
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(120, 5),
          s(120, 4),
          s(115, 4),
          s(110, 5)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  // 120 x 5 average formula gives ~138.65 kg
  assert.ok(chest.topEst1RmKg >= 138);
  assert.ok(chest.topEst1RmKg < 142);
});

test('4. later fatigued sets do not lower the winner', () => {
  // First set is fresh and high: 140kg x 3 (e1RM ~152kg -> ratio ~1.90 -> Inmortal)
  // Second set is fatigued: 100kg x 2
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(140, 3),
          s(100, 2)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.rank, 'inmortal');
  assert.ok(chest.topEst1RmKg > 150);
});

test('5. warmup set cannot raise Strength Rank', () => {
  // A warmup set with massive weight (e.g. rack hold logged as warmup)
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(200, 5, { setType: 'warmup', isWarmup: true }),
          s(80, 5)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  // 80 x 5 is ~93kg, ratio 1.16 -> Gladiador (NOT Dios/Semidios from the 200kg warmup)
  assert.ok(chest.topEst1RmKg < 100);
  assert.equal(chest.strengthEvaluation.rank, 'gladiador');
});

test('6. incomplete set cannot raise Strength Rank', () => {
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(180, 3, { completed: false })
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.equal(chest.topEst1RmKg, 0);
  assert.equal(chest.strengthEvaluation, undefined);
});

test('7. >12 reps cannot generate Strength Rank via e1RM', () => {
  // 15 reps is above REP_CAP = 12
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(80, 15)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.equal(chest.topEst1RmKg, 0);
  assert.equal(chest.strengthEvaluation, undefined);
});

test('8. historical bodyweight is used when available', () => {
  // On 2026-01-01, lifter was 70kg and did 100kg x 1 (ratio = 1.428 -> Maestro, since Maestro = 1.45 and Élite = 1.25)
  // Current bodyweight is 100kg. If 100kg was used, ratio would be 1.00 -> Principiante!
  const bws: BodyweightEntry[] = [
    { date: '2026-01-01T00:00:00Z', weightKg: 70 }
  ];

  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 100, // current BW is 100
    gender: 'male',
    bodyweightEntries: bws
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.bodyweightKg, 70);
  assert.equal(chest.strengthEvaluation.rank, 'elite');
  assert.ok(chest.strengthEvaluation.strengthScore > 4.5);
});

test('9. current bodyweight fallback works', () => {
  // No historical bodyweight entry matching date -> falls back to current bodyweightKg
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male',
    bodyweightEntries: []
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.bodyweightKg, 80);
});

test('10. no bodyweight means no StrengthEvaluation', () => {
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: null,
    gender: 'male',
    bodyweightEntries: []
  });

  const chest = snapshot.muscles.chest;
  assert.equal(chest.strengthEvaluation, undefined);
  assert.equal(snapshot.overall, null);
});

test('11. no gender means no StrengthEvaluation', () => {
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: undefined
  });

  const chest = snapshot.muscles.chest;
  assert.equal(chest.strengthEvaluation, undefined);
  assert.equal(snapshot.overall, null);
});

test('12. highest strengthScore wins per MuscleGroup', () => {
  // Session 1: at BW 70kg, lifts 105kg -> ratio = 1.50 -> Maestro (score ~5.25)
  // Session 2: at BW 90kg, lifts 110kg -> ratio = 1.22 -> Gladiador (score ~3.85)
  // Higher raw kg was 110kg, but higher strengthScore is from Session 1!
  const bws: BodyweightEntry[] = [
    { date: '2026-01-01T00:00:00Z', weightKg: 70 },
    { date: '2026-06-01T00:00:00Z', weightKg: 90 }
  ];

  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(105, 1)
        ]
      }
    },
    {
      id: 's2',
      userId: 'u1',
      startedAt: '2026-06-02T10:00:00Z',
      sets: {
        'ex-bench': [
          s(110, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 90,
    gender: 'male',
    bodyweightEntries: bws
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.rank, 'maestro');
  assert.equal(chest.performedAt, '2026-01-02T10:00:00Z');
  assert.equal(chest.topEst1RmKg, 105);
});

test('13. raw kg does not automatically determine winner when normalized score differs', () => {
  // BW 60kg: 90kg bench -> ratio = 1.50 (score 5.25)
  // BW 90kg: 100kg bench -> ratio = 1.11 (score 3.30)
  // 100kg > 90kg in raw load, but normalized score 5.25 > 3.30!
  const bws: BodyweightEntry[] = [
    { date: '2026-01-01T00:00:00Z', weightKg: 60 },
    { date: '2026-02-01T00:00:00Z', weightKg: 90 }
  ];

  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-05T10:00:00Z',
      sets: {
        'ex-bench': [
          s(90, 1)
        ]
      }
    },
    {
      id: 's2',
      userId: 'u1',
      startedAt: '2026-02-05T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 90,
    gender: 'male',
    bodyweightEntries: bws
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.topEst1RmKg, 90);
  assert.equal(chest.performedAt, '2026-01-05T10:00:00Z');
});

test('14. tie-breaker uses higher e1RM', () => {
  // Both produce identical strengthScore (e.g. at Rank 9 Dios, all scores clamp to 9.00)
  // Observation A: 200kg bench at 80kg BW (ratio 2.50 >= 2.25 -> score 9.00)
  // Observation B: 220kg bench at 80kg BW (ratio 2.75 >= 2.25 -> score 9.00)
  // Both have score 9.00. Tie-breaker must choose higher 1RM: 220kg!
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(200, 1)
        ]
      }
    },
    {
      id: 's2',
      userId: 'u1',
      startedAt: '2026-02-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(220, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.strengthEvaluation.rank, 'dios');
  assert.equal(chest.topEst1RmKg, 220);
});

test('15. final tie-breaker uses newer performedAt', () => {
  // Identical score and identical 1RM:
  // Session 1: 100kg x 1 on 2026-01-01
  // Session 2: 100kg x 1 on 2026-03-01
  // Newer date wins!
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    },
    {
      id: 's2',
      userId: 'u1',
      startedAt: '2026-03-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation);
  assert.equal(chest.performedAt, '2026-03-01T10:00:00Z');
});

test('16. Overall uses normalized muscle strengthScore values', () => {
  // Chest: 100kg bench at 80kg BW -> ratio 1.25 -> Élite (score 4.00)
  // Back: pullup with +35kg at 80kg BW -> effective load 115kg -> ratio 115/80 = 1.4375 -> Novato? Back novice is 1.35, intermediate is 1.90. Gladiador is 1.35 + 0.55/2 = 1.625.
  // Ratio 1.4375 is Principiante (1.35 to 1.625, span = 0.275).
  // fraction = (1.4375 - 1.35) / 0.275 = 0.0875 / 0.275 = 0.318 -> score = 2.32
  // Mean of chest (4.00) and back (2.32) = 3.16 -> Gladiador (score 3.16)
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ],
        'ex-pullup': [
          s(35, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  assert.ok(snapshot.overall);
  assert.equal(snapshot.overall.ratedMuscleCount, 2);
  assert.equal(snapshot.overall.totalMuscleCount, 11);
  assert.equal(snapshot.overall.isComplete, false);
  assert.equal(snapshot.overall.rank, 'gladiador');
  assert.ok(Math.abs(snapshot.overall.overallScore - 3.159) < 0.01);
  assert.equal(snapshot.overall.overallScore.toFixed(2), '3.16');
});

test('17. missing muscles do not reduce Overall', () => {
  // Only chest trained at Élite (4.00). The other 10 muscles are unrated.
  // Overall must be 4.00 (NOT 4.00 / 11 = 0.36)
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      sets: {
        'ex-bench': [
          s(100, 1)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 80,
    gender: 'male'
  });

  assert.ok(snapshot.overall);
  assert.equal(snapshot.overall.ratedMuscleCount, 1);
  assert.equal(snapshot.overall.overallScore, 4.00);
  assert.equal(snapshot.overall.rank, 'elite');
});

test('18. weighted bodyweight exercise evaluates against effective load, not external load only', () => {
  // Lifter BW = 70kg, male. Logs pull-up with +20kg for 5 reps.
  // Effective load MUST be: (70 * 1) + 20 = 90kg.
  // 1RM: 90 * (1 + 5/30) = 105.0kg (NOT 20 * 1.1667 = 23.3kg).
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      sets: {
        'ex-pullup': [
          s(20, 5)
        ]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg: 70,
    gender: 'male'
  });

  const backEval = snapshot.muscles.back;
  assert.ok(backEval);
  assert.equal(backEval.topExerciseName, 'Pull Up');
  // 1RM should be around 105kg (average formula of 90kg x 5 reps)
  assert.ok(backEval.topEst1RmKg >= 104 && backEval.topEst1RmKg <= 106);
  assert.ok(backEval.strengthEvaluation);
  // Ratio is ~104 / 70 = 1.486× BW (Principiante: >= 1.35; without effective load it would be 0.33× Novato)
  assert.ok(backEval.strengthEvaluation.currentRatio > 1.4);
  assert.equal(backEval.strengthEvaluation.rank, 'principiante');
});

test('19. Strength Prime A: Curated exercise follows canonical prime over conflicting legacy primaryMuscle', () => {
  // ex-0025 is Barbell Bench Press in production catalog.
  // Canonical prime in Semantics v2 is pectoralis_major -> chest.
  // We deliberately set legacy primaryMuscle to 'triceps' in the fixture.
  const conflictingBench: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'triceps', // CONFLICTING deliberately
    secondaryMuscles: ['shoulders'],
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };

  const catalog = buildExercisesById([conflictingBench]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-0025': [s(100, 8)] // e1RM ~126.7kg
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  // Strength MUST be attributed to chest (canonical prime), NOT triceps (conflicting legacy field)
  const chest = snapshot.muscles.chest;
  assert.ok(chest.strengthEvaluation, 'Chest must receive the Strength observation from Bench Press');
  assert.equal(chest.strengthEvaluation?.rank, 'maestro');
  assert.equal(chest.topExerciseId, 'ex-0025');

  // Triceps must NOT receive the Strength observation despite the legacy primaryMuscle field
  const triceps = snapshot.muscles.triceps;
  assert.equal(triceps.strengthEvaluation, undefined, 'Triceps must NOT receive the Strength observation');
  assert.equal(triceps.topEst1RmKg, 0);
});

test('20. Strength Prime B: Co-prime contribution does not inherit Strength Rank', () => {
  // Curated Bench Press (ex-0025) has triceps_brachii as co_prime.
  // One heavy bench press set must NOT independently increase triceps Strength Rank.
  const standardBench: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };

  const catalog = buildExercisesById([standardBench]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-0025': [s(140, 1)] // 140kg 1RM on bench
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  // Chest gets rated
  assert.ok(snapshot.muscles.chest.strengthEvaluation);

  // Triceps (co_prime) must NOT inherit Strength
  assert.equal(snapshot.muscles.triceps.strengthEvaluation, undefined);
  assert.equal(snapshot.muscles.triceps.topEst1RmKg, 0);
});

test('21. Strength Prime C: Legacy fallback for uncurated exercise maps primaryMuscle to prime', () => {
  // Uncurated exercise with no Semantics v2 profile
  const uncuratedPress: Exercise = {
    id: 'ex-custom-press',
    name: 'Custom Hammer Chest Press',
    category: 'machine',
    primaryMuscle: 'chest',
    loading: {
      mechanism: 'plate_loaded',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };

  const catalog = buildExercisesById([uncuratedPress]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-custom-press': [s(100, 10)] // 100 x 10 -> e1RM ~133.3kg
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  // Falls back safely to chest
  assert.ok(snapshot.muscles.chest.strengthEvaluation);
  assert.equal(snapshot.muscles.chest.topExerciseId, 'ex-custom-press');
  assert.equal(snapshot.muscles.chest.strengthEvaluation?.rank, 'maestro');
});

test('22. Strength Prime D: Secondary muscle does not receive the exercise Strength observation', () => {
  // Bench press has anterior_deltoid as secondary.
  // Deltoids / shoulders must not receive the strength evaluation.
  const bench: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders'],
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };

  const catalog = buildExercisesById([bench]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-0025': [s(100, 5)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  assert.equal(snapshot.muscles.shoulders.strengthEvaluation, undefined);
  assert.equal(snapshot.muscles.shoulders.topEst1RmKg, 0);
});

test('23. Strength Prime E: Overall Strength formula consumes only rated muscles and remains mathematically unchanged', () => {
  // 2 rated muscles: Bench (chest, 100kg x 1 -> 100kg / 80kg = 1.25 -> Élite 4.00)
  // and Squat (quadriceps, 128kg x 1 -> 128kg / 80kg = 1.60 -> Élite 4.00)
  const bench: Exercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    category: 'barbell',
    primaryMuscle: 'chest',
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };
  const squat: Exercise = {
    id: 'ex-0043',
    name: 'Barbell Full Squat',
    category: 'barbell',
    primaryMuscle: 'quadriceps',
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };

  const catalog = buildExercisesById([bench, squat]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-0025': [s(100, 1)],
        'ex-0043': [s(128, 1)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  assert.ok(snapshot.overall);
  assert.equal(snapshot.overall.ratedMuscleCount, 2);
  assert.equal(snapshot.overall.overallScore, 4.00);
  assert.equal(snapshot.overall.rank, 'elite');
  assert.equal(snapshot.overall.isComplete, false);
});

test('24. selectStrengthSnapshot uses resolveExerciseStrengthTarget directly without eligibility gating', () => {
  // Mapped exercise ex-0032 (Barbell Deadlift) has prime gluteus_maximus which resolves to target glutes.
  // Legacy primaryMuscle is 'back'.
  // selectStrengthSnapshot uses resolveExerciseStrengthTarget directly:
  // no eligibility gating prevents evaluation, and canonical-prime glutes receives evaluation.
  const deadlift: Exercise = {
    id: 'ex-0032',
    name: 'Barbell Deadlift',
    category: 'barbell',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes', 'hamstrings'],
    loading: {
      mechanism: 'barbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: true
    }
  };

  const catalog = buildExercisesById([deadlift]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-0032': [s(140, 5)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  // Evaluates directly on glutes via canonical-prime attribution without gating
  assert.ok(snapshot.muscles.glutes.strengthEvaluation, 'Glutes receives evaluation directly without gating');
  assert.equal(snapshot.muscles.glutes.topExerciseId, 'ex-0032');
  assert.equal(snapshot.muscles.back.strengthEvaluation, undefined, 'Back does not receive evaluation for prime glutes');
});

test('25. Unsupported prime target produces no Strength observation in selectStrengthSnapshot', () => {
  // An uncurated exercise targeting adductor_magnus has no supported Strength target (null)
  const adductorMachine: Exercise = {
    id: 'ex-adductor',
    name: 'Adductor Machine',
    category: 'machine',
    primaryMuscle: 'adductor_magnus' as any,
    loading: {
      mechanism: 'plate_loaded',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };

  const catalog = buildExercisesById([adductorMachine]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-adductor': [s(100, 10)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  // No muscle receives an evaluation; adductor_magnus is never collapsed into quadriceps
  assert.equal(snapshot.muscles.quadriceps.strengthEvaluation, undefined);
  assert.equal(snapshot.muscles.glutes.strengthEvaluation, undefined);
  assert.equal(snapshot.overall, null);
});

test('26. Legacy fallback is clearly target attribution only in selectStrengthSnapshot', () => {
  const customCurl: Exercise = {
    id: 'ex-custom-curl',
    name: 'Custom Biceps Curl',
    category: 'dumbbell',
    primaryMuscle: 'biceps',
    loading: {
      mechanism: 'dumbbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: true,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  };

  const catalog = buildExercisesById([customCurl]);
  const history: WorkoutSession[] = [
    {
      id: 's1',
      userId: 'u1',
      startedAt: '2026-09-01T10:00:00Z',
      sets: {
        'ex-custom-curl': [s(30, 8)]
      }
    }
  ];

  const snapshot = selectStrengthSnapshot(history, catalog, {
    bodyweightKg: 80,
    gender: 'male'
  });

  assert.ok(snapshot.muscles.biceps.strengthEvaluation, 'Legacy fallback attributes strength to primaryMuscle');
  assert.equal(snapshot.muscles.biceps.topExerciseId, 'ex-custom-curl');
});
