import React, { useState, useMemo } from 'react';
import {
  Shield,
  Sparkles,
  Dumbbell,
  AlertTriangle,
  ChevronRight,
  Calendar,
  Trophy,
  Target
} from 'lucide-react';
import type {
  WorkoutSession,
  Exercise,
  MuscleGroup,
  BodyweightEntry
} from '@light-weight/domain';
import {
  buildExercisesById,
  selectStrengthSnapshot
} from '../stats/stats-selectors.js';
import { AnatomicalBodyMap } from '../../components/charts/AnatomicalBodyMap.js';
import { StrengthRankBadge } from '../../components/StrengthRankBadge.js';
import {
  getStrengthRankVisual,
  getStrengthRankColor
} from '../../lib/strength-rank-visuals.js';
import { useI18n, useExerciseLabels } from '../../lib/i18n.js';
import { usePreferences } from '../../lib/preferences-context.js';
import { formatDisplayWeight } from '../../lib/weight-units.js';
import { AppCard, Button, EmptyState } from '../../components/ui/index.js';

export interface ProfileStrengthSectionProps {
  history: WorkoutSession[];
  exercises: Exercise[];
  bodyweightKg?: number | null;
  gender?: 'male' | 'female' | null;
  bodyweightEntries?: BodyweightEntry[];
  onConfigureGender?: () => void;
  onConfigureBodyweight?: () => void;
}

