import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarPlus, ChevronRight, Dumbbell, Plus, X, AlertTriangle } from 'lucide-react';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  formatLocalWorkoutDateKey,
  isValidWorkoutSet,
  type Exercise,
  type MachineBaseSelection,
  type MachineSnapshot,
  type Routine,
  type WorkoutSession,
  type WorkoutSetType
} from '@light-weight/domain';
import { AddExerciseModal } from './AddExerciseModal.js';
import { PlatePickerSheet } from '../features/workouts/WeightEntry.js';
import { ExerciseMediaModal } from './ExerciseMediaModal.js';
import { ExerciseSessionCard, type PlateTarget } from '../features/workouts/WorkoutSessionComponents.js';
import { Button, Modal, OptionPicker } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { usePreferences } from '../lib/preferences-context.js';
import { buildWorkoutHistoryIndex } from '../lib/workout-history-index.js';
import { buildRoutinePickerOptions } from '../features/routines/routine-options.js';
import type { WeightInputMode } from '../lib/preferences.js';
import type { ActiveExerciseSession } from '../features/workouts/types.js';
import {
  createDefaultExerciseSession,
  buildRoutineExerciseSessions,
  updateSetInSessions,
  updateSetRirInSessions,
  toggleSetInSessions,
  addSetToSessions,
  removeSetFromSessions,
  applyPlateWeightInSessions,
  updateMachineProfileInSessions
} from '../features/workouts/useWorkoutSession.js';
import {
  createHistoricalWorkoutSessionFromActive,
  getLatestHistoricalDateKey,
  isStrictlyPastDateKey,
  isValidPerformedTime,
  isValidHistoricalDuration,
  HistoricalWorkoutValidationError
} from '../features/workouts/historical-workout.js';

interface HistoricalWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (session: WorkoutSession) => boolean | { ok: boolean; error?: string } | void | Promise<boolean | { ok: boolean; error?: string } | void>;
  userId: string;
  exercises: Exercise[];
  history: WorkoutSession[];
  routines: Routine[];
  initialDate?: Date;
  initialRoutineId?: string;
}

