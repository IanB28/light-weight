import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRENGTH_RANKS,
  STRENGTH_STANDARDS,
  deriveStrengthRankThresholds,
  evaluateRelativeStrength,
  calculateOverallStrength,
  StrengthRank,
  StrengthEvaluation
} from './strengthStandards.js';
import type { MuscleGroup } from './types.js';

test('1. nine canonical ranks exist in exact order', () => {
  const expected: StrengthRank[] = [
    'novato',
    'principiante',
    'gladiador',
    'elite',
    'maestro',
    'leyenda',
    'inmortal',
    'semidios',
    'dios'
  ];
  assert.deepEqual(STRENGTH_RANKS, expected);
  assert.equal(STRENGTH_RANKS.length, 9);
});

test('2. male chest derives exact thresholds: 0.00, 0.85, 1.05, 1.25, 1.45, 1.65, 1.85, 2.05, 2.25', () => {
  const anchors = STRENGTH_STANDARDS.male.chest;
  assert.deepEqual(anchors, {
    novice: 0.85,
    intermediate: 1.25,
    advanced: 1.65,
    elite: 2.05
  });

  const thresholds = deriveStrengthRankThresholds(anchors);
  assert.equal(thresholds.novato, 0.00);
  assert.equal(thresholds.principiante, 0.85);
  assert.equal(thresholds.gladiador, 1.05);
  assert.equal(thresholds.elite, 1.25);
  assert.equal(thresholds.maestro, 1.45);
  assert.equal(thresholds.leyenda, 1.65);
  assert.equal(thresholds.inmortal, 1.85);
  assert.equal(thresholds.semidios, 2.05);
  assert.equal(thresholds.dios, 2.25);
});

test('3. exact boundary at Principiante', () => {
  // Male chest: N = 0.85. 85kg 1RM at 100kg BW = 0.85 ratio -> Principiante
  const result = evaluateRelativeStrength('chest', 85, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'principiante');
  assert.equal(result.rankIndex, 2);
  assert.equal(result.strengthScore, 2.00);
});

test('4. exact boundary at Gladiador', () => {
  // Male chest: Gladiador = 1.05. 105kg 1RM at 100kg BW = 1.05 ratio -> Gladiador
  const result = evaluateRelativeStrength('chest', 105, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'gladiador');
  assert.equal(result.rankIndex, 3);
  assert.equal(result.strengthScore, 3.00);
});

test('5. exact boundary at Élite', () => {
  // Male chest: Elite = 1.25. 125kg 1RM at 100kg BW = 1.25 ratio -> Elite
  const result = evaluateRelativeStrength('chest', 125, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'elite');
  assert.equal(result.rankIndex, 4);
  assert.equal(result.strengthScore, 4.00);
});

test('6. exact boundary at Maestro', () => {
  // Male chest: Maestro = 1.45. 145kg 1RM at 100kg BW = 1.45 ratio -> Maestro
  const result = evaluateRelativeStrength('chest', 145, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'maestro');
  assert.equal(result.rankIndex, 5);
  assert.equal(result.strengthScore, 5.00);
});

test('7. exact boundary at Leyenda', () => {
  // Male chest: Leyenda = 1.65. 165kg 1RM at 100kg BW = 1.65 ratio -> Leyenda
  const result = evaluateRelativeStrength('chest', 165, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'leyenda');
  assert.equal(result.rankIndex, 6);
  assert.equal(result.strengthScore, 6.00);
});

test('8. exact boundary at Inmortal', () => {
  // Male chest: Inmortal = 1.85. 185kg 1RM at 100kg BW = 1.85 ratio -> Inmortal
  const result = evaluateRelativeStrength('chest', 185, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'inmortal');
  assert.equal(result.rankIndex, 7);
  assert.equal(result.strengthScore, 7.00);
});

test('9. exact boundary at Semidiós', () => {
  // Male chest: Semidiós = 2.05. 205kg 1RM at 100kg BW = 2.05 ratio -> Semidios
  const result = evaluateRelativeStrength('chest', 205, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'semidios');
  assert.equal(result.rankIndex, 8);
  assert.equal(result.strengthScore, 8.00);
});

