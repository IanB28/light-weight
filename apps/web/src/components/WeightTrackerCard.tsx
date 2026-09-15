import React, { useMemo } from 'react';
import { Plus, Scale, Target } from 'lucide-react';
import { BodyweightEntry } from '../lib/storage.js';
import { LineChart, ChartPoint } from './charts/LineChart.js';
import { EmptyState } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';

interface WeightTrackerCardProps {
  entries: BodyweightEntry[];
  targetWeight: number | null;
  onOpenLogModal: () => void;
  onOpenGoalModal: () => void;
}

export const WeightTrackerCard: React.FC<WeightTrackerCardProps> = ({
  entries,
  targetWeight,
  onOpenLogModal,
  onOpenGoalModal
}) => {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const units = preferences.bodyweightUnits;
  const unit = WEIGHT_UNIT_PRESETS[units].unit;
  // Ordenar cronológicamente
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.timestamp - b.timestamp);
  }, [entries]);

  const latestEntry = sortedEntries[sortedEntries.length - 1] || null;

  // Formato del peso actual (ej. 78,7)
  const latestWeightFormatted = latestEntry
    ? displayWeight(latestEntry.weightKg, units).toLocaleString(locale, { maximumFractionDigits: 1 })
    : '--';

  // Formato de fecha del último pesaje (ej. mar, 8 sept)
  const latestDateStr = useMemo(() => {
    if (!latestEntry) return '';
    const d = new Date(latestEntry.timestamp);
    const weekday = d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
    const day = d.getDate();
    const month = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
    return `${weekday}, ${day} ${month}`;
  }, [latestEntry, locale]);

  // Diferencia hacia la meta
  const diffToGoal = latestEntry && targetWeight !== null
    ? displayWeight(Math.abs(latestEntry.weightKg - targetWeight), units)
    : null;

  const isLosingGoal = latestEntry && targetWeight !== null && targetWeight < latestEntry.weightKg;

  // Puntos para la gráfica
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (sortedEntries.length === 0) return [];
    return sortedEntries.map((e) => ({
      t: e.timestamp,
      y: displayWeight(e.weightKg, units),
      dateStr: e.date,
      label: `${displayWeight(e.weightKg, units)} ${unit}`
    }));
  }, [sortedEntries, unit, units]);

  return (
    <div className="glass-surface rounded-ui-xl border border-border-subtle p-5 space-y-2 select-none shadow-card transition-all hover:border-border-active">
      {/* Top row: Label | Target Button | + Registrar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted font-medium tracking-tight">{t('weight.title')}</span>

        <div className="flex items-center gap-2">
          {targetWeight !== null && (
            <button
              type="button"
              onClick={onOpenGoalModal}
              className="glass-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-accent cursor-pointer rounded-full"
              title={t('weight.changeGoal')}
            >
              <Target className="w-3.5 h-3.5 text-accent" />
              <span>{displayWeight(targetWeight, units)} {unit}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenLogModal}
            className="glass-btn-solid flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer"
            title={t('weight.logToday')}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
            <span>{t('weight.log')}</span>
          </button>
        </div>
      </div>

      {!latestEntry ? (
        <EmptyState compact icon={<Scale className="size-5" />} title={t('weight.empty')} description={t('weight.emptyDescription')} />
      ) : (<>
      {/* Main Stat: 78,7 kg  +  Date on the right */}
      <div className="flex items-baseline justify-between pt-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-extrabold text-text-primary tracking-tight">
            {latestWeightFormatted}
          </span>
          <span className="text-base text-text-muted font-normal">{unit}</span>
        </div>

        <span className="text-xs text-text-muted font-normal lowercase">
          {latestDateStr}
        </span>
      </div>

      {/* Subtitle: Meta 77 kg · 1,7 kg por perder */}
      {targetWeight !== null && diffToGoal !== null ? (
        <div
          onClick={onOpenGoalModal}
          className="flex items-center gap-1.5 text-xs text-accent font-medium cursor-pointer hover:underline pt-0.5"
        >
          <Target className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            {t('weight.goal')} {displayWeight(targetWeight, units)} {unit} · {diffToGoal} {unit} {isLosingGoal ? t('weight.toLose') : t('weight.toGain')}
          </span>
        </div>
      ) : (
        <div
          onClick={onOpenGoalModal}
          className="flex items-center gap-1.5 text-xs text-text-muted font-medium cursor-pointer hover:text-text-primary pt-0.5"
        >
          <Target className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span>{t('weight.setGoal')}</span>
        </div>
      )}

      {/* Minimalist SVG Chart matching openGym / dark glassmorphism */}
      <div className="pt-2">
        <LineChart
          points={chartPoints}
          height={130}
          unit={unit}
          color="var(--accent-color, #EAFF55)"
          goal={targetWeight === null ? null : displayWeight(targetWeight, units)}
        />
      </div>
      </>)}
    </div>
  );
};
