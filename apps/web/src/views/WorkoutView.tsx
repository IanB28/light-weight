import React, { useState } from 'react';
import { X, Check, Plus, Trash2, Eye, Dumbbell, Disc3, ChevronDown } from 'lucide-react';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  estimateOneRm,
  normalizeWorkoutSetType,
  poundsToKilograms,
  resolveExerciseLoadingProfile,
  shouldCountForPersonalRecord,
  shouldCountForVolume,
  type Exercise,
  type ExerciseLoadingProfile,
  type LoggedSet,
  type MuscleGroup,
  type Routine,
  type WorkoutSetType
} from '@light-weight/domain';
import { AddExerciseModal } from '../components/AddExerciseModal.js';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { WorkoutSummaryModal, CompletedWorkoutSummary } from '../components/WorkoutSummaryModal.js';
import { AppCard, Button, EmptyState, IconButton, Modal } from '../components/ui/index.js';
import { AppPreferences, WeightInputMode } from '../lib/preferences.js';
import { KeyboardWeightInput, PlatePickerSheet, PlateWeightButton } from '../features/workouts/WeightEntry.js';
import { useExerciseLabels, useI18n } from '../lib/i18n.js';
import { formatDisplayWeight } from '../lib/weight-units.js';

export interface ActiveExerciseSession {
  exercise: Exercise;
  previousRecord?: string;
  bestRecord?: string;
  bestEst1Rm?: number;
  targetRepRange: [number, number];
  weightInputModeOverride?: WeightInputMode;
  usesAddedWeight?: boolean;
  includeBarWeight?: boolean;
  sets: (LoggedSet & { rir?: number })[];
}

interface WorkoutViewProps {
  isWorkoutActive: boolean;
  routines: Routine[];
  routineName: string;
  sessionDuration: string;
  exerciseSessions: ActiveExerciseSession[];
  availableExercises: Exercise[];
  history: import('@light-weight/domain').WorkoutSession[];
  onToggleSet: (exerciseId: string, setIndex: number) => void;
  onUpdateSet: (
    exerciseId: string,
    setIndex: number,
    field: 'weightKg' | 'reps' | 'rir',
    value: number
  ) => void;
  onAddSet: (exerciseId: string, setType?: WorkoutSetType) => void;
  onRemoveSet: (exerciseId: string) => void;
  onAddExercise: (exercise: Exercise) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onCreateCustomExercise: (name: string, muscle: MuscleGroup) => void;
  onFinishWorkout: () => void;
  onCancelWorkout: () => void;
  onStartRestTimer: (seconds: number) => void;
  onStartRoutine: (routineId: string) => void;
  preferences: AppPreferences;
  onUpdateWeightInputMode: (exerciseId: string, mode: WeightInputMode) => void;
  onToggleAddedWeight: (exerciseId: string, enabled: boolean) => void;
  onUpdateBarInclusion: (exerciseId: string, includeBarWeight: boolean) => void;
}

const getDefaultMuscleFilter = (routineName: string): string => {
  const lower = routineName.toLowerCase();
  if (lower.includes('push') || lower.includes('empuje')) return 'chest';
  if (lower.includes('pull') || lower.includes('jalón') || lower.includes('jalon')) return 'back';
  if (lower.includes('quad') || lower.includes('cuádricep') || lower.includes('cuadricep')) return 'quadriceps';
  if (lower.includes('glute') || lower.includes('glúteo')) return 'glutes';
  if (lower.includes('lower') || lower.includes('pierna')) return 'quadriceps';
  if (lower.includes('upper') || lower.includes('superior')) return 'chest';
  return 'all';
};

const isValidWorkoutSet = (set: LoggedSet): boolean => (
  Number.isFinite(set.weightKg) &&
  set.weightKg >= 0 &&
  Number.isFinite(set.reps) &&
  set.reps > 0
);

