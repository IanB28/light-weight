import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Calendar,
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
import { MonthCalendarModal } from '../components/MonthCalendarModal.js';
import { AppCard, Button, IconButton } from '../components/ui/index.js';

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
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings
}) => {
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const effectiveUserName = userName || getStoredUserInfo().name || 'Atleta';

  // Modals state
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isBwModalOpen, setIsBwModalOpen] = useState(false);
  const [bwModalInitialMode, setBwModalInitialMode] = useState<'log' | 'goal'>('log');
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [inspectedSession, setInspectedSession] = useState<WorkoutSession | null>(null);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState(false);

  const today = new Date();
  const rawDateStr = today.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const todayStr = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);

  // Cálculo de racha de semanas consecutivas (algoritmo openGym)
  const streakCount = useMemo(() => {
    return calculateWeeklyStreak(history);
  }, [history]);

  // Sesiones de esta semana y meta semanal
  const thisWeekSessions = useMemo(() => {
    return getWorkoutsThisWeek(history);
  }, [history]);

  const plannedPerWeek = useMemo(() => {
    return Object.values(weeklySchedule).filter(Boolean).length;
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
    <div className="space-y-4 pb-28 max-w-md mx-auto select-none">
      {/* 1. Header Homogéneo con Título, Fecha y Saludo Dedicado */}
      <ViewHeader
        title="LightWeight"
        subtitle={todayStr}
        greeting={
          <h2 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
            Hola, <span className="text-accent font-extrabold">{effectiveUserName}</span>
          </h2>
        }
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      {/* 2. Tarjeta 1: Calendario Semanal + Rutina de Hoy (Dark Glassmorphism) */}
      <AppCard className="space-y-3.5">
        {/* Navegación de semana con rango de fechas real */}
        <div className="flex items-center justify-between px-1">
          <IconButton
            variant="ghost"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            aria-label="Ver semana anterior"
            title="Semana anterior"
          >
            <ChevronLeft className="size-4" />
          </IconButton>

          <span className="text-xs font-semibold tracking-wide text-text-secondary">
            {weekDaysData.label}
          </span>

          <IconButton
            variant="ghost"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            aria-label="Ver semana siguiente"
            title="Semana siguiente"
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>

        {/* Fila interactiva de los 7 Días */}
        <div className="grid grid-cols-7 gap-1 pt-0.5 text-center">
          {weekDaysData.days.map((item, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setSelectedDayDate(item.date)}
              aria-label={`${item.dayShort} ${item.dayNum}${item.completed ? ', entrenamiento completado' : item.routine ? `, rutina ${item.routine.name}` : ', descanso'}`}
              aria-current={item.isToday ? 'date' : undefined}
              className="group flex min-h-11 flex-col items-center rounded-ui-md py-1 transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="mb-1 text-[11px] font-semibold uppercase tracking-tight text-text-muted">
                {item.dayShort}
              </span>

              {item.isToday ? (
                <div className="w-8 h-8 rounded-full bg-accent text-accent-fg font-extrabold text-sm flex items-center justify-center shadow-[0_0_12px_var(--accent-glow)]">
                  {item.dayNum}
                </div>
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-text-secondary group-hover:text-text-primary">
                  {item.dayNum}
                </div>
              )}

              {/* Punto indicador de estado de entreno */}
              <div className="h-2 flex items-center justify-center mt-0.5">
                {item.completed ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent-glow)]" />
                ) : item.routine ? (
                  <div className="size-1.5 rounded-full bg-text-muted" />
                ) : null}
              </div>
            </button>
          ))}
        </div>

        {/* La decisión principal del día vive dentro del calendario. */}
        <div className="glass-subcard mt-1 space-y-3 rounded-ui-lg p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface-active text-accent shadow-sm">
              <Dumbbell className="size-5 stroke-[2.2]" />
            </div>

            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">
                HOY
              </span>
              <span className="block truncate text-base font-bold text-text-primary">
                {todayScheduledRoutine ? todayScheduledRoutine.name : 'Día de Descanso'}
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">
                {todayScheduledRoutine
                  ? `${todayScheduledRoutine.exerciseIds.length} ${todayScheduledRoutine.exerciseIds.length === 1 ? 'ejercicio' : 'ejercicios'}`
                  : 'Recuperación programada'}
              </span>
            </div>
          </div>

          <Button
            onClick={() => {
              if (todayScheduledRoutine) {
                onStartWorkout(todayScheduledRoutine.id);
              } else {
                setIsFocusModalOpen(true);
              }
            }}
            className="w-full"
          >
            {todayScheduledRoutine ? 'Empezar entrenamiento' : 'Entrenar de todos modos'}
          </Button>
          {todayScheduledRoutine && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFocusModalOpen(true)}
              className="w-full text-text-muted"
            >
              Entrenar otra cosa
            </Button>
          )}
        </div>
      </AppCard>

      {/* 4. Tarjeta 3: Peso Corporal (Dark Glassmorphism) */}
      <WeightTrackerCard
        entries={bodyweightEntries}
        targetWeight={targetWeight}
        onOpenLogModal={handleOpenLogWeight}
        onOpenGoalModal={handleOpenGoalWeight}
      />

      {/* 5. Tarjeta 4: Racha de Semanas (Dark Glassmorphism) */}
      <button
        type="button"
        onClick={() => setIsMonthCalendarOpen(true)}
        aria-label={`Abrir calendario de consistencia, racha de ${streakCount} ${streakCount === 1 ? 'semana' : 'semanas'}`}
        className="glass-surface flex min-h-11 w-full items-center justify-between rounded-ui-xl border border-border-subtle p-card text-left shadow-card transition-[transform,border-color] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div>
          <div className="flex items-center gap-2">
            <Flame className="size-5 text-accent" />
            <h3 className="text-base font-bold tracking-tight text-text-primary">
              racha de {streakCount} {streakCount === 1 ? 'semana' : 'semanas'}
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {thisWeekSessions.length} / {plannedPerWeek} esta semana · {history.length} entrenamientos en total
          </p>
        </div>

        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-active text-text-muted">
          <Calendar className="size-4 text-text-secondary" />
        </div>
      </button>

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

    </div>
  );
};