test('10. exact boundary at Dios', () => {
  // Male chest: Dios = 2.25. 225kg 1RM at 100kg BW = 2.25 ratio -> Dios
  const result = evaluateRelativeStrength('chest', 225, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'dios');
  assert.equal(result.rankIndex, 9);
  assert.equal(result.strengthScore, 9.00);
});

test('11. value just below a threshold remains previous rank', () => {
  // 84.99kg at 100kg BW = 0.8499 < 0.85 -> Novato
  const justBelowPrincipiante = evaluateRelativeStrength('chest', 84.99, 100, 'male');
  assert.ok(justBelowPrincipiante);
  assert.equal(justBelowPrincipiante.rank, 'novato');
  assert.equal(justBelowPrincipiante.rankIndex, 1);

  // 104.99kg at 100kg BW = 1.0499 < 1.05 -> Principiante
  const justBelowGladiador = evaluateRelativeStrength('chest', 104.99, 100, 'male');
  assert.ok(justBelowGladiador);
  assert.equal(justBelowGladiador.rank, 'principiante');

  // 224.99kg at 100kg BW = 2.2499 < 2.25 -> Semidiós
  const justBelowDios = evaluateRelativeStrength('chest', 224.99, 100, 'male');
  assert.ok(justBelowDios);
  assert.equal(justBelowDios.rank, 'semidios');
  assert.equal(justBelowDios.rankIndex, 8);
});

test('12. continuous score interpolates correctly', () => {
  // Male chest: Principiante = 0.85, Gladiador = 1.05 (span = 0.20)
  // Ratio 0.95 is halfway: 2 + (0.95 - 0.85) / 0.20 = 2.50
  const result = evaluateRelativeStrength('chest', 95, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'principiante');
  assert.ok(Math.abs(result.strengthScore - 2.50) < 1e-6);
  assert.equal(result.progressPctToNextRank, 50);

  // 72% toward Leyenda from Maestro (Maestro = 1.45, Leyenda = 1.65, span = 0.20)
  // 1.45 + 0.72 * 0.20 = 1.594
  const maestro72 = evaluateRelativeStrength('chest', 159.4, 100, 'male');
  assert.ok(maestro72);
  assert.equal(maestro72.rank, 'maestro');
  assert.ok(Math.abs(maestro72.strengthScore - 5.72) < 1e-6);
  assert.equal(maestro72.progressPctToNextRank, 72);
});

test('13. score never exceeds 9', () => {
  // Massive ratio: 300kg at 100kg BW = 3.00 (Dios threshold is 2.25)
  const result = evaluateRelativeStrength('chest', 300, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'dios');
  assert.equal(result.strengthScore, 9.00);
});

test('14. internal ratio is not rounded before classification', () => {
  // BW = 80kg. Principiante threshold for chest is 0.85 -> 68.0 kg.
  // 67.98 kg / 80 kg = 0.84975. If rounded to 2 decimals, 0.84975 would become 0.85!
  // It MUST NOT be rounded prematurely to 0.85 to award Principiante.
  const result = evaluateRelativeStrength('chest', 67.98, 80, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'novato');
  assert.equal(result.rankIndex, 1);
});

test('15. nextRank correct at all levels', () => {
  // Novato -> Principiante
  const r1 = evaluateRelativeStrength('chest', 50, 100, 'male');
  assert.equal(r1?.nextRank, 'principiante');

  // Principiante -> Gladiador
  const r2 = evaluateRelativeStrength('chest', 90, 100, 'male');
  assert.equal(r2?.nextRank, 'gladiador');

  // Gladiador -> Élite
  const r3 = evaluateRelativeStrength('chest', 110, 100, 'male');
  assert.equal(r3?.nextRank, 'elite');

  // Élite -> Maestro
  const r4 = evaluateRelativeStrength('chest', 130, 100, 'male');
  assert.equal(r4?.nextRank, 'maestro');

  // Maestro -> Leyenda
  const r5 = evaluateRelativeStrength('chest', 150, 100, 'male');
  assert.equal(r5?.nextRank, 'leyenda');

  // Leyenda -> Inmortal
  const r6 = evaluateRelativeStrength('chest', 170, 100, 'male');
  assert.equal(r6?.nextRank, 'inmortal');

  // Inmortal -> Semidiós
  const r7 = evaluateRelativeStrength('chest', 190, 100, 'male');
  assert.equal(r7?.nextRank, 'semidios');

  // Semidiós -> Dios
  const r8 = evaluateRelativeStrength('chest', 210, 100, 'male');
  assert.equal(r8?.nextRank, 'dios');
});

