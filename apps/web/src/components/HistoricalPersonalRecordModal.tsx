import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Scale,
  Calendar,
  X,
  Check,
  Award,
  Search,
  Sparkles,
  Info,
  AlertTriangle
} from 'lucide-react';
import {
  calculateEffectiveLoadKg,
  calculateSetOneRm,
  evaluateRelativeStrength,
  formatLocalWorkoutDateKey,
  isPlateLoadedMachine,
  isValidWorkoutDateKey,
  REP_CAP,
  resolveBodyweightKgAtDate,
  resolveExerciseLoadingProfile,
  resolveExerciseStrengthTarget,
  type BodyweightEntry,
  type Exercise,
  type Gender,
  type HistoricalPersonalRecord,
  type LoggedSet
} from '@light-weight/domain';
import { useI18n, useExerciseLabels } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, formatDisplayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { AppCard, Button, IconButton } from './ui/index.js';
import { WeightWidget } from './WeightWidget.js';
import { StrengthRankBadge } from './StrengthRankBadge.js';
import { KeyboardWeightInput, PlatePickerSheet, PlateWeightButton } from '../features/workouts/WeightEntry.js';
import type { PlateTarget } from '../features/workouts/WorkoutSessionComponents.js';

export interface HistoricalPersonalRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: Exercise[];
  bodyweightEntries?: BodyweightEntry[];
  currentBodyweightKg?: number | null;
  gender?: Gender | null;
  userId: string;
  onSave: (record: HistoricalPersonalRecord) => boolean | { ok: boolean } | Promise<boolean | { ok: boolean }>;
}

type ModalStep = 1 | 2 | 3 | 4 | 5;

