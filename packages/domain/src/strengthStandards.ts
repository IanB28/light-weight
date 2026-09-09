import { MuscleGroup } from './types.js';

export type StrengthTier = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';
export type Gender = 'male' | 'female';

export interface TierInfo {
  tier: StrengthTier;
  labelEs: string;
  emoji: string;
  color: string;
  minRatio: number;
}

export interface StrengthEvaluation {
  tier: StrengthTier;
  tierLabelEs: string;
  emoji: string;
  color: string;
  currentRatio: number;
  oneRmKg: number;
  nextTier: StrengthTier | null;
  nextTierLabelEs: string | null;
  targetRatio: number | null;
  targetOneRmKg: number | null;
  kgToNextTier: number | null;
  progressPctToNextTier: number; // 0 to 100
}

/**
 * Standard 1RM to Bodyweight ratio thresholds inspired by StrengthLevel / ExRx standards.
 * Tiers:
 * - Beginner: Below Novice threshold
 * - Novice: Baseline trained lifter (~6 months regular training)
 * - Intermediate: Consistent lifter (~1-2 years solid progression)
 * - Advanced: Serious strength athlete (~3-5 years dedicated training)
 * - Elite: Top tier / competitive standard (>5 years peak training)
 */
export const STRENGTH_STANDARDS: Record<Gender, Record<MuscleGroup, Record<'novice' | 'intermediate' | 'advanced' | 'elite', number>>> = {
  male: {
    chest: { novice: 0.85, intermediate: 1.25, advanced: 1.65, elite: 2.05 },
    quadriceps: { novice: 1.15, intermediate: 1.60, advanced: 2.10, elite: 2.60 },
    back: { novice: 1.35, intermediate: 1.90, advanced: 2.45, elite: 3.00 },
    shoulders: { novice: 0.55, intermediate: 0.80, advanced: 1.05, elite: 1.30 },
    hamstrings: { novice: 1.05, intermediate: 1.50, advanced: 1.95, elite: 2.40 },
    glutes: { novice: 1.30, intermediate: 1.85, advanced: 2.40, elite: 2.90 },
    biceps: { novice: 0.35, intermediate: 0.50, advanced: 0.68, elite: 0.85 },
    triceps: { novice: 0.40, intermediate: 0.60, advanced: 0.80, elite: 1.00 },
    calves: { novice: 1.10, intermediate: 1.60, advanced: 2.10, elite: 2.60 },
    core: { novice: 0.50, intermediate: 0.85, advanced: 1.20, elite: 1.55 },
    forearms: { novice: 0.30, intermediate: 0.45, advanced: 0.60, elite: 0.75 }
  },
  female: {
    chest: { novice: 0.50, intermediate: 0.75, advanced: 1.05, elite: 1.35 },
    quadriceps: { novice: 0.75, intermediate: 1.10, advanced: 1.50, elite: 1.90 },
    back: { novice: 0.90, intermediate: 1.35, advanced: 1.80, elite: 2.25 },
    shoulders: { novice: 0.35, intermediate: 0.50, advanced: 0.70, elite: 0.90 },
    hamstrings: { novice: 0.70, intermediate: 1.05, advanced: 1.40, elite: 1.75 },
    glutes: { novice: 1.10, intermediate: 1.65, advanced: 2.20, elite: 2.70 },
    biceps: { novice: 0.20, intermediate: 0.32, advanced: 0.45, elite: 0.58 },
    triceps: { novice: 0.25, intermediate: 0.38, advanced: 0.52, elite: 0.68 },
    calves: { novice: 0.80, intermediate: 1.20, advanced: 1.60, elite: 2.00 },
    core: { novice: 0.35, intermediate: 0.60, advanced: 0.90, elite: 1.20 },
    forearms: { novice: 0.20, intermediate: 0.30, advanced: 0.42, elite: 0.55 }
  }
};

export const TIER_METADATA: Record<StrengthTier, { labelEs: string; emoji: string; color: string }> = {
  beginner: { labelEs: 'Principiante', emoji: '🥉', color: '#71717A' },
  novice: { labelEs: 'Novicio', emoji: '🥈', color: '#38BDF8' },
  intermediate: { labelEs: 'Intermedio', emoji: '🥇', color: '#10B981' },
  advanced: { labelEs: 'Avanzado', emoji: '🏆', color: '#F59E0B' },
  elite: { labelEs: 'Élite', emoji: '💎', color: '#A855F7' }
};

/**
 * Evaluates a lifter's relative strength on a given muscle group compared to
 * their bodyweight and biological gender.
 */
export function evaluateRelativeStrength(
  muscle: MuscleGroup,
  oneRmKg: number,
  bodyweightKg: number,
  gender: Gender = 'male'
): StrengthEvaluation {
  const safeBw = Math.max(30, bodyweightKg);
  const ratio = Math.round((oneRmKg / safeBw) * 100) / 100;
  const thresholds = STRENGTH_STANDARDS[gender][muscle] || STRENGTH_STANDARDS.male[muscle];

  let tier: StrengthTier = 'beginner';
  let nextTier: StrengthTier | null = 'novice';
  let prevThreshold = 0;
  let nextThreshold = thresholds.novice;

  if (ratio >= thresholds.elite) {
    tier = 'elite';
    nextTier = null;
    prevThreshold = thresholds.advanced;
    nextThreshold = thresholds.elite;
  } else if (ratio >= thresholds.advanced) {
    tier = 'advanced';
    nextTier = 'elite';
    prevThreshold = thresholds.advanced;
    nextThreshold = thresholds.elite;
  } else if (ratio >= thresholds.intermediate) {
    tier = 'intermediate';
    nextTier = 'advanced';
    prevThreshold = thresholds.intermediate;
    nextThreshold = thresholds.advanced;
  } else if (ratio >= thresholds.novice) {
    tier = 'novice';
    nextTier = 'intermediate';
    prevThreshold = thresholds.novice;
    nextTierThreshold: thresholds.intermediate;
    nextThreshold = thresholds.intermediate;
  } else {
    tier = 'beginner';
    nextTier = 'novice';
    prevThreshold = 0;
    nextThreshold = thresholds.novice;
  }

  const meta = TIER_METADATA[tier];
  const nextMeta = nextTier ? TIER_METADATA[nextTier] : null;

  let targetRatio: number | null = null;
  let targetOneRmKg: number | null = null;
  let kgToNextTier: number | null = null;
  let progressPctToNextTier = 100;

  if (nextTier && nextThreshold) {
    targetRatio = nextThreshold;
    targetOneRmKg = Math.round(nextThreshold * safeBw * 10) / 10;
    kgToNextTier = Math.max(0, Math.round((targetOneRmKg - oneRmKg) * 10) / 10);
    const span = nextThreshold - prevThreshold;
    progressPctToNextTier = span > 0
      ? Math.min(100, Math.max(0, Math.round(((ratio - prevThreshold) / span) * 100)))
      : 100;
  }

  return {
    tier,
    tierLabelEs: meta.labelEs,
    emoji: meta.emoji,
    color: meta.color,
    currentRatio: ratio,
    oneRmKg,
    nextTier,
    nextTierLabelEs: nextMeta?.labelEs || null,
    targetRatio,
    targetOneRmKg,
    kgToNextTier,
    progressPctToNextTier
  };
}