test('16. Dios has nextRank null', () => {
  const result = evaluateRelativeStrength('chest', 230, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'dios');
  assert.equal(result.nextRank, null);
  assert.equal(result.targetRatio, null);
  assert.equal(result.targetOneRmKg, null);
  assert.equal(result.kgToNextRank, null);
});

test('17. Dios has progress 100', () => {
  const result = evaluateRelativeStrength('chest', 250, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'dios');
  assert.equal(result.progressPctToNextRank, 100);
});

test('18. kgToNextRank correct', () => {
  // Male chest: BW = 80kg.
  // Lifter has 80kg 1RM -> ratio = 1.00 (Gladiador, threshold 1.05 = 84kg, Elite threshold 1.25 = 100kg).
  // Next rank is Elite (threshold 1.25).
  // Target 1RM = 1.25 * 80 = 100.0 kg.
  // kgToNextRank = 100.0 - 80.0 = 20.0 kg.
  const result = evaluateRelativeStrength('chest', 80, 80, 'male');
  assert.ok(result);
  // 80/80 = 1.00 ratio. Male chest: N=0.85 (Principiante), Gladiador=1.05.
  // 1.00 is >= 0.85 and < 1.05 -> Principiante
  assert.equal(result.rank, 'principiante');
  assert.equal(result.nextRank, 'gladiador');
  // Gladiador threshold is 1.05 * 80 = 84.0 kg.
  assert.equal(result.targetOneRmKg, 84.0);
  assert.equal(result.kgToNextRank, 4.0);
});

test('19. Overall averages strengthScore, not rankIndex', () => {
  // Two muscles rated:
  // Muscle A has strengthScore 2.90 (high Principiante, rankIndex 2)
  // Muscle B has strengthScore 4.10 (low Élite, rankIndex 4)
  // Average strengthScore = (2.90 + 4.10) / 2 = 3.50 -> Gladiador (score 3.50, 50% toward Élite)
  // If it averaged rankIndex (2 and 4), it would be (2 + 4) / 2 = 3.00.
  const mockA: StrengthEvaluation = {
    version: 2,
    rank: 'principiante',
    rankIndex: 2,
    strengthScore: 2.90,
    currentRatio: 1.03,
    oneRmKg: 103,
    bodyweightKg: 100,
    nextRank: 'gladiador',
    targetRatio: 1.05,
    targetOneRmKg: 105,
    kgToNextRank: 2,
    progressPctToNextRank: 90
  };

  const mockB: StrengthEvaluation = {
    version: 2,
    rank: 'elite',
    rankIndex: 4,
    strengthScore: 4.10,
    currentRatio: 1.27,
    oneRmKg: 127,
    bodyweightKg: 100,
    nextRank: 'maestro',
    targetRatio: 1.45,
    targetOneRmKg: 145,
    kgToNextRank: 18,
    progressPctToNextRank: 10
  };

  const overall = calculateOverallStrength({
    chest: mockA,
    back: mockB
  });

  assert.ok(overall);
  assert.equal(overall.overallScore, 3.50);
  assert.equal(overall.rank, 'gladiador');
  assert.equal(overall.rankIndex, 3);
  assert.equal(overall.nextRank, 'elite');
  assert.equal(overall.progressPctToNextRank, 50);
});

test('20. zero rated muscles -> null', () => {
  assert.equal(calculateOverallStrength({}), null);
  assert.equal(calculateOverallStrength({ chest: undefined, back: undefined }), null);
});

