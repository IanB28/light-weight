import { eq } from 'drizzle-orm';
import {
  calculateWeeklyStreak,
  resolveCanonicalStrengthProjection,
  resolveFeaturedPrVariants,
  resolveSelectedFeaturedPrVariant,
  projectPublicFeaturedPrLoad,
  selectCanonicalPersonalRecordsByExercise,
  type FeaturedPrSelection,
  type FeaturedPrShowcase,
  type PublicFeaturedPrProjection,
  type StrengthRank
} from '@light-weight/domain';
import { db } from '../db/index.js';
import { profileFeaturedPrs } from '../db/schema.js';
import { loadFullUserTrainingProjection } from './user-training-projection.js';

export interface UserFeaturedPrAuthority {
  showcase: FeaturedPrShowcase;
  publicFeaturedPrs: PublicFeaturedPrProjection[];
  strengthRank: StrengthRank | null;
  stats: {
    totalWorkouts: number;
    weeklyStreak: number;
  };
}

export async function resolveUserFeaturedPrAuthority(
  userId: string,
  suppliedSelections?: readonly FeaturedPrSelection[]
): Promise<UserFeaturedPrAuthority> {
  const selectionRows = suppliedSelections
    ? suppliedSelections
    : await db.select({
        slot: profileFeaturedPrs.slot,
        exerciseId: profileFeaturedPrs.exerciseId,
        loadWeightKg: profileFeaturedPrs.loadWeightKg
      }).from(profileFeaturedPrs).where(eq(profileFeaturedPrs.userId, userId)).orderBy(profileFeaturedPrs.slot);

  const selections: FeaturedPrSelection[] = selectionRows.map((row) => ({
    slot: row.slot as FeaturedPrSelection['slot'],
    exerciseId: row.exerciseId,
    loadWeightKg: Number(row.loadWeightKg)
  })).sort((left, right) => left.slot - right.slot);
  const training = await loadFullUserTrainingProjection(userId, selections.map((item) => item.exerciseId));
  const exerciseIds = Object.keys(training.exercisesById);
  const variants = exerciseIds.flatMap((exerciseId) => resolveFeaturedPrVariants({
    exerciseId,
    exercise: training.exercisesById[exerciseId],
    history: training.history,
    historicalPersonalRecords: training.historicalPersonalRecords,
    bodyweightEntries: training.bodyweightEntries
  }));
  const resolvedSelections = selections.map((selection) => ({
    ...selection,
    variant: resolveSelectedFeaturedPrVariant(selection, variants)
  }));
  const strength = resolveCanonicalStrengthProjection(training.history, training.exercisesById, {
    gender: training.gender,
    bodyweightEntries: training.bodyweightEntries,
    historicalPersonalRecords: training.historicalPersonalRecords
  });
  const strengthRanksByExercise = Object.fromEntries(Object.entries(strength.byExercise)
    .map(([exerciseId, observation]) => [exerciseId, observation.evaluation.rank]));

  let publicFeaturedPrs: PublicFeaturedPrProjection[];
  if (selections.length > 0) {
    publicFeaturedPrs = resolvedSelections.flatMap((resolved) => {
      const exercise = training.exercisesById[resolved.exerciseId];
      if (!exercise) return [];
      const weightKg = resolved.variant?.loadWeightKg ?? resolved.loadWeightKg;
      return [{
        slot: resolved.slot,
        exercise: { id: exercise.id, name: exercise.name },
        load: projectPublicFeaturedPrLoad(exercise, weightKg),
        ...(resolved.variant ? { reps: resolved.variant.reps } : {}),
        strengthRank: strengthRanksByExercise[exercise.id] ?? null,
        available: resolved.variant !== null
      }];
    });
  } else {
    const personalRecords = selectCanonicalPersonalRecordsByExercise(training.history, {
      exercisesById: training.exercisesById,
      bodyweightEntries: training.bodyweightEntries,
      historicalPersonalRecords: training.historicalPersonalRecords
    });
    publicFeaturedPrs = Object.values(personalRecords)
      .filter((record) => !training.exercisesById[record.exerciseId]?.isCustom)
      .sort((left, right) => right.est1Rm - left.est1Rm)
      .slice(0, 3)
      .flatMap((record, index) => {
        const exercise = training.exercisesById[record.exerciseId];
        if (!exercise) return [];
        return [{
          slot: (index + 1) as PublicFeaturedPrProjection['slot'],
          exercise: { id: exercise.id, name: exercise.name },
          load: projectPublicFeaturedPrLoad(exercise, record.weightKg),
          reps: record.reps,
          strengthRank: strengthRanksByExercise[exercise.id] ?? null,
          available: true
        }];
      });
  }

  return {
    showcase: { selections, variants, resolvedSelections, strengthRanksByExercise },
    publicFeaturedPrs,
    strengthRank: strength.overall?.rank ?? null,
    stats: {
      totalWorkouts: training.history.length,
      weeklyStreak: calculateWeeklyStreak(training.history)
    }
  };
}

export async function resolveUserFeaturedPrShowcase(
  userId: string,
  suppliedSelections?: readonly FeaturedPrSelection[]
): Promise<FeaturedPrShowcase> {
  return (await resolveUserFeaturedPrAuthority(userId, suppliedSelections)).showcase;
}
