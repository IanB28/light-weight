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
  type ExercisePerformanceHead,
  MuscleGroup,
  calculateWeeklyStreak,
  getWorkoutsThisWeek,
  formatLocalWorkoutDateKey,
  resolveWorkoutDateKey
} from '@light-weight/domain';
import {
  BodyweightEntry,
  WeeklySchedule,
  DAY_NUM_TO_WEEKDAY,
  getStoredUserInfo
} from '../lib/storage.js';
import { WeightTrackerCard } from '../components/WeightTrackerCard.js';
import { BodyweightModal } from '../components/BodyweightModal.js';
import { WorkoutFocusModal, WorkoutFocus } from '../components/WorkoutFocusModal.js';
import { DayDetailModal } from '../components/DayDetailModal.js';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal.js';
import { MonthCalendarModal } from '../components/MonthCalendarModal.js';
import { HistoricalWorkoutModal } from '../components/HistoricalWorkoutModal.js';
import { AppCard, AppLogo, Button, IconButton } from '../components/ui/index.js';
import { TranslationKey, useI18n } from '../lib/i18n.js';

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
  exercises?: import('@light-weight/domain').Exercise[];
  userId?: string;
  onSaveHistoricalWorkout?: (session: WorkoutSession) => boolean | void | Promise<boolean | void>;
  remoteExercisePerformanceHeads?: Record<string, ExercisePerformanceHead>;
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
  onOpenSettings,
  exercises = [],
  userId = 'local-anonymous',
  onSaveHistoricalWorkout,
  remoteExercisePerformanceHeads
}) => {
  const { locale, t } = useI18n();
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const storedName = userName || getStoredUserInfo().name;
  const effectiveUserName = !storedName || storedName === 'Atleta' ? t('profile.athlete') : storedName;

  // Modals state
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isBwModalOpen, setIsBwModalOpen] = useState(false);
  const [bwModalInitialMode, setBwModalInitialMode] = useState<'log' | 'goal'>('log');
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [selectedDaySource, setSelectedDaySource] = useState<'weekly' | 'month' | null>(null);
  const [inspectedSession, setInspectedSession] = useState<WorkoutSession | null>(null);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState(false);
  const [historicalDate, setHistoricalDate] = useState<Date | undefined>();
  const [historicalRoutineId, setHistoricalRoutineId] = useState<string | undefined>();
  const [isHistoricalOpen, setIsHistoricalOpen] = useState(false);

  // Keep the calendar dependency stable for all renders within the same local day.
  const todayKey = new Date().toDateString();
  const today = useMemo(() => new Date(todayKey), [todayKey]);
  const exercisesById = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises]
  );
  const rawDateStr = today.toLocaleDateString(locale, {
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

    const sessionsByDate: Record<string, WorkoutSession[]> = {};
    history.forEach((s) => {
      const dateKey = resolveWorkoutDateKey(s);
      (sessionsByDate[dateKey] ||= []).push(s);
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = formatLocalWorkoutDateKey(d);
      const dayOfWeekKey = DAY_NUM_TO_WEEKDAY[d.getDay()];
      const routineId = weeklySchedule[dayOfWeekKey];
      const routine = routineId ? routines.find((r) => r.id === routineId) : null;
      const completed = sessionsByDate[iso] || [];
      const isCurrentDay = d.toDateString() === today.toDateString();

      days.push({
        date: d,
        iso,
        dayOfWeekKey,
        dayShort: t(`weekday.${dayOfWeekKey}.short` as TranslationKey).slice(0, 2).toUpperCase(),
        dayNum: d.getDate(),
        isToday: isCurrentDay,
        completed: completed.length > 0,
        routine
      });
    }

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const startDay = monday.getDate();
    const endDay = sunday.getDate();
    const startMonth = monday.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
    const endMonth = sunday.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
    const dateRangeStr = startMonth === endMonth ? `${startDay} – ${endDay} ${endMonth}` : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
    const label = weekOffset === 0 ? t('home.thisWeek') : dateRangeStr;
    return { label, days };
  }, [today, weekOffset, history, weeklySchedule, routines, locale, t]);

  const latestWeightKg = useMemo(() => {
    if (!bodyweightEntries || bodyweightEntries.length === 0) return null;
    return bodyweightEntries[bodyweightEntries.length - 1]?.weightKg ?? null;
  }, [bodyweightEntries]);

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
    const sessionTitle = `${t('home.workoutPrefix')} ${focusName}`;
    onStartWorkout(undefined, sessionTitle, prefilterMuscles);
  };

  // Rutina asignada al día seleccionado en DayDetailModal
  const selectedDayInfo = useMemo(() => {
    if (!selectedDayDate) return null;
    const iso = formatLocalWorkoutDateKey(selectedDayDate);
    const dayOfWeekKey = DAY_NUM_TO_WEEKDAY[selectedDayDate.getDay()];
    const routineId = weeklySchedule[dayOfWeekKey];
    const scheduledRoutine = routineId ? routines.find((r) => r.id === routineId) : undefined;
    const completedSessions = history
      .filter((s) => resolveWorkoutDateKey(s) === iso)
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));

    return {
      date: selectedDayDate,
      dayOfWeekKey,
      scheduledRoutine,
      completedSessions
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
    <div className="space-y-section select-none">
      {/* 1. Header Homogéneo con Título, Fecha y Saludo Dedicado */}
      <ViewHeader
        title="LightWeight"
        leading={<AppLogo size={28} className="shrink-0" aria-hidden="true" />}
        subtitle={todayStr}
        greeting={
          <h2 className="min-w-0 break-words text-base font-semibold leading-snug text-text-primary sm:text-lg">
            {t('home.hello')} <span className="font-bold text-accent">{effectiveUserName}</span>
          </h2>
        }
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      {/* 2. Calendario semanal y decisión de hoy */}
      <AppCard className="space-y-3">
        {/* Navegación de semana con rango de fechas real */}
        <div className="flex min-w-0 items-center justify-between gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            aria-label={t('home.previousWeek')}
            title={t('home.previousWeek')}
          >
            <ChevronLeft className="size-4" />
          </IconButton>

          <span className="min-w-0 flex-1 text-center text-sm font-semibold leading-tight text-text-secondary">
            {weekDaysData.label}
          </span>

          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            aria-label={t('home.nextWeek')}
            title={t('home.nextWeek')}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>

        {/* Fila interactiva de los 7 Días */}
        <div className="grid grid-cols-7 gap-0.5 pt-0.5 text-center sm:gap-1">
          {weekDaysData.days.map((item, idx) => (
            <button
              type="button"
              key={idx}
              data-testid="home-week-day"
              onClick={() => {
                setSelectedDayDate(item.date);
                setSelectedDaySource('weekly');
              }}
              aria-label={`${item.dayShort} ${item.dayNum}${item.completed ? `, ${t('home.completed')}` : item.routine ? `, ${item.routine.name}` : `, ${t('home.rest')}`}`}
              aria-current={item.isToday ? 'date' : undefined}
              className="ui-focus-visible ui-pressable group flex min-h-11 min-w-0 flex-col items-center rounded-ui-md py-1 transition-[background-color,color,transform] duration-150 hover:bg-surface-active"
            >
              <span className="mb-1 text-[11px] font-semibold uppercase tracking-tight text-text-muted">
                {item.dayShort}
              </span>

              {item.isToday ? (
                <div className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-accent-fg">
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
                  <div className="size-1.5 rounded-full bg-accent" />
                ) : item.routine ? (
                  <div className="size-1.5 rounded-full border border-text-secondary" />
                ) : null}
              </div>
            </button>
          ))}
        </div>

        {/* La decisión principal del día vive dentro del calendario. */}
        <div className="glass-subcard space-y-3 rounded-ui-lg p-3.5 sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-ui-md border ${
                todayScheduledRoutine
                  ? 'border-accent/25 bg-accent-soft text-accent'
                  : 'border-border-subtle bg-surface-active text-text-muted'
              }`}
            >
              <Dumbbell className="size-5 stroke-[2.2]" />
            </div>

            <div className="min-w-0 flex-1">
              <span className="ui-caption block font-bold uppercase tracking-wide">
                {t('home.today')}
              </span>
              <span className="block break-words text-base font-bold leading-snug text-text-primary">
                {todayScheduledRoutine ? todayScheduledRoutine.name : t('home.restDay')}
              </span>
              <span className="ui-caption mt-1 block break-words">
                {todayScheduledRoutine
                  ? `${todayScheduledRoutine.exerciseIds.length} ${todayScheduledRoutine.exerciseIds.length === 1 ? t('library.exercise') : t('library.exercises')}`
                  : t('home.recovery')}
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
            {todayScheduledRoutine ? t('home.start') : t('home.trainAnyway')}
          </Button>
          {todayScheduledRoutine && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFocusModalOpen(true)}
              className="w-full text-text-secondary hover:text-text-primary"
            >
              {t('home.trainOther')}
            </Button>
          )}
        </div>
      </AppCard>

      {/* 4. Peso corporal */}
      <WeightTrackerCard
        entries={bodyweightEntries}
        targetWeight={targetWeight}
        onOpenLogModal={handleOpenLogWeight}
        onOpenGoalModal={handleOpenGoalWeight}
      />

      {/* 5. Consistencia semanal */}
      <button
        type="button"
        onClick={() => setIsMonthCalendarOpen(true)}
        aria-label={t('home.streak', { count: streakCount, unit: streakCount === 1 ? t('home.week') : t('home.weeks') })}
        className="glass-surface ui-interactive-surface ui-focus-visible ui-pressable flex min-h-16 w-full min-w-0 items-center justify-between gap-3 rounded-ui-xl border p-card-compact text-left transition-[border-color,transform] duration-150"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <Flame className="size-5 shrink-0 text-accent" />
            <h3 className="ui-card-title min-w-0 break-words text-text-primary">
              {t('home.streak', { count: streakCount, unit: streakCount === 1 ? t('home.week') : t('home.weeks') })}
            </h3>
          </div>
          <p className="ui-caption mt-1 break-words">
            {thisWeekSessions.length} / {plannedPerWeek} {t('home.thisWeek').toLocaleLowerCase()} · {history.length} {t('home.totalWorkouts')}
          </p>
        </div>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-input text-text-secondary">
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
        currentWeightKg={latestWeightKg}
        initialMode={bwModalInitialMode}
        onSaveWeight={onSaveBodyweight}
        onSaveGoal={onSaveTargetWeight}
      />

      {/* Modal: Calendario Mensual estilo openGym al pulsar la Racha */}
      <MonthCalendarModal
        isOpen={isMonthCalendarOpen}
        onClose={() => setIsMonthCalendarOpen(false)}
        history={history}
        exercisesById={exercisesById}
        bodyweightEntries={bodyweightEntries}
        weeklySchedule={weeklySchedule}
        routines={routines}
        onSelectDay={(date) => {
          setSelectedDayDate(date);
          setSelectedDaySource('month');
        }}
      />

      {/* Modal: Detalle del Día al pulsar en el Calendario */}
      {selectedDayInfo && (
        <DayDetailModal
          isOpen={Boolean(selectedDayDate)}
          onClose={() => {
            setSelectedDayDate(null);
            setSelectedDaySource(null);
          }}
          date={selectedDayInfo.date}
          completedSessions={selectedDayInfo.completedSessions}
          scheduledRoutine={selectedDayInfo.scheduledRoutine}
          availableRoutines={routines}
          onStartRoutine={(routineId) => onStartWorkout(routineId)}
          onStartFreeWorkout={() => setIsFocusModalOpen(true)}
          onAssignRoutine={handleAssignRoutineToDay}
          onViewSessionDetail={(session) => setInspectedSession(session)}
          onRegisterHistorical={
            selectedDaySource === 'weekly' &&
            selectedDayInfo.date.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() &&
            onSaveHistoricalWorkout
              ? (date, routineId) => {
                  setHistoricalDate(date);
                  setHistoricalRoutineId(routineId);
                  setIsHistoricalOpen(true);
                }
              : undefined
          }
        />
      )}

      {/* Modal: Detalle Completo de Sesión (para inspeccionar sets) */}
      <WorkoutDetailModal
        session={inspectedSession}
        onClose={() => setInspectedSession(null)}
        exercisesById={exercisesById}
        bodyweightEntries={bodyweightEntries}
      />
      {onSaveHistoricalWorkout && (
        <HistoricalWorkoutModal
          isOpen={isHistoricalOpen}
          onClose={() => {
            setIsHistoricalOpen(false);
            setHistoricalRoutineId(undefined);
          }}
          onSave={onSaveHistoricalWorkout}
          userId={userId}
          exercises={exercises}
          history={history}
          remoteExercisePerformanceHeads={remoteExercisePerformanceHeads}
          routines={routines}
          initialDate={historicalDate}
          initialRoutineId={historicalRoutineId}
        />
      )}

    </div>
  );
};