export const WorkoutView: React.FC<WorkoutViewProps> = ({
  isWorkoutActive,
  routines,
  routineName,
  sessionDuration,
  exerciseSessions,
  availableExercises,
  history,
  onToggleSet,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onAddExercise,
  onRemoveExercise,
  onCreateCustomExercise,
  onFinishWorkout,
  onCancelWorkout,
  onStartRestTimer,
  onStartRoutine,
  preferences,
  onUpdateWeightInputMode,
  onToggleAddedWeight,
  onUpdateBarInclusion
}) => {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);
  const [summaryData, setSummaryData] = useState<CompletedWorkoutSummary | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [plateTarget, setPlateTarget] = useState<{ exerciseId: string; setIndex: number; valueKg: number; includeBarWeight: boolean; allowBarToggle: boolean; loading: ExerciseLoadingProfile } | null>(null);
  const weightStepKg = preferences.units === 'imperial' ? poundsToKilograms(5) : 2.5;
  const displayRoutineName = routineName === 'Entrenamiento Libre' ? t('workout.freeWorkout') : routineName;

  const completedSetsCount = exerciseSessions.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed && isValidWorkoutSet(s)).length,
    0
  );
  const totalSetsCount = exerciseSessions.reduce((acc, ex) => acc + ex.sets.length, 0);

  const totalVolumeKg = exerciseSessions.reduce((total, ex) => {
    return (
      total +
      ex.sets
        .filter(shouldCountForVolume)
        .reduce((sum, s) => {
          const volume = s.weightKg * s.reps;
          return sum + (Number.isFinite(volume) && volume > 0 ? volume : 0);
        }, 0)
    );
  }, 0);

  const handleFinishClick = () => {
    if (completedSetsCount === 0) return;
    const newRecords: CompletedWorkoutSummary['newRecords'] = [];
    exerciseSessions.forEach((sess) => {
      const completed = sess.sets.filter((s) => shouldCountForPersonalRecord(s) && isValidWorkoutSet(s));
      const bestSet = completed.reduce<LoggedSet | null>((best, set) => {
        if (!best) return set;
        return estimateOneRm(set.weightKg, set.reps).average > estimateOneRm(best.weightKg, best.reps).average ? set : best;
      }, null);
      if (bestSet) {
        const est = estimateOneRm(bestSet.weightKg, bestSet.reps).average;
        if (est > (sess.bestEst1Rm || 0)) {
        newRecords.push({
          exerciseName: sess.exercise.name,
          weightKg: bestSet.weightKg,
          reps: bestSet.reps,
          estimatedOneRm: Math.round(est * 10) / 10,
        });
        }
      }
    });

    setSummaryData({
      routineName: displayRoutineName,
      durationFormatted: sessionDuration,
      totalVolumeKg,
      totalCompletedSets: completedSetsCount,
      newRecords: newRecords.slice(0, 3),
    });
  };

  return (
    <div className="space-y-4 pb-36">
      {/* openGym Workout Header */}
      {(isWorkoutActive || exerciseSessions.length > 0) && <div className="glass-surface sticky top-0 z-20 flex items-center justify-between rounded-ui-lg border border-border-subtle px-3 py-2.5 shadow-card">
        <IconButton
          variant="ghost"
          onClick={() => setShowDiscardConfirm(true)}
          aria-label={t('workout.discardSession')}
          title={t('workout.discardSession')}
        >
          <X className="size-4" />
        </IconButton>

        <div className="text-center">
          <h2 className="text-base font-extrabold tracking-tight text-text-primary">{displayRoutineName}</h2>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {sessionDuration} · <span className="text-accent">{completedSetsCount}/{totalSetsCount} {t('workout.sets')}</span> · <span className="font-bold text-text-secondary">{formatDisplayWeight(totalVolumeKg, preferences.units)}</span>
          </p>
        </div>

        <Button
          size="md"
          onClick={handleFinishClick}
          disabled={completedSetsCount === 0}
          className="rounded-full px-3 text-xs"
          title={t('workout.finishTitle')}
        >
          <Check className="size-4 stroke-[3]" />
          <span>{t('workout.finish')}</span>
        </Button>
      </div>}

      {/* Lista de Ejercicios */}
      {exerciseSessions.length === 0 ? (
        <AppCard className="space-y-4">
          <EmptyState
            icon={<Dumbbell className="size-5" />}
            title={t('workout.emptyTitle')}
            description={isWorkoutActive ? t('workout.emptyActive') : t('workout.emptyInactive')}
            actionLabel={t('exercise.add')}
            onAction={() => setIsAddModalOpen(true)}
          />
          {routines.length > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('workout.useRoutine')}</p>
              {routines.slice(0, 3).map((routine) => (
                <button key={routine.id} type="button" onClick={() => onStartRoutine(routine.id)} className="flex min-h-11 w-full items-center justify-between rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-sm font-bold text-text-primary hover:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span className="truncate">{routine.name}</span><span className="text-xs font-medium text-text-muted">{routine.exerciseIds.length} {routine.exerciseIds.length === 1 ? t('library.exercise') : t('library.exercises')}</span>
                </button>
              ))}
            </div>
          )}
        </AppCard>
      ) : (
        exerciseSessions.map((session, exIndex) => {
          const { exercise, sets, previousRecord, bestRecord } = session;
          const imgUrl = getExerciseImgUrl(exercise);
          const loading = resolveExerciseLoadingProfile(exercise).profile;
          const usesAddedWeight = loading.loadMode !== 'added_weight' || Boolean(session.usesAddedWeight);
          const weightInputMode = loading.supportsPlates && !loading.supportsKeyboard
            ? 'plates'
            : loading.supportsKeyboard && loading.supportsPlates
              ? (session.weightInputModeOverride || preferences.weightInputMode)
              : 'keyboard';

          return (
            <div key={exercise.id} className="space-y-3 pt-2">
              {/* Encabezado compacto: contexto, técnica y metadata sin acciones duplicadas. */}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMediaExercise(exercise)}
                  aria-label={t('workout.viewTechnique', { name: exercise.name })}
                  className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title={t('workout.viewTechnique', { name: exercise.name })}
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <Dumbbell className="size-6 text-text-muted stroke-[1.8]" />
                  )}
                  <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye className="size-4 text-accent" />
                  </div>
                </button>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex min-h-10 items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {t('workout.exercisePosition', { current: exIndex + 1, total: exerciseSessions.length })}
                    </span>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveExercise(exercise.id)}
                      aria-label={t('workout.removeExercise', { name: exercise.name })}
                      className="text-text-muted hover:text-danger"
                      title={t('workout.removeExercise', { name: exercise.name })}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>

                  <h3 className="truncate text-lg font-extrabold leading-tight tracking-tight text-text-primary">
                    {exercise.name}
                  </h3>

                  <div className="flex min-w-0 items-center justify-between gap-3 pt-0.5 text-xs">
                    <span className="min-w-0 truncate capitalize text-text-muted">
                      {muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}
                    </span>
                    {bestRecord && (
                      <span className="shrink-0 font-semibold text-amber-400">
                        PR {bestRecord}
                      </span>
                    )}
                  </div>

                  {/* Last time summary */}
                  {previousRecord && (
                    <p className="pt-0.5 font-mono text-[11px] leading-relaxed text-text-muted">
                      <span className="font-semibold text-text-secondary">{t('workout.previous')}</span> {previousRecord}
                    </p>
                  )}
                </div>
              </div>

              {/* openGym Table: WEIGHT (KG) | REPS | RIR | CHECK */}
              <div className="glass-surface space-y-2 rounded-ui-xl border border-border-subtle p-3.5 shadow-card">
                {loading.supportsKeyboard && loading.supportsPlates && <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span>
                  <div className="flex rounded-ui-md border border-border-subtle bg-surface-input p-0.5" role="group" aria-label={t('workout.weightMode')}>
                    {(['keyboard', 'plates'] as const).map((mode) => <button key={mode} type="button" aria-pressed={weightInputMode === mode} onClick={() => onUpdateWeightInputMode(exercise.id, mode)} className={`min-h-9 rounded-md px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${weightInputMode === mode ? 'bg-accent text-accent-fg' : 'text-text-muted'}`}>{mode === 'keyboard' ? t('workout.keyboard') : t('workout.plates')}</button>)}
                  </div>
                </div>}
                {loading.supportsPlates && !loading.supportsKeyboard && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent"><Disc3 aria-hidden="true" className="size-4" />{t('workout.plates')}</span>
                </div>}
                {loading.loadMode === 'added_weight' && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.additionalWeight')}</span>
                  <button type="button" aria-pressed={usesAddedWeight} onClick={() => onToggleAddedWeight(exercise.id, !usesAddedWeight)} className={`min-h-9 rounded-ui-md border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${usesAddedWeight ? 'border-accent bg-accent-soft text-accent' : 'border-border-subtle bg-surface-input text-text-secondary'}`}>
                    {usesAddedWeight ? t('workout.additionalWeightActive') : t('workout.addWeight')}
                  </button>
                </div>}
                <div className="grid grid-cols-12 gap-1 px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">{t('workout.weight')} ({preferences.units === 'imperial' ? 'LB' : 'KG'})</span>
                  <span className="col-span-3">{t('workout.reps')}</span>
                  <span className="col-span-2">RIR</span>
                  <span className="col-span-2 flex justify-end pr-2"><Check className="w-3.5 h-3.5 text-accent" /></span>
                </div>

                {sets.map((set) => {
                  const canComplete = isValidWorkoutSet(set);
                  const setType = normalizeWorkoutSetType(set);
                  const setTypeLabel = setType === 'warmup'
                    ? t('workout.warmupSet')
                    : setType === 'drop'
                      ? t('workout.dropSet')
                      : setType === 'backoff'
                        ? t('workout.backoffSet')
                        : t('workout.workingSet');
                  const setMarker = setType === 'working' ? String(set.setIndex) : setType === 'warmup' ? 'C' : setType === 'drop' ? 'D' : 'B';
                  return (
                  <div
                    key={set.setIndex}
                    className={`grid grid-cols-12 items-center gap-1 rounded-2xl p-1.5 transition-[background-color,border-color] ${
                      set.completed ? 'bg-accent/15 border border-accent/25' : 'glass-subcard'
                    }`}
                  >
                    {/* Set Circle Badge */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span
                        aria-label={`${set.setIndex}: ${setTypeLabel}`}
                        title={setTypeLabel}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                          set.completed
                            ? 'bg-accent text-accent-fg'
                            : 'bg-surface-active text-text-muted'
                        }`}
                      >
                        {setMarker}
                      </span>
                    </div>

                    {/* Weight Controls con Input directo (- 82.5 +) */}
                    <div className="col-span-4 flex items-center justify-center gap-0.5">
                      {!usesAddedWeight ? (
                        <span aria-label={t('workout.bodyweightOnly')} className="flex h-11 w-full items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input font-mono text-xs font-bold text-text-muted">
                          BW
                        </span>
                      ) : (<>
                      {weightInputMode === 'keyboard' && <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'weightKg',
                            Math.max(0, Math.round((set.weightKg - weightStepKg) * 100) / 100)
                          )
                        }
                        aria-label={t('workout.reduceWeight', { set: set.setIndex })}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        —
                      </button>}
                      {weightInputMode === 'plates' ? <PlateWeightButton valueKg={set.weightKg} units={preferences.units} label={t('workout.weightForSet', { set: set.setIndex })} onClick={() => setPlateTarget({ exerciseId: exercise.id, setIndex: set.setIndex, valueKg: set.weightKg, includeBarWeight: session.includeBarWeight ?? loading.includeBarWeight, allowBarToggle: loading.includeBarWeight, loading })} /> : <KeyboardWeightInput valueKg={set.weightKg} units={preferences.units} label={t('workout.weightForSet', { set: set.setIndex })} onChange={(value) => onUpdateSet(exercise.id, set.setIndex, 'weightKg', value)} />}
                      {weightInputMode === 'keyboard' && <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'weightKg',
                            Math.round((set.weightKg + weightStepKg) * 100) / 100
                          )
                        }
                        aria-label={t('workout.increaseWeight', { set: set.setIndex })}
                        className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        +
                      </button>}
                      </>)}
                    </div>

                    {/* Reps Controls con Input directo (- 8 +) */}
                    <div className="col-span-3 flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            Math.max(1, set.reps - 1)
                          )
                        }
                        aria-label={t('workout.reduceReps', { set: set.setIndex })}
                        className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        —
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={set.reps === 0 ? '' : set.reps}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            isNaN(val) ? 0 : val
                          );
                        }}
                        aria-label={t('workout.repsForSet', { set: set.setIndex })}
                        className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-9"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(
                            exercise.id,
                            set.setIndex,
                            'reps',
                            set.reps + 1
                          )
                        }
                        aria-label={t('workout.increaseReps', { set: set.setIndex })}
                        className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex"
                      >
                        +
                      </button>
                    </div>

                    {/* A single full-height control avoids overlapping tap targets on narrow screens. */}
                    <div className="col-span-2 flex items-center justify-center">
                      <select
                        value={set.rir ?? 2}
                        onChange={(event) => onUpdateSet(exercise.id, set.setIndex, 'rir', Number(event.target.value))}
                        aria-label={t('workout.rirForSet', { set: set.setIndex })}
                        className="h-11 w-full min-w-0 rounded-ui-md border border-border-subtle bg-surface-input px-0 text-center font-mono text-xs font-bold text-text-secondary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                      >
                        {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>

                    {/* openGym Circle Checkmark (dispara descanso) */}
                    <div className="col-span-2 flex items-center justify-end pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSet(exercise.id, set.setIndex);
                          if (!set.completed && canComplete) onStartRestTimer(preferences.defaultRestSeconds);
                        }}
                        disabled={!set.completed && !canComplete}
                        aria-label={t(set.completed ? 'workout.markPendingSet' : 'workout.completeSet', { set: set.setIndex })}
                        title={!canComplete ? t('workout.invalidSet') : undefined}
                        aria-pressed={set.completed}
                        className={`flex size-11 items-center justify-center rounded-full transition-[transform,background-color,border-color] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 ${
                          set.completed
                            ? 'border-2 border-accent bg-accent text-accent-fg shadow-accent'
                            : 'border-2 border-border-active bg-surface-input text-transparent hover:border-accent'
                        }`}
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                      </button>
                    </div>
                  </div>
                  );
                })}

                {/* Botones de Acción de Serie */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 text-xs font-semibold">
                  <label className="relative min-w-0">
                    <span className="sr-only">{t('workout.addSetType')}</span>
                    <select
                      value=""
                      aria-label={t('workout.addSetType')}
                      onChange={(event) => {
                        const setType = event.target.value as WorkoutSetType;
                        if (setType) onAddSet(exercise.id, setType);
                      }}
                      className="h-11 w-full appearance-none rounded-ui-lg border border-border-subtle bg-surface-input px-3 pr-8 text-xs font-bold text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                    >
                      <option value="">+ {t('workout.addSet')}</option>
                      <option value="working">{t('workout.workingSet')}</option>
                      <option value="warmup">{t('workout.addWarmup')}</option>
                      <option value="drop">{t('workout.dropSet')}</option>
                      <option value="backoff">{t('workout.backoffSet')}</option>
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
                  </label>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => onRemoveSet(exercise.id)}
                    disabled={sets.length <= 1}
                    className="justify-start px-2 text-text-muted hover:text-danger"
                  >
                    — {t('workout.removeLastSet')}
                  </Button>
                </div>

              </div>
            </div>
          );
        })
      )}

      {/* Botón flotante para Agregar otro Ejercicio a la sesión activa */}
      {exerciseSessions.length > 0 && <div className="pt-4">
        <Button
          variant="secondary"
          onClick={() => setIsAddModalOpen(true)}
          className="w-full border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"
        >
          <Plus className="size-5 stroke-[2.5]" />
          {t('workout.addToSession')}
        </Button>
      </div>}

      {/* Modal para Buscar / Agregar Ejercicio */}
      <AddExerciseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableExercises={availableExercises}
        history={history}
        onSelectExercise={onAddExercise}
        onCreateCustomExercise={onCreateCustomExercise}
        initialMuscleFilter={getDefaultMuscleFilter(routineName)}
      />

      {/* Modal de Demostración Visual de Técnica en GIF */}
      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />

      {/* Modal de Resumen y Celebración de Entrenamiento */}
      <WorkoutSummaryModal
        isOpen={Boolean(summaryData)}
        summary={summaryData}
        onConfirmSave={() => {
          setSummaryData(null);
          onFinishWorkout();
        }}
      />

      <Modal open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)} title={t('workout.discardTitle')} description={t('workout.discardDescription')}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>{t('workout.continue')}</Button>
          <Button variant="danger" onClick={() => { setShowDiscardConfirm(false); onCancelWorkout(); }}>{t('workout.discard')}</Button>
        </div>
      </Modal>
      <PlatePickerSheet
        open={Boolean(plateTarget)}
        onClose={() => setPlateTarget(null)}
        valueKg={plateTarget?.valueKg || 0}
        units={preferences.units}
        barWeightKg={preferences.defaultBarWeightKg}
        availablePlatesKg={preferences.availablePlatesKg}
        includeBarWeight={plateTarget?.includeBarWeight ?? false}
        allowBarToggle={plateTarget?.allowBarToggle ?? false}
        loading={plateTarget?.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE}
        onApply={(valueKg, includeBarWeight) => {
          if (!plateTarget) return;
          onUpdateSet(plateTarget.exerciseId, plateTarget.setIndex, 'weightKg', valueKg);
          onUpdateBarInclusion(plateTarget.exerciseId, includeBarWeight);
        }}
      />
    </div>
  );
};
