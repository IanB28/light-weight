import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Check,
  Award,
  Info
} from 'lucide-react';
import {
  calculateEffectiveLoadKg,
  calculateSetOneRm,
  evaluateRelativeStrength,
  formatLocalWorkoutDateKey,
  REP_CAP,
  resolveBodyweightKgAtDate,
  resolveExerciseLoadingProfile,
  resolveExerciseStrengthTarget,
  poundsToKilograms,
  type BodyweightEntry,
  type Exercise,
  type Gender,
  type HistoricalPersonalRecord,
  type LoggedSet,
  type WorkoutSession
} from '@light-weight/domain';
import { useI18n, useExerciseLabels } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { displayWeight, formatDisplayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../lib/weight-units.js';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { deriveExerciseUsage, rankExerciseDiscovery } from '../lib/exercise-discovery.js';
import {
  type ExerciseEquipmentFilter,
  type ExerciseMuscleFilter,
  matchesExerciseFilters,
  normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { getStrengthRankVisual } from '../lib/strength-rank-visuals.js';
import {
  BottomSheet,
  Button,
  EmptyState,
  RirPicker,
  SearchInput
} from './ui/index.js';
import { ExerciseFilterControls } from './ExerciseFilterControls.js';
import { WeightWidget } from './WeightWidget.js';
import { StrengthRankBadge } from './StrengthRankBadge.js';
import { KeyboardWeightInput, PlatePickerSheet, PlateWeightButton } from '../features/workouts/WeightEntry.js';
import type { PlateTarget } from '../features/workouts/WorkoutSessionComponents.js';

export interface HistoricalPersonalRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: Exercise[];
  history?: WorkoutSession[];
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
  history = [],
  bodyweightEntries = [],
  currentBodyweightKg,
  gender,
  userId,
  onSave
}) => {
  const { t, locale } = useI18n();
  const { preferences } = usePreferences();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const weightUnit = WEIGHT_UNIT_PRESETS[preferences.units].unit;
  const bodyweightUnit = WEIGHT_UNIT_PRESETS[preferences.bodyweightUnits].unit;
  const weightStepKg = preferences.units === 'imperial' ? poundsToKilograms(5) : 2.5;

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalWorkoutDateKey(today), [today]);

  const [step, setStep] = useState<ModalStep>(1);
  const [performedDate, setPerformedDate] = useState<string>(todayKey);
  const [monthOffset, setMonthOffset] = useState<number>(0);

  // Step 2: Bodyweight Snapshot (in kg)
  const [bodyweightKg, setBodyweightKg] = useState<number>(() => {
    return resolveBodyweightKgAtDate(bodyweightEntries, todayKey) ?? currentBodyweightKg ?? 75;
  });

  // Step 3: Exercise Picker
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<ExerciseMuscleFilter>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<ExerciseEquipmentFilter>('all');
  const [visibleCount, setVisibleCount] = useState(50);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Single Working Set
  const [setWeightKg, setSetWeightKg] = useState<number>(60);
  const [setReps, setSetReps] = useState<number>(1);
  const [setRir, setSetRir] = useState<number | undefined>(undefined);
  const [plateTarget, setPlateTarget] = useState<PlateTarget | null>(null);
  const [weightInputModeOverride, setWeightInputModeOverride] = useState<'keyboard' | 'plates' | null>(null);

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
      setMuscleFilter('all');
      setEquipmentFilter('all');
      setVisibleCount(50);
      setSetWeightKg(60);
      setSetReps(1);
      setSetRir(undefined);
      setWeightInputModeOverride(null);
      setIsSaving(false);
      setSaveError(null);
    }
  }, [isOpen, todayKey, bodyweightEntries, currentBodyweightKg]);

  // Focus search input when navigating to Step 3
  useEffect(() => {
    if (step === 3) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [step]);

  // Reset pagination on search / filter changes
  useEffect(() => {
    setVisibleCount(50);
  }, [exerciseQuery, muscleFilter, equipmentFilter]);

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

  // Exercise filtering & ranking for Step 3 (reusing AddExerciseModal discovery engine)
  const normalizedQuery = useMemo(() => normalizeExerciseSearch(exerciseQuery), [exerciseQuery]);
  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => matchesExerciseFilters(ex, normalizedQuery, muscleFilter, equipmentFilter));
  }, [exercises, normalizedQuery, muscleFilter, equipmentFilter]);

  const exerciseUsage = useMemo(() => deriveExerciseUsage(history), [history]);
  const exerciseDiscovery = useMemo(() => {
    return normalizedQuery
      ? { featured: [], remaining: filteredExercises, featuredKind: null }
      : rankExerciseDiscovery(filteredExercises, exerciseUsage, muscleFilter);
  }, [filteredExercises, exerciseUsage, muscleFilter, normalizedQuery]);

  const orderedExercises = useMemo(() => {
    return [...exerciseDiscovery.featured, ...exerciseDiscovery.remaining];
  }, [exerciseDiscovery]);

  // Loading profile and helper calculations for Step 4 & 5
  const loadingProfile = useMemo(() => {
    if (!selectedExercise) return null;
    return resolveExerciseLoadingProfile(selectedExercise).profile;
  }, [selectedExercise]);

  const isAssisted = loadingProfile?.loadMode === 'assisted';
  const isAddedWeight = loadingProfile?.loadMode === 'added_weight';
  const hasBodyweightFactor = typeof loadingProfile?.bodyweightFactor === 'number' && loadingProfile.bodyweightFactor > 0;

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

  // Input mode in Step 4
  const activeWeightInputMode = useMemo(() => {
    if (!loadingProfile) return 'keyboard';
    if (loadingProfile.supportsPlates && !loadingProfile.supportsKeyboard) return 'plates';
    if (loadingProfile.supportsKeyboard && loadingProfile.supportsPlates) {
      return weightInputModeOverride || preferences.weightInputMode;
    }
    return 'keyboard';
  }, [loadingProfile, weightInputModeOverride, preferences.weightInputMode]);

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

  const stepTitle = useMemo(() => {
    switch (step) {
      case 1: return t('historicalPr.stepDate');
      case 2: return t('historicalPr.stepWeight');
      case 3: return t('historicalPr.stepExercise');
      case 4: return t('historicalPr.stepSet');
      case 5: return t('historicalPr.stepReview');
    }
  }, [step, t]);

  const stepSubtitle = useMemo(() => {
    switch (step) {
      case 1: return t('historicalPr.dateSubtitle');
      case 2: return t('historicalPr.bodyweightThatDay');
      case 3: return t('historicalPr.exerciseSubtitle');
      case 4: return t('historicalPr.setSubtitle');
      case 5: return t('historicalPr.title');
    }
  }, [step, t]);

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title={t('historicalPr.title')}
      className="sm:max-w-lg"
    >
      <div className="space-y-4">
        {/* Step Progress Indicator: Single compact segmented bar */}
        <div className="space-y-1.5 px-0.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-text-primary">{stepTitle}</span>
            <span className="font-mono text-text-muted">
              {t('historicalPr.stepOf', { current: step, total: 5 })}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  s <= step ? 'bg-accent' : 'bg-surface-input border border-border-subtle'
                }`}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: DATE PICKER */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              {stepSubtitle}
            </p>

            {/* Month Navigation */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => prev - 1)}
                aria-label="Mes anterior"
                className="glass-subcard flex size-10 items-center justify-center rounded-full text-text-primary transition-all hover:border-border-active active:scale-[0.96]"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div className="text-center">
                <h3 className="text-sm font-extrabold text-text-primary tracking-tight">
                  {monthTitle}
                </h3>
              </div>

              <button
                type="button"
                disabled={monthOffset >= 0}
                onClick={() => setMonthOffset((prev) => prev + 1)}
                aria-label="Mes siguiente"
                className={`glass-subcard flex size-10 items-center justify-center rounded-full text-text-primary transition-all hover:border-border-active active:scale-[0.96] ${
                  monthOffset >= 0 ? 'opacity-30 cursor-not-allowed' : ''
                }`}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-text-muted font-bold uppercase tracking-wider py-1 border-b border-border-subtle">
              {locale === 'es'
                ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)
                : ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
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
                        ? 'opacity-20 cursor-not-allowed text-text-muted'
                        : isSelected
                        ? 'bg-accent text-accent-fg shadow-lg shadow-accent/25 scale-105 z-10'
                        : isToday
                        ? 'border border-accent/40 text-accent hover:bg-surface-active'
                        : 'text-text-primary hover:bg-surface-active'
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
            <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-3 flex items-center justify-between text-xs">
              <span className="text-text-muted">{t('historicalPr.stepDate')}:</span>
              <span className="font-mono font-bold text-accent">{performedDate}</span>
            </div>

            {/* Action buttons */}
            <Button
              onClick={() => setStep(2)}
              className="w-full"
            >
              {t('historicalPr.next')}
            </Button>
          </div>
        )}

        {/* STEP 2: BODYWEIGHT SNAPSHOT */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              {stepSubtitle}
            </p>

            <div className="rounded-ui-xl border border-border-subtle bg-surface-card p-4 flex flex-col items-center justify-center">
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
              <div className="flex items-center gap-2 rounded-ui-lg bg-accent-soft border border-accent/20 p-2.5 text-xs text-accent">
                <Check className="size-4 shrink-0" />
                <span>
                  {t('historicalPr.prefilledWeight', { date: performedDate })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-ui-lg bg-surface-input border border-border-subtle p-2.5 text-xs text-text-muted">
                <Info className="size-4 shrink-0 text-text-muted" />
                <span>
                  {t('historicalPr.noWeighInFound')}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                {t('historicalPr.back')}
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="flex-1"
              >
                {t('historicalPr.next')}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: EXERCISE PICKER */}
        {step === 3 && (
          <div className="space-y-3">
            <SearchInput
              ref={searchInputRef}
              label={t('exercise.search')}
              placeholder={t('exercise.searchPlaceholder')}
              value={exerciseQuery}
              onChange={(e) => setExerciseQuery(e.target.value)}
            />

            <ExerciseFilterControls
              muscle={muscleFilter}
              equipment={equipmentFilter}
              onMuscleChange={setMuscleFilter}
              onEquipmentChange={setEquipmentFilter}
            />

            <p className="text-xs text-text-muted" aria-live="polite">
              {filteredExercises.length} {t('exercise.results').toLocaleLowerCase()}
            </p>

            {orderedExercises.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  compact
                  icon={<Dumbbell className="size-5" />}
                  title={t('exercise.none')}
                  description={t('exercise.noneDescription')}
                />
              </div>
            ) : (
              <div className="max-h-[46dvh] overflow-y-auto overscroll-contain pr-1 space-y-1">
                {orderedExercises.slice(0, visibleCount).map((exercise) => {
                  const isSelected = selectedExercise?.id === exercise.id;
                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => {
                        setSelectedExercise(exercise);
                        setStep(4); // Advance immediately to Step 4 on selection
                      }}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-ui-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isSelected
                          ? 'border border-accent bg-accent-soft'
                          : 'hover:bg-surface-active'
                      }`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted">
                        {getExerciseImgUrl(exercise) ? (
                          <img
                            src={getExerciseImgUrl(exercise) || ''}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Dumbbell className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-text-primary">
                          {exercise.name}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-text-muted" />
                    </button>
                  );
                })}

                {visibleCount < orderedExercises.length && (
                  <Button
                    variant="secondary"
                    onClick={() => setVisibleCount((count) => count + 50)}
                    className="mt-2 w-full"
                  >
                    {t('exercise.more')}
                  </Button>
                )}
              </div>
            )}

            <Button
              variant="secondary"
              onClick={() => setStep(2)}
              className="w-full mt-2"
            >
              {t('historicalPr.back')}
            </Button>
          </div>
        )}

        {/* STEP 4: SINGLE WORKING SET */}
        {step === 4 && selectedExercise && loadingProfile && (
          <div className="space-y-4">
            {/* Exercise Header Card */}
            <div className="flex items-center gap-3 rounded-ui-xl border border-border-subtle bg-surface-card p-3">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted">
                {getExerciseImgUrl(selectedExercise) ? (
                  <img
                    src={getExerciseImgUrl(selectedExercise) || ''}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Dumbbell className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-text-primary">
                  {selectedExercise.name}
                </h3>
                <p className="truncate text-xs text-text-muted">
                  {muscleLabel(selectedExercise.primaryMuscle)} · {equipmentLabel(selectedExercise.category)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-bold text-accent hover:underline shrink-0"
              >
                {t('historicalPr.modify')}
              </button>
            </div>

            {/* Set Table Container reusing WorkoutSessionComponents language */}
            <div className="glass-surface space-y-2.5 rounded-ui-xl border border-border-subtle p-3.5 shadow-card">
              {/* Mode switch / semantic badges */}
              {loadingProfile.supportsKeyboard && loadingProfile.supportsPlates && (
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {t('workout.weightMode')}
                  </span>
                  <div className="flex rounded-ui-md border border-border-subtle bg-surface-input p-0.5">
                    {(['keyboard', 'plates'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setWeightInputModeOverride(mode)}
                        className={`min-h-8 rounded-md px-2.5 text-[11px] font-bold transition-colors ${
                          activeWeightInputMode === mode
                            ? 'bg-accent text-accent-fg'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {mode === 'keyboard' ? t('workout.keyboard') : t('workout.plates')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isAddedWeight && (
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {t('historicalPr.additionalLoad')}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                    + {weightUnit.toUpperCase()}
                  </span>
                </div>
              )}

              {isAssisted && (
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {t('historicalPr.assistanceLoad')}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {t('workout.counterweight')}
                  </span>
                </div>
              )}

              {/* Table Column Header */}
              <div className="grid grid-cols-12 gap-1 px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted">
                <span className="col-span-5">
                  {isAssisted
                    ? t('historicalPr.assistanceLoad')
                    : isAddedWeight
                    ? t('historicalPr.additionalLoad')
                    : t('historicalPr.weight')}{' '}
                  ({preferences.units === 'imperial' ? 'LB' : 'KG'})
                </span>
                <span className="col-span-4">
                  {t('historicalPr.reps')} (1–12)
                </span>
                <span className="col-span-3">RIR</span>
              </div>

              {/* Single Set Row */}
              <div className="grid grid-cols-12 items-center gap-1.5 rounded-2xl p-1.5 glass-subcard">
                {/* Weight Column */}
                <div className="col-span-5 flex items-center justify-center gap-0.5">
                  {activeWeightInputMode === 'plates' ? (
                    <PlateWeightButton
                      valueKg={setWeightKg}
                      units={preferences.units}
                      prefix={isAssisted ? '-' : (isAddedWeight ? '+' : undefined)}
                      label={t('historicalPr.weight')}
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
                    <>
                      <button
                        type="button"
                        onClick={() => setSetWeightKg(Math.max(0, Math.round((setWeightKg - weightStepKg) * 100) / 100))}
                        aria-label={t('workout.reduceWeight', { set: 1 })}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary min-[390px]:flex"
                      >
                        —
                      </button>
                      <KeyboardWeightInput
                        valueKg={setWeightKg}
                        units={preferences.units}
                        prefix={isAssisted ? '-' : (isAddedWeight ? '+' : undefined)}
                        label={t('historicalPr.weight')}
                        onChange={setSetWeightKg}
                      />
                      <button
                        type="button"
                        onClick={() => setSetWeightKg(Math.round((setWeightKg + weightStepKg) * 100) / 100)}
                        aria-label={t('workout.increaseWeight', { set: 1 })}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary min-[390px]:flex"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>

                {/* Reps Column */}
                <div className="col-span-4 flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSetReps((r) => Math.max(1, r - 1))}
                    aria-label={t('workout.reduceReps', { set: 1 })}
                    className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary min-[390px]:flex"
                  >
                    —
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={REP_CAP}
                    step="1"
                    value={setReps}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed)) {
                        setSetReps(Math.min(REP_CAP, Math.max(1, parsed)));
                      }
                    }}
                    aria-label={t('workout.repsForSet', { set: 1 })}
                    className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-10"
                  />
                  <button
                    type="button"
                    onClick={() => setSetReps((r) => Math.min(REP_CAP, r + 1))}
                    aria-label={t('workout.increaseReps', { set: 1 })}
                    className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary min-[390px]:flex"
                  >
                    +
                  </button>
                </div>

                {/* RIR Column */}
                <div className="col-span-3 flex items-center justify-center">
                  <RirPicker
                    value={setRir}
                    onChange={setSetRir}
                    ariaLabel={t('workout.rirForSet', { set: 1 })}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setStep(3)}
                className="flex-1"
              >
                {t('historicalPr.back')}
              </Button>
              <Button
                onClick={() => setStep(5)}
                disabled={!isSetValid}
                className="flex-1"
              >
                {t('historicalPr.evaluatePr')}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: RESULT SCREEN REDESIGN */}
        {step === 5 && selectedExercise && (
          <div className="space-y-3 sm:space-y-4">
            <div className="rounded-ui-xl border border-border-subtle bg-surface-card p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              {/* Exercise and Date Overview */}
              <div className="flex items-center gap-3 border-b border-border-subtle pb-2.5 sm:pb-3">
                <span className="flex size-10 sm:size-11 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted">
                  {getExerciseImgUrl(selectedExercise) ? (
                    <img
                      src={getExerciseImgUrl(selectedExercise) || ''}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <Dumbbell className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-extrabold text-text-primary">
                    {selectedExercise.name}
                  </h3>
                  <p className="truncate text-xs text-text-muted">
                    {muscleLabel(selectedExercise.primaryMuscle)} · {performedDate}
                  </p>
                </div>
              </div>

              {/* Context Data: Levantamiento & Peso Corporal */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-2 sm:p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    {t('historicalPr.lifting')}
                  </span>
                  <span className="font-mono text-sm font-black text-text-primary mt-0.5 block">
                    {formatDisplayWeight(setWeightKg, preferences.units)} × {setReps}
                    {setRir !== undefined && ` · RIR ${setRir}`}
                  </span>
                </div>

                <div className="rounded-ui-lg border border-border-subtle bg-surface-input p-2 sm:p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    {t('historicalPr.bodyweight')}
                  </span>
                  <span className="font-mono text-sm font-black text-text-primary mt-0.5 block">
                    {bodyweightKg} kg
                  </span>
                </div>
              </div>

              {/* Load Breakdown: ONLY when bodyweightFactor is canonically defined */}
              {hasBodyweightFactor && (
                <div className="rounded-ui-lg border border-border-subtle bg-surface-input/60 p-2 sm:p-2.5 text-xs font-mono space-y-1">
                  <div className="flex justify-between text-text-muted">
                    <span>{t('historicalPr.bodyweight')}:</span>
                    <span>{bodyweightKg} kg</span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>{isAssisted ? t('historicalPr.assistanceLoad') : t('historicalPr.additionalLoad')}:</span>
                    <span>{isAssisted ? '-' : '+'}{formatDisplayWeight(setWeightKg, preferences.units)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-accent border-t border-border-subtle pt-1 mt-1">
                    <span>{t('historicalPr.effectiveLoad')}:</span>
                    <span>{Math.round(effectiveLoadKg * 10) / 10} kg</span>
                  </div>
                </div>
              )}

              {/* Visual Divider */}
              <div className="border-t border-border-subtle my-1 sm:my-2" />

              {/* Primary Metric: 1RM / 1RM Estimado */}
              <div className="text-center py-0.5 sm:py-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-accent block">
                  {setReps === 1 ? t('historicalPr.actualOneRm') : t('historicalPr.estimatedOneRm')}
                </span>
                <span className="font-mono text-2xl sm:text-4xl font-black text-text-primary tracking-tight">
                  {set1Rm ? `${Math.round(set1Rm * 10) / 10} kg` : '—'}
                </span>
              </div>

              {/* Secondary Metric: Relative Strength Ratio */}
              {set1Rm && bodyweightKg > 0 && (
                <div className="text-center pb-0.5 sm:pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    {t('historicalPr.relativeStrength')}
                  </span>
                  <span className="font-mono text-sm sm:text-base font-bold text-accent">
                    {(set1Rm / bodyweightKg).toFixed(2)}× BW
                  </span>
                </div>
              )}

              {/* Tertiary Metric: Strength Rank Presentation */}
              {strengthEvaluation && (
                <div className="rounded-ui-lg border border-accent/25 bg-accent-soft p-2.5 sm:p-3 flex items-center gap-3">
                  <StrengthRankBadge
                    rank={strengthEvaluation.rank}
                    size="lg"
                    showGlow
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-black text-text-primary tracking-tight">
                      {getStrengthRankVisual(strengthEvaluation.rank).name}
                    </h4>
                    {strengthEvaluation.nextRank && (
                      <div className="text-xs text-text-secondary mt-0.5 space-y-0.5">
                        <p>
                          {t('historicalPr.towardsRank', {
                            pct: Math.round(strengthEvaluation.progressPctToNextRank),
                            rank: getStrengthRankVisual(strengthEvaluation.nextRank).name
                          })}
                        </p>
                        {strengthEvaluation.kgToNextRank && (
                          <p className="font-mono text-accent">
                            {t('historicalPr.kgToNextRank', {
                              kg: Math.round(strengthEvaluation.kgToNextRank * 10) / 10
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Save Error Notice */}
              {saveError && (
                <div className="rounded-ui-lg border border-danger/40 bg-danger-soft p-3 text-xs text-danger font-medium">
                  {saveError}
                </div>
              )}
            </div>

            {/* Bottom Actions: [ Atrás ] [ Guardar PR ] */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setStep(4)}
                disabled={isSaving}
                className="flex-1"
              >
                {t('historicalPr.back')}
              </Button>
              <Button
                onClick={handleSavePr}
                loading={isSaving}
                className="flex-1"
              >
                {t('historicalPr.save')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Plate Picker Sheet */}
      {plateTarget && (
        <PlatePickerSheet
          open={Boolean(plateTarget)}
          onClose={() => setPlateTarget(null)}
          valueKg={plateTarget.valueKg}
          units={preferences.units}
          baseWeightKg={plateTarget.baseWeightKg}
          availablePlatesKg={preferences.availablePlatesKg}
          includeBarWeight={plateTarget.includeBarWeight}
          allowBarToggle={plateTarget.allowBarToggle}
          loading={plateTarget.loading}
          onApply={(weightKg) => {
            setSetWeightKg(weightKg);
            setPlateTarget(null);
          }}
        />
      )}
    </BottomSheet>
  );
};
