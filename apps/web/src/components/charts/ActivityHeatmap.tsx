import React, { useRef, useEffect } from 'react';
import { type BodyweightEntry, type Exercise, type WorkoutSession, formatLocalWorkoutDateKey } from '@light-weight/domain';
import { usePreferences } from '../../lib/preferences-context.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import { calculateHistoricalSessionVolume } from '../../lib/historical-volume.js';
import { groupWorkoutSessionsByDate } from '../../lib/home-history.js';
import { useI18n } from '../../lib/i18n.js';

interface ActivityHeatmapProps {
  history: WorkoutSession[];
  exercisesById: Record<string, Exercise>;
  bodyweightEntries: BodyweightEntry[];
  /** A selected day is an aggregate; callers receive every session on it. */
  onSelectDate?: (dateStr: string, sessions: WorkoutSession[]) => void;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  history,
  exercisesById,
  bodyweightEntries,
  onSelectDate
}) => {
  const { preferences } = usePreferences();
  const { locale, t } = useI18n();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  // Aggregate workouts by YYYY-MM-DD
  const sessionsByDate: Record<string, { sessions: WorkoutSession[]; volumeKg: number; sets: number }> = {};

  for (const [dateKey, sessions] of Object.entries(groupWorkoutSessionsByDate(history))) {
    sessionsByDate[dateKey] = {
      sessions,
      volumeKg: sessions.reduce((sum, session) => sum + calculateHistoricalSessionVolume(session, exercisesById, bodyweightEntries), 0),
      sets: sessions.reduce((sum, session) => sum + Object.values(session.sets).reduce(
        (count, sets) => count + sets.filter((set) => set.completed).length, 0
      ), 0)
    };
  }

  // Generate 26 weeks (6 months) or 52 weeks (1 year) grid
  // 36 weeks is a sweet spot for responsive mobile + scroll
  const totalWeeks = 32;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Align to end of current week (Sunday)
  const currentDayOfWeek = (today.getDay() + 6) % 7; // Mon = 0, Sun = 6
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + (6 - currentDayOfWeek));

  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - totalWeeks * 7 + 1);

  const weeks: { date: Date; dateStr: string; data?: { sessions: WorkoutSession[]; volumeKg: number; sets: number } }[][] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekDays: { date: Date; dateStr: string; data?: { sessions: WorkoutSession[]; volumeKg: number; sets: number } }[] = [];
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + w * 7 + d);
      const dateStr = formatLocalWorkoutDateKey(dayDate);
      weekDays.push({
        date: dayDate,
        dateStr,
        data: sessionsByDate[dateStr]
      });
    }
    weeks.push(weekDays);
  }

  const getLevelClass = (data?: { volumeKg: number; sets: number }) => {
    if (!data) return 'bg-surface-input border border-border-subtle';
    if (data.sets >= 15 || data.volumeKg >= 8000) return 'bg-accent border border-accent/80 shadow-sm shadow-accent/40';
    if (data.sets >= 10 || data.volumeKg >= 5000) return 'bg-accent/80 border border-accent/60';
    if (data.sets >= 5 || data.volumeKg >= 2500) return 'bg-accent/50 border border-accent/40';
    return 'bg-accent/25 border border-accent/20';
  };

  return (
    <div className="space-y-2.5">
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent select-none"
      >
        <div className="inline-flex flex-col gap-1.5 min-w-max p-1">
          {/* Heatmap Grid (7 rows, N weeks cols) */}
          <div className="flex gap-1.5 items-center">
            {/* Days of week labels */}
            <div className="flex flex-col justify-between h-[92px] text-[9px] font-mono text-text-muted pr-1 select-none">
              {(locale.startsWith('en') ? ['M', 'W', 'F', 'S'] : ['L', 'X', 'V', 'D']).map((label, index) => <span key={index}>{label}</span>)}
            </div>

            {/* Weeks Columns */}
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1">
                {week.map((day, dIdx) => {
                  const isToday = day.dateStr === formatLocalWorkoutDateKey(today);
                  const isFuture = day.date > today;
                  const levelCls = getLevelClass(day.data);

                  const title = `${day.date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${day.data ? ` · ${t('home.historySessions', { count: day.data.sessions.length })} · ${day.data.sets} ${t('workout.sets')} · ${displayWeight(day.data.volumeKg, preferences.units).toLocaleString(locale)} ${weightUnit}` : ''}`;
                  const className = `block size-3 rounded-[3px] ${isFuture ? 'opacity-20 bg-surface-input' : levelCls} ${isToday ? 'ring-1 ring-text-secondary' : ''}`;
                  return day.data && onSelectDate && !isFuture ? (
                    <button key={dIdx} type="button" title={title} aria-label={title}
                      onClick={() => onSelectDate(day.dateStr, day.data!.sessions)}
                      className={`ui-focus-visible ${className}`} />
                  ) : <span key={dIdx} aria-hidden="true" title={title} className={className} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-text-muted font-mono px-1">
        <span>{t('home.lessActivity')}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-surface-input border border-border-subtle" />
          <span className="w-2.5 h-2.5 rounded-[2px] bg-accent/25" />
          <span className="w-2.5 h-2.5 rounded-[2px] bg-accent/50" />
          <span className="w-2.5 h-2.5 rounded-[2px] bg-accent/80" />
          <span className="w-2.5 h-2.5 rounded-[2px] bg-accent" />
        </div>
        <span>{t('home.moreActivity')}</span>
      </div>
    </div>
  );
};