export function HistoricalWorkoutModal({
  isOpen,
  onClose,
  onSave,
  userId,
  exercises,
  history,
  routines,
  initialDate,
  initialRoutineId
}: HistoricalWorkoutModalProps) {
  const { t } = useI18n();
  const { preferences } = usePreferences();

  const exercisesById = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises]
  );

  const historyIndex = useMemo(
    () => buildWorkoutHistoryIndex(history, { exercisesById }),
    [history, exercisesById]
  );

  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const durationInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<'setup' | 'editor'>('setup');
  const [performedDate, setPerformedDate] = useState(() => getLatestHistoricalDateKey());
  const [performedTime, setPerformedTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [routineId, setRoutineId] = useState('');
  const [exerciseSessions, setExerciseSessions] = useState<ActiveExerciseSession[]>([]);
  const [editorDirty, setEditorDirty] = useState(false);

  // Sub-modal states
  const [plateTarget, setPlateTarget] = useState<PlateTarget | null>(null);
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null);
  const [showConfirmChangeRoutine, setShowConfirmChangeRoutine] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupErrors, setSetupErrors] = useState<{ performedDate?: string; performedTime?: string; duration?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialize draft when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const yesterdayKey = getLatestHistoricalDateKey();
    const candidateKey = initialDate ? formatLocalWorkoutDateKey(initialDate) : yesterdayKey;
    const initialKey = isStrictlyPastDateKey(candidateKey) ? candidateKey : yesterdayKey;
    setPerformedDate(initialKey);
    setPerformedTime('');
    setDurationMinutes('');
    setPhase('setup');
    setError(null);
    setSetupErrors({});
    setSaveError(null);
    setEditorDirty(false);

    if (initialRoutineId) {
      const routine = routines.find((r) => r.id === initialRoutineId);
      if (routine) {
        setRoutineId(routine.id);
        setRoutineName(routine.name);
        const sessions = buildRoutineExerciseSessions(
          routine,
          exercisesById,
          (ex) => createDefaultExerciseSession(ex, { historyIndex, preferences })
        );
        setExerciseSessions(sessions);
        return;
      }
    }

    setRoutineName('');
    setRoutineId('');
    setExerciseSessions([]);
  }, [initialDate, initialRoutineId, isOpen, routines, exercisesById, historyIndex, preferences]);

  const routinePickerOptions = useMemo(() => {
    return buildRoutinePickerOptions(routines, {
      emptyLabel: t('historical.noRoutine'),
      exerciseLabel: (count) => `${count} ${count === 1 ? t('library.exercise') : t('library.exercises')}`,
      variantLabel: (idx) => t('historical.variantLabel', { count: idx })
    });
  }, [routines, t]);

  const applyRoutineSelection = (selectedId: string) => {
    setRoutineId(selectedId);
    if (selectedId) {
      const routine = routines.find((r) => r.id === selectedId);
      if (routine) {
        setRoutineName(routine.name);
        const sessions = buildRoutineExerciseSessions(
          routine,
          exercisesById,
          (ex) => createDefaultExerciseSession(ex, { historyIndex, preferences })
        );
        setExerciseSessions(sessions);
      }
    } else {
      // Switched to "Sin rutina": clear routineId, user can keep or customize name
      if (!routineName.trim() || routines.some((r) => r.name === routineName)) {
        setRoutineName('');
      }
      setExerciseSessions([]);
    }
    setEditorDirty(false);
  };

  const handleRoutineSelect = (selectedId: string) => {
    if (selectedId === routineId) return;
    if (editorDirty) {
      setPendingRoutineId(selectedId);
      setShowConfirmChangeRoutine(true);
    } else {
      applyRoutineSelection(selectedId);
    }
  };

  const confirmRoutineChange = () => {
    if (pendingRoutineId !== null) {
      applyRoutineSelection(pendingRoutineId);
      setPendingRoutineId(null);
    }
    setEditorDirty(false);
    setShowConfirmChangeRoutine(false);
  };

  const handleAddExercise = (exercise: Exercise) => {
    setExerciseSessions((current) => {
      if (current.some((s) => s.exercise.id === exercise.id)) return current;
      const newSession = createDefaultExerciseSession(exercise, { historyIndex, preferences });
      return [...current, newSession];
    });
    setEditorDirty(true);
    setIsAddModalOpen(false);
    if (phase === 'setup') {
      if (isStrictlyPastDateKey(performedDate) && isValidPerformedTime(performedTime) && isValidHistoricalDuration(durationMinutes)) {
        setPhase('editor');
      }
    }
  };

  const handleRemoveExercise = (exerciseId: string) => {
    setExerciseSessions((current) => current.filter((s) => s.exercise.id !== exerciseId));
    setEditorDirty(true);
  };

  const handleUpdateSet = (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'rir' | 'setType', value: any) => {
    setEditorDirty(true);
    if (field === 'setType') {
      setExerciseSessions((current) => current.map((s) => s.exercise.id !== exerciseId ? s : {
        ...s,
        sets: s.sets.map((set) => set.setIndex === setIndex ? { ...set, setType: value, isWarmup: value === 'warmup' } : set)
      }));
      return;
    }
    setExerciseSessions((current) => updateSetInSessions(current, exerciseId, setIndex, field, value));
  };

  const handleUpdateSetRir = (exerciseId: string, setIndex: number, rir?: number) => {
    setEditorDirty(true);
    setExerciseSessions((current) => updateSetRirInSessions(current, exerciseId, setIndex, rir));
  };

  const handleToggleSet = (exerciseId: string, setIndex: number) => {
    setEditorDirty(true);
    setExerciseSessions((current) => toggleSetInSessions(current, exerciseId, setIndex).sessions);
  };

  const handleAddSet = (exerciseId: string, setType: WorkoutSetType = 'working') => {
    setEditorDirty(true);
    setExerciseSessions((current) => addSetToSessions(current, exerciseId, setType));
  };

  const handleRemoveSet = (exerciseId: string) => {
    setEditorDirty(true);
    setExerciseSessions((current) => removeSetFromSessions(current, exerciseId));
  };

  const handleUpdateWeightInputMode = (exerciseId: string, mode: WeightInputMode) => {
    setEditorDirty(true);
    setExerciseSessions((current) => current.map((s) => s.exercise.id === exerciseId ? { ...s, weightInputModeOverride: mode } : s));
  };

  const handleToggleAddedWeight = (exerciseId: string, enabled: boolean) => {
    setEditorDirty(true);
    setExerciseSessions((current) => current.map((s) => s.exercise.id === exerciseId ? { ...s, usesAddedWeight: enabled } : s));
  };

  const handleUpdateMachineProfile = (exerciseId: string, selection: MachineBaseSelection) => {
    setEditorDirty(true);
    setExerciseSessions((current) => updateMachineProfileInSessions(current, exerciseId, selection));
  };

  const handleApplyPlates = (valueKg: number, includeBarWeight: boolean, baseWeightKg: number, machineSnapshot?: MachineSnapshot) => {
    if (!plateTarget) return;
    setEditorDirty(true);
    setExerciseSessions((current) => applyPlateWeightInSessions(
      current,
      plateTarget.exerciseId,
      plateTarget.setIndex,
      valueKg,
      includeBarWeight,
      baseWeightKg,
      machineSnapshot
    ));
    setPlateTarget(null);
  };

  // Completion metrics
  const totalCompletedSets = useMemo(() => {
    return exerciseSessions.reduce((acc, session) => {
      if (session.skipped) return acc;
      return acc + session.sets.filter((s) => s.completed && isValidWorkoutSet(s)).length;
    }, 0);
  }, [exerciseSessions]);

  const hasValidCompletedSet = totalCompletedSets > 0;
  const isPastDate = isStrictlyPastDateKey(performedDate);
  const isValidTime = isValidPerformedTime(performedTime);
  const isValidDuration = isValidHistoricalDuration(durationMinutes);
  const canSave = Boolean(isPastDate && isValidTime && isValidDuration && hasValidCompletedSet);

  const handleProceedFromSetup = () => {
    const errors: { performedDate?: string; performedTime?: string; duration?: string } = {};

    if (!performedDate || !isStrictlyPastDateKey(performedDate)) {
      errors.performedDate = t('historical.invalidDate');
    }

    if (!performedTime) {
      errors.performedTime = t('historical.timeRequired');
    } else if (!isValidPerformedTime(performedTime)) {
      errors.performedTime = t('historical.invalidTime');
    }

    if (!isValidHistoricalDuration(durationMinutes)) {
      errors.duration = t('historical.invalidDuration');
    }

    if (Object.keys(errors).length > 0) {
      setSetupErrors(errors);
      if (errors.performedDate) {
        dateInputRef.current?.focus();
      } else if (errors.performedTime) {
        timeInputRef.current?.focus();
      } else if (errors.duration) {
        durationInputRef.current?.focus();
      }
      return;
    }

    setSetupErrors({});
    if (exerciseSessions.length === 0) {
      setIsAddModalOpen(true);
    } else {
      setPhase('editor');
    }
  };

  const handleSave = async () => {
    try {
      setSaveError(null);
      const session = createHistoricalWorkoutSessionFromActive({
        userId,
        routineId: routineId || undefined,
        performedDate,
        performedTime,
        durationMinutes: durationMinutes.trim() || undefined,
        routineName: routineName.trim() || undefined,
        exerciseSessions
      });
      const saveResult = await onSave(session);
      const isSuccess = typeof saveResult === 'boolean'
        ? saveResult
        : saveResult && typeof saveResult === 'object' && 'ok' in saveResult
          ? saveResult.ok
          : true;

      if (isSuccess) {
        onClose();
      } else {
        const errorMsg = (typeof saveResult === 'object' && saveResult && 'error' in saveResult && typeof saveResult.error === 'string')
          ? saveResult.error
          : t('historical.saveError');
        setSaveError(errorMsg);
      }
    } catch (cause) {
      setSaveError(cause instanceof HistoricalWorkoutValidationError ? t(`historical.error.${cause.code}` as any) : t('historical.saveError'));
    }
  };

  const handleRequestClose = () => {
    if (editorDirty || exerciseSessions.length > 0 || routineName.trim() || performedTime || durationMinutes.trim()) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="historical-modal-title"
          className="w-full max-w-md bg-app border border-border-subtle rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88dvh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        >
          {/* iOS Grab Handle */}
          <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mt-3 mb-1 sm:hidden shrink-0" />

          {/* Phase A: Setup Header */}
          {phase === 'setup' ? (
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border-subtle shrink-0">
              <div className="min-w-0 pr-3">
                <h2 id="historical-modal-title" className="text-lg font-extrabold text-text-primary truncate">
                  {t('historical.title')}
                </h2>
                <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                  {t('historical.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label={t('workout.discard')}
                className="flex size-11 shrink-0 items-center justify-center rounded-full glass-subcard text-text-muted transition-all hover:text-text-primary active:scale-[0.96]"
              >
                <X className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          ) : (
            /* Phase B: Editor Header */
            <div className="flex items-center justify-between px-3 sm:px-5 pt-3 pb-3 border-b border-border-subtle shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="flex items-center gap-1 rounded-ui-md px-2 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent-soft active:scale-[0.97] shrink-0"
                aria-label={t('historical.backToSetup')}
              >
                <ArrowLeft className="size-4" />
                <span>{t('historical.backToSetup')}</span>
              </button>
              <div className="min-w-0 flex-1 text-center px-1">
                <h2 id="historical-modal-title" className="text-sm font-extrabold text-text-primary truncate">
                  {routineName || t('historical.freeWorkout')}
                </h2>
                <p className="text-[11px] font-mono text-text-muted truncate">
                  {performedDate} · {performedTime}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label={t('workout.discard')}
                className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-full glass-subcard text-text-muted transition-all hover:text-text-primary active:scale-[0.96]"
              >
                <X className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          )}

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {phase === 'setup' ? (
              /* Phase A: Setup Content (Strictly no exercise cards or set rows) */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs font-bold text-text-secondary">
                    <div className="flex items-center justify-between">
                      <span>{t('historical.performedDate')}</span>
                      {setupErrors.performedDate && (
                        <span className="text-[11px] font-semibold text-danger">{setupErrors.performedDate}</span>
                      )}
                    </div>
                    <input
                      ref={dateInputRef}
                      type="date"
                      max={getLatestHistoricalDateKey()}
                      value={performedDate}
                      onChange={(e) => {
                        setPerformedDate(e.target.value);
                        if (setupErrors.performedDate) setSetupErrors((prev) => ({ ...prev, performedDate: undefined }));
                      }}
                      className={`h-11 w-full rounded-ui-lg border bg-surface-input px-3 text-text-primary focus:outline-none focus:ring-2 ${
                        setupErrors.performedDate ? 'border-danger focus:ring-danger' : 'border-border-subtle focus:ring-accent'
                      }`}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-bold text-text-secondary">
                    <div className="flex items-center justify-between">
                      <span>
                        {t('historical.performedTime')} <span className="text-accent">*</span>
                      </span>
                      {setupErrors.performedTime && (
                        <span className="text-[11px] font-semibold text-danger">{setupErrors.performedTime}</span>
                      )}
                    </div>
                    <input
                      ref={timeInputRef}
                      type="time"
                      value={performedTime}
                      onChange={(e) => {
                        setPerformedTime(e.target.value);
                        if (setupErrors.performedTime) setSetupErrors((prev) => ({ ...prev, performedTime: undefined }));
                      }}
                      className={`h-11 w-full rounded-ui-lg border bg-surface-input px-3 text-text-primary focus:outline-none focus:ring-2 ${
                        setupErrors.performedTime ? 'border-danger focus:ring-danger' : 'border-border-subtle focus:ring-accent'
                      }`}
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs font-bold text-text-secondary">
                    <span>{t('historical.sessionName')}</span>
                    <input
                      value={routineName}
                      maxLength={255}
                      onChange={(e) => setRoutineName(e.target.value)}
                      placeholder={t('historical.optionalPlaceholder')}
                      className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-bold text-text-secondary">
                    <div className="flex items-center justify-between">
                      <span>{t('historical.duration')}</span>
                      {setupErrors.duration && (
                        <span className="text-[11px] font-semibold text-danger">{setupErrors.duration}</span>
                      )}
                    </div>
                    <input
                      ref={durationInputRef}
                      inputMode="numeric"
                      value={durationMinutes}
                      onChange={(e) => {
                        setDurationMinutes(e.target.value);
                        if (setupErrors.duration) setSetupErrors((prev) => ({ ...prev, duration: undefined }));
                      }}
                      placeholder={t('historical.optionalPlaceholder')}
                      className={`h-11 w-full rounded-ui-lg border bg-surface-input px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 ${
                        setupErrors.duration ? 'border-danger focus:ring-danger' : 'border-border-subtle focus:ring-accent'
                      }`}
                    />
                  </label>
                </div>

                {routines.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-text-secondary">{t('historical.routine')}</span>
                    <OptionPicker
                      value={routineId}
                      options={routinePickerOptions}
                      onChange={handleRoutineSelect}
                      ariaLabel={t('historical.routine')}
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              /* Phase B: Shared Live Workout Editor Content */
              <div className="space-y-4">
                {exerciseSessions.length === 0 ? (
                  <div className="p-6 text-center space-y-3 rounded-ui-xl border border-dashed border-border-subtle bg-surface-input">
                    <Dumbbell className="size-8 text-text-muted mx-auto" />
                    <p className="text-sm font-bold text-text-primary">
                      {t('workout.emptyTitle')}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t('workout.emptyInactive')}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsAddModalOpen(true)}
                      className="mx-auto"
                    >
                      <Plus className="size-4" />
                      {t('historical.addExercise')}
                    </Button>
                  </div>
                ) : (
                  exerciseSessions.map((session, index) => (
                    <ExerciseSessionCard
                      key={session.exercise.id}
                      session={session}
                      exerciseIndex={index}
                      totalExercises={exerciseSessions.length}
                      preferences={preferences}
                      mode="historical"
                      onViewTechnique={(ex) => setSelectedMediaExercise(ex)}
                      onRemoveExercise={handleRemoveExercise}
                      onUpdateSet={handleUpdateSet}
                      onUpdateSetRir={handleUpdateSetRir}
                      onToggleSet={handleToggleSet}
                      onStartRestTimer={() => {}}
                      onOpenPlates={(target) => setPlateTarget(target)}
                      onAddSet={handleAddSet}
                      onRemoveSet={handleRemoveSet}
                      onUpdateWeightInputMode={handleUpdateWeightInputMode}
                      onToggleAddedWeight={handleToggleAddedWeight}
                      onUpdateMachineProfile={handleUpdateMachineProfile}
                    />
                  ))
                )}

                {exerciseSessions.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => setIsAddModalOpen(true)}
                    className="w-full border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"
                  >
                    <Plus className="size-4" />
                    {t('historical.addExercise')}
                  </Button>
                )}

                {error && (
                  <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Sticky Modal Footer */}
          <div className="p-4 border-t border-border-subtle bg-app/95 backdrop-blur-md shrink-0">
            {phase === 'setup' ? (
              <Button
                onClick={handleProceedFromSetup}
                className="w-full justify-center"
              >
                <span>{exerciseSessions.length > 0 ? t('historical.continueToExercises') : t('historical.addExerciseAndSets')}</span>
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <div className="space-y-2">
                {saveError && (
                  <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-2.5 text-xs font-semibold text-danger">
                    {saveError}
                  </p>
                )}
                <div className="text-xs text-text-muted px-1">
                  <span>
                    {totalCompletedSets === 1
                      ? t('historical.completedSetsCount_one')
                      : t('historical.completedSetsCount', { count: totalCompletedSets })}
                  </span>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="w-full"
                >
                  <CalendarPlus className="size-4" />
                  {t('historical.save')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      <AddExerciseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableExercises={exercises}
        history={history}
        onSelectExercise={handleAddExercise}
      />

      <PlatePickerSheet
        open={Boolean(plateTarget)}
        onClose={() => setPlateTarget(null)}
        valueKg={plateTarget?.valueKg || 0}
        units={preferences.units}
        baseWeightKg={plateTarget?.baseWeightKg || 0}
        availablePlatesKg={preferences.availablePlatesKg}
        includeBarWeight={plateTarget?.includeBarWeight ?? false}
        allowBarToggle={plateTarget?.allowBarToggle ?? false}
        loading={plateTarget?.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE}
        machineProfileId={plateTarget?.machineProfileId}
        machineStatus={plateTarget?.machineStatus}
        machineProfileLabel={plateTarget?.machineProfileLabel}
        machineBaseSourceLabel={plateTarget?.machineBaseSourceLabel}
        machineBaseSourceUrl={plateTarget?.machineBaseSourceUrl}
        machineManufacturer={plateTarget?.machineManufacturer}
        machineModel={plateTarget?.machineModel}
        onApply={handleApplyPlates}
      />

      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />

      {/* Confirm Routine Change Modal */}
      <Modal
        open={showConfirmChangeRoutine}
        onClose={() => setShowConfirmChangeRoutine(false)}
        title={t('historical.confirmChangeRoutineTitle')}
        description={t('historical.confirmChangeRoutine')}
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => setShowConfirmChangeRoutine(false)}>
            {t('workout.continue')}
          </Button>
          <Button variant="danger" onClick={confirmRoutineChange}>
            {t('workout.discard')}
          </Button>
        </div>
      </Modal>

      {/* Discard Draft Modal */}
      <Modal
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={t('historical.confirmDiscardDraftTitle')}
        description={t('historical.confirmDiscardDraftDesc')}
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
            {t('historical.continueEditing')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setShowDiscardConfirm(false);
              onClose();
            }}
          >
            {t('historical.discardDraft')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
