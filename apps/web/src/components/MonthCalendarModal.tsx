import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatLocalWorkoutDateKey, resolveWorkoutDateKey, shouldCountForVolume, type WorkoutSession, type Routine } from '@light-weight/domain';
import { WeeklySchedule, DAY_NUM_TO_WEEKDAY } from '../lib/storage.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';

interface MonthCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: WorkoutSession[];
  weeklySchedule: WeeklySchedule;
  routines: Routine[];
  onSelectDay: (date: Date) => void;
}

export const MonthCalendarModal: React.FC<MonthCalendarModalProps> = ({
  isOpen,
  onClose,
  history,
  weeklySchedule,
  routines,
  onSelectDay
}) => {
  const { preferences } = usePreferences();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const today = useMemo(() => new Date(), []);
  // monthOffset: 0 = mes actual, -1 = mes anterior, +1 = mes siguiente
  const [monthOffset, setMonthOffset] = useState<number>(0);

  const currentViewDate = useMemo(() => {
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [today, monthOffset]);

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();

  // Nombre del mes y año capitalizado (ej. "Septiembre 2026")
  const monthTitle = useMemo(() => {
    const mName = currentViewDate.toLocaleDateString('es-ES', { month: 'long' });
    const capitalized = mName.charAt(0).toUpperCase() + mName.slice(1);
    return `${capitalized} ${year}`;
  }, [currentViewDate, year]);

  // Sesiones de este mes
  const monthSessions = useMemo(() => {
    return history.filter((s) => {
      const [sessionYear, sessionMonth] = resolveWorkoutDateKey(s).split('-').map(Number);
      return sessionYear === year && sessionMonth === month;
    });
  }, [history, year, month]);

  // Estadísticas del mes calculadas dinámicamente
  const monthStats = useMemo(() => {
    const count = monthSessions.length;
    let totalMinutes = 0;
    let hasUnknownDuration = false;
    let totalVolumeKg = 0;

    monthSessions.forEach((s) => {
      if (s.startedAt && s.endedAt) {
        const diffMs = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
        if (diffMs > 0) {
          totalMinutes += Math.round(diffMs / 60000);
        }
      } else {
        hasUnknownDuration = true;
      }

      if (s.sets) {
        Object.values(s.sets).forEach((setArr) => {
          setArr.forEach((st) => {
            if (shouldCountForVolume(st)) {
              totalVolumeKg += st.weightKg * st.reps;
            }
          });
        });
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationStr = hasUnknownDuration ? '—' : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const volumeFormatted = displayWeight(totalVolumeKg, preferences.units).toLocaleString('es-ES', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });

    return {
      count,
      durationStr,
      volumeFormatted
    };
  }, [monthSessions, preferences.units]);

  // Matriz de días del mes para la cuadrícula
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = Lun, ..., 6 = Dom
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const sessionsByIso: Record<string, WorkoutSession[]> = {};
    history.forEach((s) => {
      const iso = resolveWorkoutDateKey(s);
      (sessionsByIso[iso] ||= []).push(s);
    });

    const cells: any[] = [];

    // Celdas vacías previas
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ type: 'empty', key: `empty-${i}` });
    }

    // Días del mes
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const iso = formatLocalWorkoutDateKey(d);
      const dayOfWeekKey = DAY_NUM_TO_WEEKDAY[d.getDay()];
      const routineId = weeklySchedule[dayOfWeekKey];
      const routine = routineId ? routines.find((r) => r.id === routineId) : null;
      const completedSessions = sessionsByIso[iso] || [];
      const isToday = d.toDateString() === today.toDateString();
      const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());

      let dotStatus: 'trained' | 'planned' | 'reprogrammed' | null = null;
      if (completedSessions.length > 0) {
        dotStatus = 'trained';
      } else if (routine) {
        if (isPast) {
          dotStatus = 'reprogrammed';
        } else {
          dotStatus = 'planned';
        }
      }

      cells.push({
        type: 'day',
        key: `day-${dayNum}`,
        date: d,
        iso,
        dayNum,
        isToday,
        isCompleted: completedSessions.length > 0,
        completedSessions,
        routine,
        dotStatus
      });
    }

    return cells;
  }, [year, month, today, history, weeklySchedule, routines]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      {/* Tap backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-labelledby="month-calendar-title" className="relative w-full max-w-md dark-glass-card rounded-t-[28px] sm:rounded-[28px] border border-white/[0.08] p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 select-none max-h-[92dvh] overflow-y-auto">
        {/* Handle bar */}
        <div className="w-10 h-1 bg-zinc-600/80 rounded-full mx-auto -mt-1 mb-2" />

        {/* Mes Header y Navegación */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setMonthOffset((prev) => prev - 1)}
            aria-label="Mes anterior"
            className="glass-subcard flex size-11 items-center justify-center rounded-full text-zinc-300 transition-all hover:border-white/20 active:scale-[0.96]"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h2 id="month-calendar-title" className="text-lg font-extrabold text-white tracking-tight font-sans">
              {monthTitle}
            </h2>
            <p className="text-xs text-zinc-400 font-normal mt-0.5">
              {monthStats.count} {monthStats.count === 1 ? 'entrenamiento' : 'entrenamientos'} · {monthStats.durationStr} · {monthStats.volumeFormatted} {weightUnit}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMonthOffset((prev) => prev + 1)}
            aria-label="Mes siguiente"
            className="glass-subcard flex size-11 items-center justify-center rounded-full text-zinc-300 transition-all hover:border-white/20 active:scale-[0.96]"
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Días de la semana header */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-zinc-400 font-bold uppercase tracking-wider py-1 border-b border-white/[0.06]">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        {/* Días del mes (Grid de 7 cols) */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {calendarDays.map((cell) => {
            if (cell.type === 'empty') {
              return <div key={cell.key} className="w-full aspect-square" />;
            }

            return (
              <div
                key={cell.key}
                onClick={() => {
                  if (cell.date) {
                    onSelectDay(cell.date);
                    onClose();
                  }
                }}
                className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center cursor-pointer active:scale-90 transition-all relative ${
                  cell.isToday
                    ? 'border-2 border-accent bg-accent/10 shadow-[0_0_12px_var(--accent-glow)]'
                    : cell.isCompleted
                    ? 'bg-accent/15 border border-accent/30 text-accent'
                    : 'glass-subcard text-zinc-300 hover:border-white/20'
                }`}
              >
                <span
                  className={`text-sm font-semibold tabular-nums leading-none ${
                    cell.isCompleted ? 'text-accent font-bold' : cell.isToday ? 'text-white font-bold' : 'text-zinc-200'
                  }`}
                >
                  {cell.dayNum}
                </span>

                {/* Indicador de punto inferior */}
                <div className="h-2 flex items-center justify-center mt-1">
                  {cell.dotStatus === 'trained' ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent-glow)]" />
                  ) : cell.dotStatus === 'reprogrammed' ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  ) : cell.dotStatus === 'planned' ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Leyenda de estados */}
        <div className="flex items-center justify-center gap-4 pt-2 text-[11px] text-zinc-400 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_4px_var(--accent-glow)]" />
            <span>Entrenado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span>Planificado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f97316]" />
            <span>Reprogramado</span>
          </div>
        </div>

        {/* Nota explicativa inferior */}
        <p className="text-[11px] text-zinc-500 text-center leading-relaxed px-2 pt-1">
          Toca un día entrenado para ver detalles · toca cualquier otro día para planificar
        </p>
      </div>
    </div>
  );
};
