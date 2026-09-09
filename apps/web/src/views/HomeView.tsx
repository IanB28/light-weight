import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Calendar,
  Zap,
  Flame
} from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader.js';
import {
  Routine,
  WorkoutSession,
  MuscleGroup,
  calculateWeeklyStreak,
  getWorkoutsThisWeek
} from '@light-weight/domain';
import {
  BodyweightEntry,
  WeeklySchedule,
  DAY_NUM_TO_WEEKDAY,
  WEEKDAY_NAMES_ES,
  getStoredUserInfo
} from '../lib/storage.js';
import { WeightTrackerCard } from '../components/WeightTrackerCard.js';
import { BodyweightModal } from '../components/BodyweightModal.js';
import { WorkoutFocusModal, WorkoutFocus } from '../components/WorkoutFocusModal.js';
import { DayDetailModal } from '../components/DayDetailModal.js';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal.js';
import { BackupModal } from '../components/BackupModal.js';
import { MonthCalendarModal } from '../components/MonthCalendarModal.js';

interface HomeViewProps {
  userName?: string;
  history?: WorkoutSession[];
  routines?: Routine[];
  weeklySchedule: WeeklySchedule;
  onUpdateWeeklySchedule: (schedule: WeeklySchedule) => void;
  bodyweightEntries: BodyweightEntry[];
  targetWeight: number | null;
  onSaveBodyweight: (weightKg: number, dateStr?: string) => void;
  onSaveTargetWeight: (targetKg: number) => void;
  onStartWorkout: (routineId?: string, sessionName?: string, prefilterMuscles?: MuscleGroup[]) => void;
  onNavigateToStats: () => void;
  onNavigateToPlan: () => void;
  onDataRestored?: () => void;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  userName,
  history = [],
  routines = [],
  weeklySchedule,
  onUpdateWeeklySchedule,
  bodyweightEntries,
  targetWeight,
  onSaveBodyweight,
  onSaveTargetWeight,
  onStartWorkout,
  onNavigateToStats,
  onNavigateToPlan,
  onDataRestored,
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings
}) => {
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const effectiveUserName = userName || getStoredUserInfo().name || 'Operador Demo';

  // Modals state
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isBwModalOpen, setIsBwModalOpen] = useState(false);
  const [bwModalInitialMode, setBwModalInitialMode] = useState<'log' | 'goal'>('log');
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [inspectedSession, setInspectedSession] = useState<WorkoutSession | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState(false);

  const today = new Date();
  // Formato openGym: "miércoles, 9 de septiembre" (lowercase)
  const todayStr = today.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).toLowerCase();

  // Cálculo de racha de semanas consecutivas (algoritmo openGym)
  const streakCount = useMemo(() => {
    return calculateWeeklyStreak(history);
  }, [history]);

  // Sesiones de esta semana y meta semanal
  const thisWeekSessions = useMemo(() => {
    return getWorkoutsThisWeek(history);
  }, [history]);

  const plannedPerWeek = useMemo(() => {
    return Object.values(weeklySchedule).filter(Boolean).length || 3;
  }, [weeklySchedule]);

  // Determinar qué rutina toca HOY
  const todayWeekDay = DAY_NUM_TO_WEEKDAY[today.getDay()];
  const todayScheduledRoutineId = weeklySchedule[todayWeekDay];
  const todayScheduledRoutine = useMemo(() => {
    if (!todayScheduledRoutineId) return null;
    return routines.find((r) => r.id === todayScheduledRoutineId) || null;
  }, [todayScheduledRoutineId, routines]);

  // Generar los 7 días de la semana según el weekOffset (Lunes a Domingo)
  const weekDaysData = useMemo(() => {
    const monday = new Date(today);
    const currentDay = (today.getDay() + 6) % 7; // 0 = Lunes, ..., 6 = Domingo
    monday.setDate(today.getDate() - currentDay + weekOffset * 7);

    const sessionsByDate: Record<string, WorkoutSession> = {};
    history.forEach((s) => {
      const dateKey = s.startedAt.slice(0, 10);
      sessionsByDate[dateKey] = s;
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dayOfWeekKey = DAY_NUM_TO_WEEKDAY[d.getDay()];
      const routineId = weeklySchedule[dayOfWeekKey];
      const routine = routineId ? routines.find((r) => r.id === routineId) : null;
      const completed = sessionsByDate[iso];
      const isCurrentDay = d.toDateString() === today.toDateString();

      days.push({
        date: d,
        iso,
        dayOfWeekKey,
        dayShort: WEEKDAY_NAMES_ES[dayOfWeekKey].short.slice(0, 2).toUpperCase(),
        dayNum: d.getDate(),
        isToday: isCurrentDay,
        completed: Boolean(completed),
        routine
      });
    }

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const startDay = monday.getDate();
    const endDay = sunday.getDate();
    const startMonth = monday.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    const endMonth = sunday.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    const dateRangeStr = startMonth === endMonth ? `${startDay} – ${endDay} ${endMonth}` : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
    const label = weekOffset === 0 ? 'Esta semana' : dateRangeStr;
    return { label, days };
  }, [today, weekOffset, history, weeklySchedule, routines]);

  // Modales de peso
  const handleOpenLogWeight = () => {
    setBwModalInitialMode('log');
    setIsBwModalOpen(true);
  };

  const handleOpenGoalWeight = () => {
    setBwModalInitialMode('goal');
    setIsBwModalOpen(true);
  };

  // Manejador al elegir enfoque en el modal "¿Qué harás hoy?"
  const handleSelectFocus = (_focus: WorkoutFocus, focusName: string, prefilterMuscles: MuscleGroup[]) => {
    const sessionTitle = `Entrenamiento: ${focusName}`;
    onStartWorkout(undefined, sessionTitle, prefilterMuscles);
  };

  // Rutina asignada al día seleccionado en DayDetailModal
  const selectedDayInfo = useMemo(() => {
    if (!selectedDayDate) return null;
    const iso = selectedDayDate.toISOString().slice(0, 10);
    const dayOfWeekKey = DAY_NUM_TO_WEEKDAY[selectedDayDate.getDay()];
    const routineId = weeklySchedule[dayOfWeekKey];
    const scheduledRoutine = routineId ? routines.find((r) => r.id === routineId) : undefined;
    const completedSession = history.find((s) => s.startedAt.slice(0, 10) === iso);

    return {
      date: selectedDayDate,
      dayOfWeekKey,
      scheduledRoutine,
      completedSession
    };
  }, [selectedDayDate, weeklySchedule, routines, history]);

  const handleAssignRoutineToDay = (routineId: string | null) => {
    if (!selectedDayInfo) return;
    const updated = {
      ...weeklySchedule,
      [selectedDayInfo.dayOfWeekKey]: routineId
    };
    onUpdateWeeklySchedule(updated);
  };

  return (
    <div className="space-y-3.5 pb-28 max-w-md mx-auto select-none">
      {/* 1. Header Homogéneo */}
      <ViewHeader
        title="LightWeight"
        subtitle={
          <span>
            {todayStr} · Hola, <strong className="text-white font-bold">{effectiveUserName}</strong>
          </span>
        }
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings || (() => setIsBackupModalOpen(true))}
      />

      {/* 2. Tarjeta 1: Calendario Semanal + Rutina de Hoy (Dark Glassmorphism) */}
      <div className="p-5 dark-glass-card rounded-[28px] space-y-3.5 transition-all hover:border-white/15">
        {/* Navegación de semana con rango de fechas real */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 transition-all cursor-pointer"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-zinc-300 tracking-wide">
            {weekDaysData.label}
          </span>

          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 transition-all cursor-pointer"
            title="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Fila interactiva de los 7 Días */}
        <div className="grid grid-cols-7 gap-1 pt-0.5 text-center">
          {weekDaysData.days.map((item, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedDayDate(item.date)}
              className="flex flex-col items-center cursor-pointer group active:scale-90 transition-all py-1"
            >
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-tight mb-1">
                {item.dayShort}
              </span>

              {item.isToday ? (
                <div className="w-8 h-8 rounded-full bg-accent text-accent-fg font-extrabold text-sm flex items-center justify-center shadow-[0_0_12px_var(--accent-glow)]">
                  {item.dayNum}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-zinc-200 group-hover:text-white">
                  {item.dayNum}
                </div>
              )}

              {/* Punto indicador de estado de entreno */}
              <div className="h-2 flex items-center justify-center mt-0.5">
                {item.completed ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent-glow)]" />
                ) : item.routine ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Sub-tarjeta interior: HOY + Rutina Asignada + Botón Empezar (Vidrio sobre Vidrio) */}
        <div className="glass-subcard p-3.5 flex items-center justify-between mt-1 rounded-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-accent shadow-sm shrink-0">
              <Dumbbell className="w-5 h-5 stroke-[2.2]" />
            </div>

            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">
                HOY
              </span>
              <span className="text-white font-bold text-base block truncate">
                {todayScheduledRoutine ? todayScheduledRoutine.name : 'Día de Descanso'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (todayScheduledRoutine) {
                onStartWorkout(todayScheduledRoutine.id);
              } else {
                setIsFocusModalOpen(true);
              }
            }}
            className="bg-accent text-accent-fg hover:brightness-110 font-bold text-xs px-4 py-2 rounded-xl active:scale-95 transition-all cursor-pointer shrink-0 shadow-sm"
          >
            Empezar
          </button>
        </div>
      </div>

      {/* 3. Tarjeta 2: Sesión Inmediata ("¿Qué harás hoy?") */}
      <div
        onClick={() => setIsFocusModalOpen(true)}
        className="p-5 dark-glass-card rounded-[28px] flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all hover:border-white/20"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-accent shrink-0">
            <Zap className="w-5 h-5 fill-accent/20 text-accent" />
          </div>
          <div className="min-w-0">
            <span className="text-white font-bold text-sm block tracking-tight">
              Sesión Inmediata
            </span>
            <span className="text-zinc-400 text-xs block mt-0.5 truncate">
              ¿Qué harás hoy? · Push, Pull, Pierna, Glúteos...
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsFocusModalOpen(true);
          }}
          className="bg-accent text-accent-fg hover:brightness-110 font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          Comenzar
        </button>
      </div>

      {/* 4. Tarjeta 3: Peso Corporal (Dark Glassmorphism) */}
      <WeightTrackerCard
        entries={bodyweightEntries}
        targetWeight={targetWeight}
        onOpenLogModal={handleOpenLogWeight}
        onOpenGoalModal={handleOpenGoalWeight}
      />

      {/* 5. Tarjeta 4: Racha de Semanas (Dark Glassmorphism) */}
      <div
        onClick={() => setIsMonthCalendarOpen(true)}
        className="p-5 dark-glass-card rounded-[28px] flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all hover:border-white/20"
      >
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold text-white tracking-tight">
              racha de {streakCount} {streakCount === 1 ? 'semana' : 'semanas'}
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {thisWeekSessions.length} / {plannedPerWeek} esta semana · {history.length} entrenamientos en total
          </p>
        </div>

        <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-zinc-400 shrink-0">
          <Calendar className="w-4 h-4 text-zinc-300" />
        </div>
      </div>

      {/* Modal: Categorización de Sesión Inmediata ("¿Qué harás hoy?") */}
      <WorkoutFocusModal
        isOpen={isFocusModalOpen}
        onClose={() => setIsFocusModalOpen(false)}
        onSelectFocus={handleSelectFocus}
      />

      {/* Modal: Registrar Peso o Cambiar Meta */}
      <BodyweightModal
        isOpen={isBwModalOpen}
        onClose={() => setIsBwModalOpen(false)}
        currentGoal={targetWeight}
        initialMode={bwModalInitialMode}
        onSaveWeight={onSaveBodyweight}
        onSaveGoal={onSaveTargetWeight}
      />

      {/* Modal: Calendario Mensual estilo openGym al pulsar la Racha */}
      <MonthCalendarModal
        isOpen={isMonthCalendarOpen}
        onClose={() => setIsMonthCalendarOpen(false)}
        history={history}
        weeklySchedule={weeklySchedule}
        routines={routines}
        onSelectDay={(date) => setSelectedDayDate(date)}
      />

      {/* Modal: Detalle del Día al pulsar en el Calendario */}
      {selectedDayInfo && (
        <DayDetailModal
          isOpen={Boolean(selectedDayDate)}
          onClose={() => setSelectedDayDate(null)}
          date={selectedDayInfo.date}
          completedSession={selectedDayInfo.completedSession}
          scheduledRoutine={selectedDayInfo.scheduledRoutine}
          availableRoutines={routines}
          onStartRoutine={(routineId) => onStartWorkout(routineId)}
          onStartFreeWorkout={() => setIsFocusModalOpen(true)}
          onAssignRoutine={handleAssignRoutineToDay}
          onViewSessionDetail={(session) => setInspectedSession(session)}
        />
      )}

      {/* Modal: Detalle Completo de Sesión (para inspeccionar sets) */}
      <WorkoutDetailModal
        session={inspectedSession}
        onClose={() => setInspectedSession(null)}
      />

      {/* Modal: Ajustes y Respaldo de Datos */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataRestored={onDataRestored}
      />
    </div>
  );
};