export const HistoricalPersonalRecordModal: React.FC<HistoricalPersonalRecordModalProps> = ({
  isOpen,
  onClose,
  exercises,
  bodyweightEntries = [],
  currentBodyweightKg,
  gender,
  userId,
  onSave
}) => {
  const { t, locale } = useI18n();
  const { preferences } = usePreferences();
  const { muscleLabel } = useExerciseLabels();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const bodyweightUnit = WEIGHT_UNIT_PRESETS[preferences.bodyweightUnits].unit;

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalWorkoutDateKey(today), [today]);

  const [step, setStep] = useState<ModalStep>(1);
  const [performedDate, setPerformedDate] = useState<string>(todayKey);
  const [monthOffset, setMonthOffset] = useState<number>(0);

  // Step 2: Bodyweight Snapshot (in kg)
  const [bodyweightKg, setBodyweightKg] = useState<number>(() => {
    return resolveBodyweightKgAtDate(bodyweightEntries, todayKey) ?? currentBodyweightKg ?? 75;
  });

  // Step 3: Exercise
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string>('all');

  // Step 4: Single Working Set
  const [setWeightKg, setSetWeightKg] = useState<number>(60);
  const [setReps, setSetReps] = useState<number>(1);
  const [setRir, setSetRir] = useState<number | undefined>(undefined);
  const [plateTarget, setPlateTarget] = useState<PlateTarget | null>(null);

  // Step 5: Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setMonthOffset(0);
      const initialDate = todayKey;
      setPerformedDate(initialDate);
      const initBw = resolveBodyweightKgAtDate(bodyweightEntries, initialDate) ?? currentBodyweightKg ?? 75;
      setBodyweightKg(initBw);
      setSelectedExercise(null);
      setExerciseQuery('');
      setSelectedMuscleFilter('all');
      setSetWeightKg(60);
      setSetReps(1);
      setSetRir(undefined);
      setIsSaving(false);
      setSaveError(null);
    }
  }, [isOpen, todayKey, bodyweightEntries, currentBodyweightKg]);

  // When date changes, update suggested bodyweight snapshot if an entry exists for that date
  const handleSelectDate = (dateKey: string) => {
    if (dateKey > todayKey) return; // Future date blocked
    setPerformedDate(dateKey);
    const resolvedBw = resolveBodyweightKgAtDate(bodyweightEntries, dateKey);
    if (resolvedBw && resolvedBw > 0) {
      setBodyweightKg(resolvedBw);
    }
  };

  // Calendar calculations for Step 1
  const currentViewDate = useMemo(() => {
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [today, monthOffset]);

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();

  const monthTitle = useMemo(() => {
    const mName = currentViewDate.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'long' });
    const capitalized = mName.charAt(0).toUpperCase() + mName.slice(1);
    return `${capitalized} ${year}`;
  }, [currentViewDate, year, locale]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = Lun, ..., 6 = Dom
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ type: 'empty'; key: string } | {
      type: 'day';
      key: string;
      date: Date;
      iso: string;
      dayNum: number;
      isToday: boolean;
      isFuture: boolean;
      isSelected: boolean;
    }> = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ type: 'empty', key: `empty-${i}` });
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const iso = formatLocalWorkoutDateKey(d);
      const isToday = iso === todayKey;
      const isFuture = iso > todayKey;
      const isSelected = iso === performedDate;

      cells.push({
        type: 'day',
        key: `day-${dayNum}`,
        date: d,
        iso,
        dayNum,
        isToday,
        isFuture,
        isSelected
      });
    }

    return cells;
  }, [year, month, todayKey, performedDate]);

  // Exercises list for Step 3
  const filteredExercises = useMemo(() => {
    const q = exerciseQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      const matchesQuery = !q || ex.name.toLowerCase().includes(q);
      const matchesMuscle = selectedMuscleFilter === 'all' || ex.primaryMuscle === selectedMuscleFilter;
      return matchesQuery && matchesMuscle;
    });
  }, [exercises, exerciseQuery, selectedMuscleFilter]);

  // Loading profile and helper calculations for Step 4 & 5
  const loadingProfile = useMemo(() => {
    if (!selectedExercise) return null;
    return resolveExerciseLoadingProfile(selectedExercise).profile;
  }, [selectedExercise]);

  const isAssisted = loadingProfile?.loadMode === 'assisted';
  const isAddedWeight = loadingProfile?.loadMode === 'added_weight';

  const effectiveLoadKg = useMemo(() => {
    if (!selectedExercise) return setWeightKg;
    return calculateEffectiveLoadKg({
      exercise: selectedExercise,
      setWeightKg,
      bodyweightKg
    });
  }, [selectedExercise, setWeightKg, bodyweightKg]);

  const physicalSet = useMemo<LoggedSet>(() => {
    return {
      setIndex: 1,
      weightKg: setWeightKg,
      reps: setReps,
      rir: setRir,
      completed: true,
      setType: 'working',
      isWarmup: false
    };
  }, [setWeightKg, setReps, setRir]);

  const set1Rm = useMemo(() => {
    if (!selectedExercise) return null;
    return calculateSetOneRm(physicalSet, {
      exercise: selectedExercise,
      bodyweightKg,
      formula: 'average'
    });
  }, [selectedExercise, physicalSet, bodyweightKg]);

  const strengthEvaluation = useMemo(() => {
    if (!selectedExercise || !set1Rm || !gender || bodyweightKg <= 0) return null;
    const targetMuscle = resolveExerciseStrengthTarget(selectedExercise) ?? selectedExercise.primaryMuscle;
    return evaluateRelativeStrength(targetMuscle, set1Rm, bodyweightKg, gender);
  }, [selectedExercise, set1Rm, bodyweightKg, gender]);

  // Step 4 Validation
  const isSetValid = Number.isFinite(setWeightKg) && setWeightKg >= 0 &&
    Number.isInteger(setReps) && setReps >= 1 && setReps <= REP_CAP;

  const handleSavePr = async () => {
    if (!selectedExercise || !isSetValid || bodyweightKg <= 0 || !performedDate) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const record: HistoricalPersonalRecord = {
        id: crypto.randomUUID(),
        userId,
        exerciseId: selectedExercise.id,
        performedDate,
        recordedAt: new Date().toISOString(),
        bodyweightKg,
        set: physicalSet,
        source: 'historical_manual'
      };

      const result = await onSave(record);
      if (result === false || (typeof result === 'object' && result !== null && 'ok' in result && !result.ok)) {
        setSaveError(t('historicalPr.errorSave'));
        setIsSaving(false);
        return;
      }

      onClose();
    } catch (err) {
      console.error('Failed to save historical personal record', err);
      setSaveError(t('historicalPr.errorSave'));
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historical-pr-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg dark-glass-card rounded-t-[28px] sm:rounded-[28px] border border-white/[0.08] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 select-none max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Handle bar on mobile */}
        <div className="w-10 h-1 bg-zinc-600/80 rounded-full mx-auto -mt-1 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Award className="size-5 text-accent" />
            <h2 id="historical-pr-modal-title" className="text-base sm:text-lg font-black tracking-tight text-text-primary">
              {t('historicalPr.title')}
            </h2>
          </div>
          <IconButton
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="size-4" />
          </IconButton>
        </div>

        {/* Step Progress Indicator */}
        <div className="flex items-center justify-between px-1 shrink-0">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-6 bg-accent'
                    : s < step
                    ? 'w-3 bg-accent/40'
                    : 'w-2 bg-white/10'
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-xs text-text-muted font-bold">
            {step === 1 && t('historicalPr.stepDate')}
            {step === 2 && t('historicalPr.stepWeight')}
            {step === 3 && t('historicalPr.stepExercise')}
            {step === 4 && t('historicalPr.stepSet')}
            {step === 5 && t('historicalPr.stepReview')}
            {' '}({step}/5)
          </span>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-0.5">
          {/* STEP 1: DATE PICKER */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                {t('historicalPr.dateSubtitle')}
              </p>

              {/* Month Navigation */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setMonthOffset((prev) => prev - 1)}
                  aria-label="Mes anterior"
                  className="glass-subcard flex size-10 items-center justify-center rounded-full text-zinc-300 transition-all hover:border-white/20 active:scale-[0.96]"
                >
                  <ChevronLeft className="size-4" />
                </button>

                <div className="text-center">
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    {monthTitle}
                  </h3>
                </div>

                <button
                  type="button"
                  disabled={monthOffset >= 0}
                  onClick={() => setMonthOffset((prev) => prev + 1)}
                  aria-label="Mes siguiente"
                  className={`glass-subcard flex size-10 items-center justify-center rounded-full text-zinc-300 transition-all hover:border-white/20 active:scale-[0.96] ${
                    monthOffset >= 0 ? 'opacity-30 cursor-not-allowed' : ''
                  }`}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-zinc-400 font-bold uppercase tracking-wider py-1 border-b border-white/[0.06]">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell) => {
                  if (cell.type === 'empty') {
                    return <div key={cell.key} className="h-10" />;
                  }

                  const { iso, dayNum, isToday, isFuture, isSelected } = cell;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={isFuture}
                      onClick={() => handleSelectDate(iso)}
                      className={`h-10 rounded-xl font-mono text-sm font-bold flex flex-col items-center justify-center relative transition-all ${
                        isFuture
                          ? 'opacity-20 cursor-not-allowed text-zinc-600'
                          : isSelected
                          ? 'bg-accent text-accent-fg shadow-lg shadow-accent/25 scale-105 z-10'
                          : isToday
                          ? 'border border-accent/40 text-accent hover:bg-white/5'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{dayNum}</span>
                      {isToday && !isSelected && (
                        <span className="size-1 rounded-full bg-accent absolute bottom-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected date confirmation banner */}
              <div className="rounded-xl border border-border-subtle bg-surface-input p-3 flex items-center justify-between text-xs">
                <span className="text-text-muted">{t('historicalPr.stepDate')}:</span>
                <span className="font-mono font-bold text-accent">{performedDate}</span>
              </div>
            </div>
          )}

          {/* STEP 2: BODYWEIGHT SNAPSHOT */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                {t('historicalPr.weightSubtitle')}
              </p>

              <div className="rounded-2xl border border-border-subtle bg-surface-card p-4 flex flex-col items-center justify-center">
                <WeightWidget
                  value={displayWeight(bodyweightKg, preferences.bodyweightUnits)}
                  unit={bodyweightUnit as 'kg' | 'lb'}
                  label={t('historicalPr.stepWeight')}
                  locale={locale}
                  icon="scale"
                  onChange={(val) => {
                    setBodyweightKg(parseDisplayWeight(val, preferences.bodyweightUnits));
                  }}
                />
              </div>

              {resolveBodyweightKgAtDate(bodyweightEntries, performedDate) ? (
                <div className="flex items-center gap-2 rounded-xl bg-accent-soft border border-accent/20 p-2.5 text-xs text-accent">
                  <Check className="size-4 shrink-0" />
                  <span>
                    {locale === 'es'
                      ? `Precargado desde tu registro de peso del ${performedDate}.`
                      : `Prefilled from your weight entry on ${performedDate}.`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-border-subtle p-2.5 text-xs text-text-muted">
                  <Info className="size-4 shrink-0 text-text-muted" />
                  <span>
                    {locale === 'es'
                      ? 'Sin pesaje exacto registrado ese día. Ajusta al valor que tenías entonces.'
                      : 'No exact weigh-in found for this date. Adjust to your bodyweight at that time.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: EXERCISE PICKER */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                {t('historicalPr.exerciseSubtitle')}
              </p>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={exerciseQuery}
                  onChange={(e) => setExerciseQuery(e.target.value)}
                  placeholder={locale === 'es' ? 'Buscar ejercicio…' : 'Search exercise…'}
                  className="w-full h-11 pl-9 pr-3 rounded-ui-lg border border-border-subtle bg-surface-input text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>

              {/* Muscle group pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMuscleFilter(m)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                      selectedMuscleFilter === m
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface-input text-text-muted border border-border-subtle hover:text-text-primary'
                    }`}
                  >
                    {m === 'all'
                      ? (locale === 'es' ? 'Todos' : 'All')
                      : muscleLabel(m as any)}
                  </button>
                ))}
              </div>

              {/* Exercise List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {filteredExercises.length === 0 ? (
                  <div className="p-6 text-center text-xs text-text-muted">
                    {locale === 'es' ? 'No se encontraron ejercicios.' : 'No exercises found.'}
                  </div>
                ) : (
                  filteredExercises.map((exercise) => {
                    const isSelected = selectedExercise?.id === exercise.id;
                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => {
                          setSelectedExercise(exercise);
                          setStep(4); // Immediately advance to Step 4
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-ui-lg border text-left transition-all ${
                          isSelected
                            ? 'border-accent bg-accent-soft'
                            : 'border-border-subtle bg-surface-input hover:border-border-active'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-sm font-bold text-text-primary truncate">
                            {exercise.name}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {muscleLabel(exercise.primaryMuscle)} · {exercise.category}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-text-muted shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STEP 4: SINGLE WORKING SET */}
          {step === 4 && selectedExercise && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border-subtle bg-surface-input p-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-text-primary">{selectedExercise.name}</h4>
                  <p className="text-xs text-text-muted mt-0.5">
                    {muscleLabel(selectedExercise.primaryMuscle)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-xs font-bold text-accent hover:underline"
                >
                  {t('historicalPr.modify')}
                </button>
              </div>

              {/* Help message for bodyweight added/assisted load modes */}
              {isAddedWeight && (
                <div className="rounded-xl bg-accent-soft border border-accent/20 p-2.5 text-xs text-accent">
                  {t('historicalPr.addedWeightHelp')}
                </div>
              )}
              {isAssisted && (
                <div className="rounded-xl bg-accent-soft border border-accent/20 p-2.5 text-xs text-accent">
                  {t('historicalPr.assistedWeightHelp')}
                </div>
              )}

              {/* Inputs: Weight & Reps */}
              <div className="grid grid-cols-2 gap-3">
                {/* Weight Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                    {t('historicalPr.weight')} ({weightUnit})
                  </label>
                  {preferences.weightInputMode === 'plates' && loadingProfile?.supportsPlates ? (
                    <PlateWeightButton
                      valueKg={setWeightKg}
                      units={preferences.units}
                      label={t('historicalPr.weight')}
                      prefix={isAddedWeight ? '+' : isAssisted ? '-' : undefined}
                      onClick={() => {
                        setPlateTarget({
                          exerciseId: selectedExercise.id,
                          setIndex: 1,
                          valueKg: setWeightKg,
                          includeBarWeight: loadingProfile.includeBarWeight,
                          allowBarToggle: true,
                          baseWeightKg: 0,
                          loading: loadingProfile
                        });
                      }}
                    />
                  ) : (
                    <KeyboardWeightInput
                      valueKg={setWeightKg}
                      units={preferences.units}
                      label={t('historicalPr.weight')}
                      prefix={isAddedWeight ? '+' : isAssisted ? '-' : undefined}
                      onChange={setSetWeightKg}
                    />
                  )}
                </div>

                {/* Reps Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                    {t('historicalPr.reps')} (1–12)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSetReps((r) => Math.max(1, r - 1))}
                      className="size-11 rounded-ui-md border border-border-subtle bg-surface-input flex items-center justify-center font-mono font-bold text-lg text-text-primary hover:bg-surface-active shrink-0"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={setReps}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(parsed)) {
                          setSetReps(Math.min(REP_CAP, Math.max(1, parsed)));
                        } else if (e.target.value === '') {
                          setSetReps(1);
                        }
                      }}
                      className="h-11 w-full rounded-ui-md border border-border-subtle bg-surface-input text-center font-mono text-base font-bold text-text-primary focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSetReps((r) => Math.min(REP_CAP, r + 1))}
                      className="size-11 rounded-ui-md border border-border-subtle bg-surface-input flex items-center justify-center font-mono font-bold text-lg text-text-primary hover:bg-surface-active shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional RIR */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                  RIR ({locale === 'es' ? 'Opcional' : 'Optional'})
                </label>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { label: '—', val: undefined },
                    { label: '0', val: 0 },
                    { label: '1', val: 1 },
                    { label: '2', val: 2 },
                    { label: '3', val: 3 },
                    { label: '4', val: 4 }
                  ].map((item) => (
                    <button
                      key={String(item.val)}
                      type="button"
                      onClick={() => setSetRir(item.val)}
                      className={`flex-1 min-w-10 h-10 rounded-ui-md font-mono text-xs font-bold border transition-colors ${
                        setRir === item.val
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border-subtle bg-surface-input text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: RESULT REVIEW & SAVE */}
          {step === 5 && selectedExercise && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-surface-card p-4 space-y-4">
                {/* Exercise and Date Overview */}
                <div className="flex items-start justify-between border-b border-border-subtle pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-text-primary">
                      {selectedExercise.name}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {muscleLabel(selectedExercise.primaryMuscle)} · {performedDate}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs text-text-muted">
                    <span>BW: </span>
                    <span className="font-bold text-text-primary">{bodyweightKg} kg</span>
                  </div>
                </div>

                {/* Performance Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border-subtle bg-surface-input p-2.5">
                    <span className="text-text-muted block text-[10px] uppercase font-bold tracking-wider">
                      {locale === 'es' ? 'Serie realizada' : 'Performed set'}
                    </span>
                    <span className="font-mono text-sm font-black text-text-primary mt-0.5 block">
                      {formatDisplayWeight(setWeightKg, preferences.units)} × {setReps} reps
                      {setRir !== undefined && ` · RIR ${setRir}`}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border-subtle bg-surface-input p-2.5">
                    <span className="text-text-muted block text-[10px] uppercase font-bold tracking-wider">
                      {t('historicalPr.effectiveLoad')}
                    </span>
                    <span className="font-mono text-sm font-black text-text-primary mt-0.5 block">
                      {Math.round(effectiveLoadKg * 10) / 10} kg
                    </span>
                  </div>
                </div>

                {/* Breakdown for Added / Assisted movements */}
                {(isAddedWeight || isAssisted) && (
                  <p className="text-[11px] text-text-muted font-mono bg-surface-input/50 rounded-lg p-2 border border-border-subtle">
                    {isAddedWeight
                      ? `${bodyweightKg} kg (BW) + ${setWeightKg} kg = ${effectiveLoadKg} kg`
                      : `${bodyweightKg} kg (BW) - ${setWeightKg} kg = ${effectiveLoadKg} kg`}
                  </p>
                )}

                {/* 1RM and Strength Rank Card */}
                <div className="rounded-xl border border-accent/30 bg-accent-soft p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] uppercase font-bold tracking-wider text-accent block">
                        {setReps === 1 ? t('historicalPr.actualOneRm') : t('historicalPr.estimatedOneRm')}
                      </span>
                      <span className="font-mono text-2xl font-black text-text-primary">
                        {set1Rm ? (setReps === 1 ? `${set1Rm} kg` : `${Math.round(set1Rm * 10) / 10} kg`) : '—'}
                      </span>
                    </div>

                    {strengthEvaluation && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-text-muted block">
                          {t('historicalPr.relativeStrength')}
                        </span>
                        <span className="font-mono text-sm font-bold text-accent">
                          {(set1Rm! / bodyweightKg).toFixed(2)}×
                        </span>
                      </div>
                    )}
                  </div>

                  {strengthEvaluation ? (
                    <div className="pt-2 border-t border-accent/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StrengthRankBadge rank={strengthEvaluation.rank} size="sm" />
                      </div>
                      <span className="font-mono text-xs font-bold text-text-secondary">
                        {locale === 'es' ? 'Puntuación' : 'Score'}: {strengthEvaluation.strengthScore}/100
                      </span>
                    </div>
                  ) : !gender ? (
                    <p className="text-[11px] text-text-muted border-t border-accent/20 pt-2">
                      {locale === 'es'
                        ? 'Configura tu género en perfil para calcular tu nivel de fuerza.'
                        : 'Configure your gender in profile to evaluate strength rank.'}
                    </p>
                  ) : null}
                </div>
              </div>

              {saveError && (
                <div className="rounded-xl bg-danger-soft border border-danger/30 p-3 text-xs text-danger flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="flex items-center gap-2 pt-2 border-t border-border-subtle shrink-0">
          {step > 1 && (
            <Button
              variant="secondary"
              onClick={() => setStep((s) => (s - 1) as ModalStep)}
              className="flex-1"
            >
              {t('historicalPr.back')}
            </Button>
          )}

          {step === 1 && (
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              className="w-full"
            >
              {t('historicalPr.next')}
            </Button>
          )}

          {step === 2 && (
            <Button
              variant="primary"
              disabled={bodyweightKg <= 0}
              onClick={() => setStep(3)}
              className="flex-1"
            >
              {t('historicalPr.next')}
            </Button>
          )}

          {step === 4 && (
            <Button
              variant="primary"
              disabled={!isSetValid}
              onClick={() => setStep(5)}
              className="flex-1"
            >
              {locale === 'es' ? 'Evaluar PR' : 'Evaluate PR'}
            </Button>
          )}

          {step === 5 && (
            <Button
              variant="primary"
              disabled={isSaving || !isSetValid}
              onClick={handleSavePr}
              className="flex-1"
            >
              {isSaving ? t('common.loading') : t('historicalPr.save')}
            </Button>
          )}
        </div>
      </div>

      {/* Plate Picker Sheet for Step 4 if opened */}
      {plateTarget && (
        <PlatePickerSheet
          open={Boolean(plateTarget)}
          onClose={() => setPlateTarget(null)}
          valueKg={setWeightKg}
          units={preferences.units}
          baseWeightKg={plateTarget.baseWeightKg}
          availablePlatesKg={preferences.availablePlatesKg}
          includeBarWeight={plateTarget.includeBarWeight}
          allowBarToggle={plateTarget.allowBarToggle}
          loading={plateTarget.loading}
          onApply={(valueKg) => {
            setSetWeightKg(valueKg);
            setPlateTarget(null);
          }}
        />
      )}
    </div>
  );
};
