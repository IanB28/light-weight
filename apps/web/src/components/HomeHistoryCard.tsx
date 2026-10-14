import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { resolveWorkoutDateKey, type BodyweightEntry, type Exercise, type WorkoutSession } from '@light-weight/domain';
import { ActivityHeatmap } from './charts/ActivityHeatmap.js';
import { WorkoutDetailModal } from './WorkoutDetailModal.js';
import { AppCard, BottomSheet } from './ui/index.js';
import { groupWorkoutSessionsByDate, recentWorkoutSessions } from '../lib/home-history.js';
import { useI18n } from '../lib/i18n.js';

interface HomeHistoryCardProps {
  history: WorkoutSession[];
  exercisesById: Record<string, Exercise>;
  bodyweightEntries: BodyweightEntry[];
}

export function HomeHistoryCard({ history, exercisesById, bodyweightEntries }: HomeHistoryCardProps) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [inspectedSession, setInspectedSession] = useState<WorkoutSession | null>(null);
  const byDate = useMemo(() => groupWorkoutSessionsByDate(history), [history]);
  const recent = useMemo(() => recentWorkoutSessions(history), [history]);
  const activeDates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate]);
  const selectedSessions = selectedDate ? byDate[selectedDate] ?? [] : [];
  const dayLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const close = () => {
    setExpanded(false);
    setSelectedDate(null);
    setInspectedSession(null);
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
  </>);
}
