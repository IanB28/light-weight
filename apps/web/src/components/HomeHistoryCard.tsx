import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Flame, TrendingUp } from 'lucide-react';
import { resolveWorkoutDateKey, type BodyweightEntry, type Exercise, type WorkoutSession } from '@light-weight/domain';
import { ActivityHeatmap } from './charts/ActivityHeatmap.js';
import { WorkoutDetailModal } from './WorkoutDetailModal.js';
import { TonnageEquivalenceModal } from './TonnageEquivalenceModal.js';
import { AppCard, BottomSheet, Button } from './ui/index.js';
import { groupWorkoutSessionsByDate, recentWorkoutSessions } from '../lib/home-history.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, formatDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { selectProgressSummary, selectTotalVolumeTonnage } from '../features/stats/stats-selectors.js';

interface HomeHistoryCardProps {
  history: WorkoutSession[];
  exercisesById: Record<string, Exercise>;
  bodyweightEntries: BodyweightEntry[];
}

export function HomeHistoryCard({ history, exercisesById, bodyweightEntries }: HomeHistoryCardProps) {
  const { locale, t } = useI18n();
  const { preferences } = usePreferences();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [inspectedSession, setInspectedSession] = useState<WorkoutSession | null>(null);
  const [isTonnageModalOpen, setIsTonnageModalOpen] = useState(false);
  const byDate = useMemo(() => groupWorkoutSessionsByDate(history), [history]);
  const recent = useMemo(() => recentWorkoutSessions(history), [history]);
  const activeDates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate]);
  const summary = useMemo(() => selectProgressSummary(history, exercisesById, bodyweightEntries), [history, exercisesById, bodyweightEntries]);
  const totalVolumeTonnage = useMemo(() => selectTotalVolumeTonnage(history, exercisesById, bodyweightEntries), [history, exercisesById, bodyweightEntries]);
  const compactNumber = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale]);
  const selectedSessions = selectedDate ? byDate[selectedDate] ?? [] : [];
  const dayLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const close = () => {
    setExpanded(false);
    setSelectedDate(null);
    setInspectedSession(null);
    setIsTonnageModalOpen(false);
  };
  const selectDay = (dateKey: string) => setSelectedDate(dateKey);

  return (<>
    <AppCard className="min-w-0 space-y-3" data-testid="home-history-card">
      <button type="button" aria-expanded={expanded} aria-controls="home-history-content"
        onClick={() => expanded ? close() : setExpanded(true)}
        className="ui-focus-visible ui-pressable flex min-h-11 w-full items-center justify-between gap-3 rounded-ui-md text-left">
        <span className="ui-section-title min-w-0 break-words text-text-primary">{t('home.historyTitle')}</span>
        <ChevronDown aria-hidden="true" className={`size-5 shrink-0 text-text-secondary ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div id="home-history-content" className="min-w-0 space-y-4">
        <div className="min-w-0 space-y-3 rounded-ui-lg border border-border-subtle bg-surface-input p-3" data-testid="home-progress-recap">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-text-secondary">{t('stats.last30')}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">{t('stats.activity')}</p>
            </div>
            <TrendingUp aria-hidden="true" className="size-5 shrink-0 text-accent" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-ui-lg border border-border-subtle bg-surface">
            <div className="min-w-0 px-2 py-3 text-center">
              <span className="block min-h-6 text-[10px] font-bold uppercase leading-3 text-text-muted">{t('stats.bestE1rm')}</span>
              <strong className="mt-1 block break-words text-sm leading-tight text-text-primary">{summary.bestEstimatedOneRm > 0 ? formatDisplayWeight(summary.bestEstimatedOneRm, preferences.units) : '—'}</strong>
            </div>
            <div className="min-w-0 px-2 py-3 text-center">
              <span className="block min-h-6 text-[10px] font-bold uppercase leading-3 text-text-muted">{t('stats.sessions')}</span>
              <strong className="mt-1 block text-sm text-text-primary">{summary.sessions}</strong>
            </div>
            <div className="min-w-0 px-2 py-3 text-center">
              <span className="block min-h-6 text-[10px] font-bold uppercase leading-3 text-text-muted">{t('stats.volume')}</span>
              <strong className="mt-1 block break-words text-sm leading-tight text-text-primary">{compactNumber.format(displayWeight(summary.volumeKg, preferences.units))} {weightUnit}</strong>
            </div>
          </div>
          <p className="min-w-0 truncate text-xs text-text-muted">{summary.bestExerciseName || t('stats.noMarks')}</p>
          {totalVolumeTonnage > 0 && <Button variant="ghost" size="sm" onClick={() => setIsTonnageModalOpen(true)} className="w-full text-text-muted">
            <Flame aria-hidden="true" className="size-4 text-accent" />
            {t('stats.totalHistoricalTonnage')}: {compactNumber.format(displayWeight(totalVolumeTonnage, preferences.units))} {weightUnit}
          </Button>}
        </div>
        <ActivityHeatmap history={history} exercisesById={exercisesById}
          bodyweightEntries={bodyweightEntries} onSelectDate={selectDay} />
        {activeDates.length > 0 && <div className="min-w-0 space-y-2">
          <p className="ui-caption">{t('home.selectRecordedDay')}</p>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('home.recordedDays')}>
            {activeDates.map((dateKey) => <button key={dateKey} type="button"
              onClick={() => selectDay(dateKey)}
              className="ui-focus-visible ui-pressable glass-subcard flex min-h-11 shrink-0 items-center gap-2 rounded-ui-md px-3 text-sm text-text-primary">
              <CalendarDays aria-hidden="true" className="size-4 text-accent" />
              <span>{new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="ui-caption">({byDate[dateKey].length})</span>
            </button>)}
          </div>
        </div>}
        <div className="space-y-2">
          <h3 className="ui-card-title text-text-primary">{t('stats.recentWorkouts')}</h3>
          {recent.length === 0 ? <p className="ui-body-secondary">{t('home.noHistory')}</p> :
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {recent.map((session) => <button key={session.id} type="button"
                onClick={() => setInspectedSession(session)}
                className="ui-focus-visible ui-pressable glass-subcard flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-ui-md p-3 text-left">
                <span className="min-w-0"><strong className="block break-words text-sm text-text-primary">{session.routineName || t('workout.freeWorkout')}</strong>
                  <span className="ui-caption block">{new Date(`${resolveWorkoutDateKey(session)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
              </button>)}
            </div>}
        </div>
      </div>}
      <BottomSheet open={expanded && selectedDate !== null} onClose={() => setSelectedDate(null)}
        title={dayLabel} description={t('home.historySessions', { count: selectedSessions.length })}>
        <div className="space-y-2">
          {selectedSessions.map((session) => <button key={session.id} type="button"
            onClick={() => { setSelectedDate(null); setInspectedSession(session); }}
            className="ui-focus-visible ui-pressable glass-subcard flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-ui-md p-3 text-left">
            <span className="min-w-0"><strong className="block break-words text-sm text-text-primary">{session.routineName || t('workout.freeWorkout')}</strong>
              <span className="ui-caption block">{new Date(session.startedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span></span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
          </button>)}
        </div>
      </BottomSheet>
    </AppCard>
    <WorkoutDetailModal session={expanded ? inspectedSession : null} onClose={() => setInspectedSession(null)}
      exercisesById={exercisesById} bodyweightEntries={bodyweightEntries} />
    <TonnageEquivalenceModal isOpen={expanded && isTonnageModalOpen} onClose={() => setIsTonnageModalOpen(false)} totalKg={totalVolumeTonnage} />
  </>);
}
