import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { BodyweightEntry } from '../lib/storage.js';
import { LineChart, ChartPoint } from './charts/LineChart.js';
import { AppCard, Button, EmptyState } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { MaskedPngIcon } from './ui/MaskedPngIcon.js';
import { SEMANTIC_ICON_ASSETS } from './ui/icon-assets.js';

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
  const goalSummary = targetWeight === null
    ? t('weight.setGoal')
    : `${t('weight.goal')} ${displayWeight(targetWeight, units)} ${unit}${diffToGoal !== null
      ? ` · ${diffToGoal} ${unit} ${isLosingGoal ? t('weight.toLose') : t('weight.toGain')}`
      : ''}`;

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
    <AppCard className="min-w-0 space-y-3 select-none">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="ui-section-title min-w-0 flex-1 text-text-secondary">{t('weight.title')}</h3>
        <Button size="md" onClick={onOpenLogModal} className="shrink-0 rounded-full px-3" aria-label={t('weight.logToday')}>
          <Plus aria-hidden="true" className="size-4" />
          <span>{t('weight.log')}</span>
        </Button>
      </div>

      {!latestEntry ? (
        <div className="space-y-1">
          <EmptyState compact icon={<MaskedPngIcon {...SEMANTIC_ICON_ASSETS.bodyweight} className="size-5" />} title={t('weight.empty')} description={t('weight.emptyDescription')} />
          {targetWeight !== null && (
            <Button variant="ghost" size="md" onClick={onOpenGoalModal} className="w-full justify-start px-2 text-left text-xs" aria-label={`${t('weight.changeGoal')}: ${goalSummary}`}>
              <MaskedPngIcon {...SEMANTIC_ICON_ASSETS.goalWeight} className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 break-words">{goalSummary}</span>
            </Button>
          )}
        </div>
      ) : (<>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="ui-metric text-3xl tracking-tight text-text-primary sm:text-4xl">
            {latestWeightFormatted}
          </span>
          <span className="ui-unit">{unit}</span>
        </div>

        <span className="ui-caption break-words lowercase">
          {latestDateStr}
        </span>
      </div>

      <Button
        variant="ghost"
        size="md"
        onClick={onOpenGoalModal}
        aria-label={targetWeight !== null ? `${t('weight.changeGoal')}: ${goalSummary}` : goalSummary}
        className="max-w-full justify-start px-2 text-left text-xs font-medium text-text-secondary"
      >
        <MaskedPngIcon {...SEMANTIC_ICON_ASSETS.goalWeight} className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 break-words">
          {goalSummary}
        </span>
      </Button>

      <div className="min-w-0 overflow-hidden pt-1">
        <LineChart
          points={chartPoints}
          height={130}
          unit={unit}
          color="var(--accent-color)"
          goal={targetWeight === null ? null : displayWeight(targetWeight, units)}
        />
      </div>
      </>)}
    </AppCard>
  );
};