export const ProfileStrengthSection: React.FC<ProfileStrengthSectionProps> = ({
  history,
  exercises,
  bodyweightKg,
  gender,
  bodyweightEntries = [],
  onConfigureGender,
  onConfigureBodyweight
}) => {
  const { t, locale } = useI18n();
  const { preferences } = usePreferences();
  const { muscleLabel } = useExerciseLabels();
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);

  const exercisesById = useMemo(() => buildExercisesById(exercises), [exercises]);

  const strengthSnapshot = useMemo(() => {
    return selectStrengthSnapshot(history, exercisesById, {
      bodyweightKg: bodyweightKg ?? null,
      gender: gender ?? undefined,
      bodyweightEntries
    });
  }, [history, exercisesById, bodyweightKg, gender, bodyweightEntries]);

  const overall = strengthSnapshot.overall;
  const overallVisual = overall ? getStrengthRankVisual(overall.rank) : null;
  const nextOverallVisual = overall?.nextRank ? getStrengthRankVisual(overall.nextRank) : null;

  const selectedMuscleData = selectedMuscle ? strengthSnapshot.muscles[selectedMuscle] : null;
  const selectedEval = selectedMuscleData?.strengthEvaluation;
  const selectedMuscleVisual = selectedEval ? getStrengthRankVisual(selectedEval.rank) : null;
  const selectedNextVisual = selectedEval?.nextRank ? getStrengthRankVisual(selectedEval.nextRank) : null;

  const selectedExercise = useMemo(() => {
    if (!selectedMuscleData?.topExerciseId) return null;
    return exercisesById[selectedMuscleData.topExerciseId] ?? null;
  }, [selectedMuscleData, exercisesById]);

  const formattedDate = useMemo(() => {
    if (!selectedMuscleData?.performedAt) return null;
    try {
      return new Date(selectedMuscleData.performedAt).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  }, [selectedMuscleData?.performedAt, locale]);

  return (
    <section className="space-y-4" aria-labelledby="profile-strength-heading">
      <div className="flex items-center justify-between">
        <h4
          id="profile-strength-heading"
          className="flex items-center gap-2 text-sm font-extrabold text-text-primary"
        >
          <Trophy aria-hidden="true" className="size-4 text-accent" />
          {t('profile.strengthTitle')}
        </h4>
        {overall && (
          <span
            className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: `${overallVisual?.color}15`,
              borderColor: `${overallVisual?.color}40`,
              color: overallVisual?.color
            }}
          >
            {overall.overallScore.toFixed(2)} / 9.00
          </span>
        )}
      </div>

      {/* Missing configuration notice */}
      {!gender && (
        <div className="flex items-center justify-between gap-3 rounded-ui-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1.5 font-bold text-amber-300">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              {t('stats.genderRequiredForStandards')}
            </p>
            <p className="text-[11px] text-amber-200/80">{t('profile.genderPrompt')}</p>
          </div>
          {onConfigureGender && (
            <Button variant="secondary" size="sm" onClick={onConfigureGender} className="shrink-0 text-xs font-bold">
              {t('stats.configureGender')}
            </Button>
          )}
        </div>
      )}

      {!bodyweightKg && (
        <div className="flex items-center justify-between gap-3 rounded-ui-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1.5 font-bold text-amber-300">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              {t('profile.bodyweightRequired')}
            </p>
            <p className="text-[11px] text-amber-200/80">{t('profile.bodyweightEntryHint')}</p>
          </div>
          {onConfigureBodyweight && (
            <Button variant="secondary" size="sm" onClick={onConfigureBodyweight} className="shrink-0 text-xs font-bold">
              {t('profile.addBodyweight')}
            </Button>
          )}
        </div>
      )}

      {/* Empty State when no valid evaluated muscles */}
      {!overall ? (
        <EmptyState
          compact
          icon={<Dumbbell className="size-5" />}
          title={t('profile.noStrengthData')}
          description={t('profile.noStrengthDataDesc')}
        />
      ) : (
        <div className="space-y-4">
          {/* Overall Strength Hero Card */}
          <div className="glass-surface relative rounded-ui-xl border border-border-subtle p-4.5 shadow-card">
            <div className="relative flex items-center gap-4">
              {/* Hero Badge — glow is applied via drop-shadow filter on the transparent PNG image */}
              <div className="shrink-0">
                <StrengthRankBadge
                  rank={overall.rank}
                  size="xl"
                  showGlow
                />
              </div>

              {/* Hero Info */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">
                    {t('profile.overall')}
                  </span>
                  {overall.isComplete ? (
                    <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      {t('profile.overallComplete')}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      {t('profile.overallProvisional')}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2">
                  <h3
                    className="text-xl font-extrabold tracking-tight"
                    style={{ color: overallVisual?.color }}
                  >
                    {t(`ranks.${overall.rank}`)}
                  </h3>
                  <span className="font-mono text-sm font-bold text-text-secondary">
                    {overall.overallScore.toFixed(2)}
                    <span className="text-[11px] text-text-muted"> / 9.00</span>
                  </span>
                </div>

                <p className="text-[11px] text-text-muted">
                  {t('profile.evaluatedGroups', {
                    rated: overall.ratedMuscleCount,
                    total: overall.totalMuscleCount
                  })}
                </p>
              </div>
            </div>

            {/* Overall Progress to next rank */}
            <div className="mt-3.5 space-y-1.5 border-t border-border-subtle pt-3">
              <div className="flex items-center justify-between text-xs">
                {overall.nextRank ? (
                  <>
                    <span className="text-[11px] text-text-muted truncate">
                      {t('profile.progressToward', {
                        pct: Math.round(overall.progressPctToNextRank),
                        nextRank: t(`ranks.${overall.nextRank}`)
                      })}
                    </span>
                    <span
                      className="font-mono text-[11px] font-bold shrink-0 ml-2"
                      style={{ color: nextOverallVisual?.color ?? overallVisual?.color }}
                    >
                      {Math.round(overall.progressPctToNextRank)}%
                    </span>
                  </>
                ) : (
                  <span className="text-accent font-bold text-xs flex items-center gap-1">
                    <Sparkles className="size-3.5 text-accent inline" />
                    {t('stats.maxRank')}
                  </span>
                )}
              </div>

              {overall.nextRank && (
                <div className="h-1.5 w-full rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, overall.progressPctToNextRank))}%`,
                      backgroundColor: overallVisual?.color
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Anatomical Body Map (Strength Mode) */}
          <div className="space-y-2 rounded-ui-xl border border-border-subtle bg-surface p-3">
            <AnatomicalBodyMap
              data={strengthSnapshot.muscles}
              mode="strength"
              strengthPresentation="profile"
              gender={gender ?? undefined}
              selectedMuscle={selectedMuscle}
              onSelectMuscle={setSelectedMuscle}
              onConfigureGender={onConfigureGender}
            />
          </div>

          {/* Selected Muscle Strength Detail Panel */}
          {selectedMuscle && (
            <div className="space-y-3 rounded-ui-xl border border-border-subtle bg-surface p-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedEval && (
                    <StrengthRankBadge
                      rank={selectedEval.rank}
                      size="sm"
                    />
                  )}
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-extrabold capitalize text-text-primary">
                      {muscleLabel(selectedMuscle)}
                    </h4>
                    {selectedEval && (
                      <span
                        className="text-xs font-bold block truncate"
                        style={{ color: selectedMuscleVisual?.color }}
                      >
                        {t(`ranks.${selectedEval.rank}`)}
                      </span>
                    )}
                  </div>
                </div>

                {selectedEval && (
                  <div className="text-right font-mono shrink-0">
                    <span
                      className="text-xs font-bold block"
                      style={{ color: selectedMuscleVisual?.color }}
                    >
                      {selectedEval.strengthScore.toFixed(2)}
                      <span className="text-[10px] text-text-muted"> / 9.00</span>
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      {t('profile.strengthScore')}
                    </span>
                  </div>
                )}
              </div>

              {selectedEval ? (
                <>
                  {/* Metric Grid: Best e1RM, Relative Strength, Top Exercise */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-2.5">
                      <span className="text-[10px] text-text-muted block">
                        {t('profile.bestE1Rm')}
                      </span>
                      <span className="mt-0.5 block text-xs font-mono font-bold text-text-primary">
                        {formatDisplayWeight(selectedEval.oneRmKg, preferences.units)}
                      </span>
                    </div>

                    <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-2.5">
                      <span className="text-[10px] text-text-muted block">
                        {t('profile.relativeStrength')}
                      </span>
                      <span className="text-xs font-mono font-bold text-accent block mt-0.5">
                        {selectedEval.currentRatio.toFixed(2)}× BW
                      </span>
                    </div>
                  </div>

                  {/* Top exercise & date row */}
                  {(selectedExercise || selectedMuscleData?.topExerciseId) && (
                    <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-1 text-xs">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <Dumbbell className="size-3 text-text-muted shrink-0" />
                        <span className="text-text-muted text-[11px] truncate">
                          {t('profile.topExercise')}:{' '}
                          <strong className="text-text-primary">
                            {selectedExercise?.name ?? selectedMuscleData?.topExerciseId}
                          </strong>
                        </span>
                      </div>
                      {formattedDate && (
                        <span className="text-[10px] font-mono text-text-muted shrink-0 flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formattedDate}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Next Rank Progress */}
                  <div className="space-y-1.5 border-t border-border-subtle pt-2">
                    <div className="flex items-center justify-between text-xs">
                      {selectedEval.nextRank ? (
                        <>
                          <span className="text-[11px] text-text-muted truncate">
                            {t('profile.remainingE1Rm', {
                              weight: formatDisplayWeight(selectedEval.kgToNextRank ?? 0, preferences.units)
                            })}
                          </span>
                          <span
                            className="font-mono text-[11px] font-bold shrink-0 ml-2"
                            style={{ color: selectedNextVisual?.color ?? selectedMuscleVisual?.color }}
                          >
                            → {t(`ranks.${selectedEval.nextRank}`)} ({Math.round(selectedEval.progressPctToNextRank)}%)
                          </span>
                        </>
                      ) : (
                        <span className="text-accent font-bold text-xs flex items-center gap-1">
                          <Sparkles className="size-3.5 text-accent inline" />
                          {t('stats.maxRank')}
                        </span>
                      )}
                    </div>

                    {selectedEval.nextRank && (
                      <div className="h-1.5 w-full rounded-full bg-surface-raised overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, selectedEval.progressPctToNextRank))}%`,
                            backgroundColor: selectedMuscleVisual?.color
                          }}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-3 text-center text-xs text-text-muted">
                  {t('profile.noStrengthData')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
