import React from 'react';
import { Sparkles } from 'lucide-react';
import type { PublicOverallStrengthProjection } from '@light-weight/domain';
import { StrengthRankBadge } from '../../components/StrengthRankBadge.js';
import { useI18n } from '../../lib/i18n.js';
import { getStrengthRankVisual } from '../../lib/strength-rank-visuals.js';

export interface OverallStrengthCardProps {
  overall: PublicOverallStrengthProjection;
}

/** Presentation-only aggregate card shared by own and friend profiles. */
export function OverallStrengthCard({ overall }: OverallStrengthCardProps) {
  const { t } = useI18n();
  const visual = getStrengthRankVisual(overall.rank);
  const nextVisual = overall.nextRank ? getStrengthRankVisual(overall.nextRank) : null;
  const progress = Math.min(100, Math.max(0, overall.progressPctToNextRank));

  return (
    <div data-testid="overall-strength-card" className="glass-surface relative overflow-hidden rounded-ui-xl border border-border-subtle p-4.5 shadow-card">
      <div className="relative flex items-center gap-4">
        <div className="shrink-0">
          <StrengthRankBadge rank={overall.rank} size="xl" showGlow />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {t('profile.overall')}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              overall.isComplete
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
            }`}>
              {t(overall.isComplete ? 'profile.overallComplete' : 'profile.overallProvisional')}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-xl font-extrabold tracking-tight" style={{ color: visual.color }}>
              {t(`ranks.${overall.rank}`)}
            </h3>
            <span className="text-sm font-bold tabular-nums text-text-secondary">
              {overall.overallScore.toFixed(2)}
              <span className="text-[11px] font-normal text-text-muted"> / 9.00</span>
            </span>
          </div>

          <p className="text-[11px] font-medium text-text-muted">
            {t('profile.evaluatedGroups', {
              rated: overall.ratedMuscleCount,
              total: overall.totalMuscleCount
            })}
          </p>
        </div>
      </div>

      <div className="mt-3.5 space-y-1.5 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between text-xs">
          {overall.nextRank ? (
            <>
              <span className="min-w-0 truncate text-[11px] font-medium text-text-muted">
                {t('profile.progressToward', {
                  pct: Math.round(progress),
                  nextRank: t(`ranks.${overall.nextRank}`)
                })}
              </span>
              <span className="ml-2 shrink-0 text-[11px] font-bold tabular-nums" style={{ color: nextVisual?.color ?? visual.color }}>
                {Math.round(progress)}%
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-accent">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {t('stats.maxRank')}
            </span>
          )}
        </div>

        {overall.nextRank && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={t('profile.progressToward', {
              pct: Math.round(progress),
              nextRank: t(`ranks.${overall.nextRank}`)
            })}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
          >
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: visual.color }} />
          </div>
        )}
      </div>
    </div>
  );
}