test('21. one rated muscle -> provisional Overall', () => {
  const evalChest = evaluateRelativeStrength('chest', 100, 80, 'male');
  assert.ok(evalChest);

  const overall = calculateOverallStrength({ chest: evalChest });
  assert.ok(overall);
  assert.equal(overall.ratedMuscleCount, 1);
  assert.equal(overall.totalMuscleCount, 11);
  assert.equal(overall.isComplete, false);
});

test('22. partial muscle set ignores missing groups', () => {
  const evalChest = evaluateRelativeStrength('chest', 100, 80, 'male'); // ratio 1.25 -> Elite (score 4.00)
  assert.ok(evalChest);
  assert.equal(evalChest.strengthScore, 4.00);

  const overall = calculateOverallStrength({
    chest: evalChest,
    back: undefined,
    shoulders: undefined
  });

  assert.ok(overall);
  // Only chest is rated, so mean must equal chest score 4.00, NOT diluted by zeros
  assert.equal(overall.overallScore, 4.00);
  assert.equal(overall.ratedMuscleCount, 1);
});

test('23. missing group is not Novato', () => {
  // A lifter with only back rated at Maestro (5.00)
  const mockBack: StrengthEvaluation = {
    version: 2,
    rank: 'maestro',
    rankIndex: 5,
    strengthScore: 5.00,
    currentRatio: 2.45,
    oneRmKg: 196,
    bodyweightKg: 80,
    nextRank: 'leyenda',
    targetRatio: 2.45,
    targetOneRmKg: 196,
    kgToNextRank: 0,
    progressPctToNextRank: 0
  };

  const overall = calculateOverallStrength({
    back: mockBack,
    chest: undefined
  });

  assert.ok(overall);
  // If chest were treated as Novato (1.00), overall would drop to 3.00.
  // Because missing group is UNRATED, overallScore remains 5.00!
  assert.equal(overall.overallScore, 5.00);
  assert.equal(overall.rank, 'maestro');
});

test('24. 11 groups -> isComplete true', () => {
  const groups: MuscleGroup[] = [
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'forearms', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'
  ];

  const fullMap: Partial<Record<MuscleGroup, StrengthEvaluation>> = {};
  for (const g of groups) {
    const ev = evaluateRelativeStrength(g, 100, 80, 'male');
    assert.ok(ev);
    fullMap[g] = ev;
  }

  const overall = calculateOverallStrength(fullMap);
  assert.ok(overall);
  assert.equal(overall.ratedMuscleCount, 11);
  assert.equal(overall.totalMuscleCount, 11);
  assert.equal(overall.coveragePct, 100);
  assert.equal(overall.isComplete, true);
});

test('25. coveragePct correct', () => {
  const groups: MuscleGroup[] = ['chest', 'back', 'shoulders'];
  const partialMap: Partial<Record<MuscleGroup, StrengthEvaluation>> = {};
  for (const g of groups) {
    const ev = evaluateRelativeStrength(g, 100, 80, 'male');
    assert.ok(ev);
    partialMap[g] = ev;
  }

  const overall = calculateOverallStrength(partialMap);
  assert.ok(overall);
  assert.equal(overall.ratedMuscleCount, 3);
  assert.equal(overall.totalMuscleCount, 11);
  // 3 / 11 = 27.27% -> rounded to 27%
  assert.equal(overall.coveragePct, 27);
  assert.equal(overall.isComplete, false);
});

test('26. Overall rank is floor-based / interval-based, not rounded', () => {
  // Score 5.99 must be Maestro (rankIndex 5), NOT rounded up to Leyenda (rankIndex 6)
  const mockA: StrengthEvaluation = {
    version: 2,
    rank: 'maestro',
    rankIndex: 5,
    strengthScore: 5.99,
    currentRatio: 1.64,
    oneRmKg: 164,
    bodyweightKg: 100,
    nextRank: 'leyenda',
    targetRatio: 1.65,
    targetOneRmKg: 165,
    kgToNextRank: 1,
    progressPctToNextRank: 99
  };

  const overall = calculateOverallStrength({ chest: mockA });
  assert.ok(overall);
  assert.equal(overall.overallScore, 5.99);
  assert.equal(overall.rank, 'maestro');
  assert.equal(overall.rankIndex, 5);
  assert.equal(overall.nextRank, 'leyenda');
  assert.equal(overall.progressPctToNextRank, 99);
});

test('27. Overall next-rank progress correct', () => {
  // ADR Example: overallScore = 5.31 -> rank = maestro, rankIndex = 5, nextRank = leyenda, progressPctToNextRank = 31
  const mockA: StrengthEvaluation = {
    version: 2,
    rank: 'maestro',
    rankIndex: 5,
    strengthScore: 5.31,
    currentRatio: 1.51,
    oneRmKg: 151,
    bodyweightKg: 100,
    nextRank: 'leyenda',
    targetRatio: 1.65,
    targetOneRmKg: 165,
    kgToNextRank: 14,
    progressPctToNextRank: 31
  };

  const overall = calculateOverallStrength({ chest: mockA });
  assert.ok(overall);
  assert.equal(overall.overallScore, 5.31);
  assert.equal(overall.rank, 'maestro');
  assert.equal(overall.rankIndex, 5);
  assert.equal(overall.nextRank, 'leyenda');
  assert.equal(overall.progressPctToNextRank, 31);
});

test('28. boundary regression: actualRatio = 1.2496 with threshold 1.25 evaluates as gladiador, not elite', () => {
  // Male chest: Gladiador = 1.05, Elite = 1.25
  // If 1RM = 124.96 kg and BW = 100 kg, ratio is exactly 1.2496 (< 1.25).
  // Premature 2-decimal rounding would round 1.2496 -> 1.25 and award Elite.
  // The lifter MUST remain Gladiador!
  const result = evaluateRelativeStrength('chest', 124.96, 100, 'male');
  assert.ok(result);
  assert.equal(result.rank, 'gladiador');
  assert.equal(result.rankIndex, 3);
  assert.equal(result.nextRank, 'elite');
  assert.equal(result.currentRatio, 1.2496); // exact unrounded ratio
  assert.ok(result.strengthScore < 4.0); // strictly below 4.0 (Elite)
  // fraction = (1.2496 - 1.05) / (1.25 - 1.05) = 0.1996 / 0.20 = 0.998
  // strengthScore = 3 + 0.998 = 3.998
  assert.ok(Math.abs(result.strengthScore - 3.998) < 1e-6);
});

test('29. unrounded continuous scores are preserved in Overall arithmetic mean', () => {
  // Two muscles with non-round continuous scores:
  // Muscle 1: score 10/3 = 3.333333333...
  // Muscle 2: score 4.5
  // Mean = (3.333333333... + 4.5) / 2 = 3.916666666...
  const mock1: StrengthEvaluation = {
    version: 2,
    rank: 'gladiador',
    rankIndex: 3,
    strengthScore: 10 / 3, // 3.3333333333333335
    currentRatio: 1.1166666666666667,
    oneRmKg: 111.67,
    bodyweightKg: 100,
    nextRank: 'elite',
    targetRatio: 1.25,
    targetOneRmKg: 125,
    kgToNextRank: 13.33,
    progressPctToNextRank: 33
  };

  const mock2: StrengthEvaluation = {
    version: 2,
    rank: 'elite',
    rankIndex: 4,
    strengthScore: 4.5,
    currentRatio: 1.35,
    oneRmKg: 135,
    bodyweightKg: 100,
    nextRank: 'maestro',
    targetRatio: 1.45,
    targetOneRmKg: 145,
    kgToNextRank: 10,
    progressPctToNextRank: 50
  };

  const overall = calculateOverallStrength({ chest: mock1, back: mock2 });
  assert.ok(overall);
  // Overall score must NOT be prematurely rounded to 3.92 in domain logic
  assert.equal(overall.overallScore, (10 / 3 + 4.5) / 2);
  assert.equal(overall.rank, 'gladiador');
  assert.equal(overall.rankIndex, 3);
  assert.equal(overall.nextRank, 'elite');
});
