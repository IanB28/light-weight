import React, { useState } from 'react';
import type { ExerciseLoadingProfile, LoggedSet, WorkoutSetType, MachineProfile, MachineBaseSelection } from '@light-weight/domain';
import { normalizeWorkoutSetType, poundsToKilograms, resolveExerciseLoadingProfile, resolvePlateBaseWeightKg, isPlateLoadedMachine } from '@light-weight/domain';
import { Check, Disc3, Dumbbell, Eye, SkipForward, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Button, IconButton, MachineProfileModal, OptionPicker, RirHeaderButton, RirPicker } from '../../components/ui/index.js';
import { getExerciseImgUrl } from '../../lib/exercises.js';
import { useExerciseLabels, useI18n } from '../../lib/i18n.js';
import type { AppPreferences, WeightInputMode } from '../../lib/preferences.js';
import { formatDisplayWeight } from '../../lib/weight-units.js';
import { PlateWeightButton, KeyboardWeightInput } from './WeightEntry.js';
import type { ActiveExerciseSession } from './types.js';

export interface PlateTarget {
  exerciseId: string;
  setIndex: number;
  valueKg: number;
  includeBarWeight: boolean;
  allowBarToggle: boolean;
  baseWeightKg: number;
  loading: ExerciseLoadingProfile;
  machineProfileId?: string;
  machineProfileLabel?: string;
  machineBaseResistanceKg?: number;
  machineStatus?: import('@light-weight/domain').BaseResistanceStatus;
  machineBaseSourceLabel?: string;
  machineBaseSourceUrl?: string;
  machineManufacturer?: string;
  machineModel?: string;
}

const isValidWorkoutSet = (set: LoggedSet): boolean => (
  Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0
);

interface WorkoutHeaderProps {
  routineName: string;
  sessionDuration: string;
  completedSetsCount: number;
  totalSetsCount: number;
  totalVolumeLabel: string;
  onDiscard: () => void;
  onFinish: () => void;
}

export function WorkoutHeader({ routineName, sessionDuration, completedSetsCount, totalSetsCount, totalVolumeLabel, onDiscard, onFinish }: WorkoutHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="glass-surface sticky top-0 z-20 flex items-center justify-between rounded-ui-lg border border-border-subtle px-3 py-2.5 shadow-card">
      <IconButton variant="ghost" onClick={onDiscard} aria-label={t('workout.discardSession')} title={t('workout.discardSession')}>
        <X className="size-4" />
      </IconButton>
      <div className="text-center">
        <h2 className="text-base font-extrabold tracking-tight text-text-primary">{routineName}</h2>
        <p className="mt-0.5 font-mono text-xs text-text-muted">
          {sessionDuration} · <span className="text-accent">{completedSetsCount}/{totalSetsCount} {t('workout.sets')}</span> · <span className="font-bold text-text-secondary">{totalVolumeLabel}</span>
        </p>
      </div>
      <Button size="md" onClick={onFinish} disabled={completedSetsCount === 0} className="rounded-full px-3 text-xs" title={t('workout.finishTitle')}>
        <Check className="size-4 stroke-[3]" /> <span>{t('workout.finish')}</span>
      </Button>
    </div>
  );
}

interface SetRowProps {
  exerciseId: string;
  set: LoggedSet;
  session: ActiveExerciseSession;
  loading: ExerciseLoadingProfile;
  usesAddedWeight: boolean;
  weightInputMode: WeightInputMode;
  preferences: AppPreferences;
  onUpdateSet: (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'rir', value: number) => void;
  onUpdateSetRir?: (exerciseId: string, setIndex: number, rir: number | undefined) => void;
  onToggleSet: (exerciseId: string, setIndex: number) => void;
  onStartRestTimer: (seconds: number) => void;
  onOpenPlates: (target: PlateTarget) => void;
}

export function SetRow({ exerciseId, set, session, loading, usesAddedWeight, weightInputMode, preferences, onUpdateSet, onUpdateSetRir, onToggleSet, onStartRestTimer, onOpenPlates }: SetRowProps) {
  const { t } = useI18n();
  const isPlateMachine = isPlateLoadedMachine(loading);
  const hasSnapshot = Boolean(
    set.machineProfileId ||
    set.machineBaseResistanceStatus
  );
  const effectiveBaseKg = hasSnapshot
    ? set.machineBaseResistanceKg
    : (isPlateMachine ? session.machineBaseResistanceKg : undefined);
  const effectiveStatus = hasSnapshot
    ? set.machineBaseResistanceStatus
    : (isPlateMachine
        ? (session.machineBaseResistanceStatus ?? 'unknown')
        : undefined);
  const violatesBaseLoad = effectiveBaseKg !== undefined && set.weightKg < effectiveBaseKg;
  const isUnassertedUnknown = isPlateMachine && effectiveStatus === 'unknown' && !hasSnapshot;
  const canComplete = isValidWorkoutSet(set) && !violatesBaseLoad && !isUnassertedUnknown;
  const setType = normalizeWorkoutSetType(set);
  const setTypeLabel = setType === 'warmup' ? t('workout.warmupSet') : setType === 'drop' ? t('workout.dropSet') : setType === 'backoff' ? t('workout.backoffSet') : t('workout.workingSet');
  const setMarker = setType === 'working' ? String(set.setIndex) : setType === 'warmup' ? 'C' : setType === 'drop' ? 'D' : 'B';
  const weightStepKg = preferences.units === 'imperial' ? poundsToKilograms(5) : 2.5;
  const isAssisted = loading.loadMode === 'assisted';
  const isAddedWeight = loading.loadMode === 'added_weight';
  const prefix = isAssisted ? '-' : (isAddedWeight && usesAddedWeight ? '+' : undefined);
  return (
    <div className={`grid grid-cols-12 items-center gap-1 rounded-2xl p-1.5 transition-[background-color,border-color] ${set.completed ? 'border border-accent/25 bg-accent/15' : 'glass-subcard'}`}>
      <div className="col-span-1 flex items-center justify-center"><span aria-label={`${set.setIndex}: ${setTypeLabel}`} title={setTypeLabel} className={`flex size-6 items-center justify-center rounded-full font-mono text-xs font-bold ${set.completed ? 'bg-accent text-accent-fg' : 'bg-surface-active text-text-muted'}`}>{setMarker}</span></div>
      <div className="col-span-4 flex items-center justify-center gap-0.5">
        {!usesAddedWeight ? <span aria-label={t('workout.bodyweightOnly')} className="flex h-11 w-full items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input font-mono text-xs font-bold text-text-muted">BW</span> : <>
          {weightInputMode === 'keyboard' && <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'weightKg', Math.max(0, Math.round((set.weightKg - weightStepKg) * 100) / 100))} aria-label={t('workout.reduceWeight', { set: set.setIndex })} className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">—</button>}
          {weightInputMode === 'plates' ? <PlateWeightButton valueKg={set.weightKg} units={preferences.units} prefix={prefix} label={t('workout.weightForSet', { set: set.setIndex })} onClick={() => onOpenPlates({ exerciseId, setIndex: set.setIndex, valueKg: set.weightKg, includeBarWeight: loading.plateBase?.kind === 'fixed' ? true : session.includeBarWeight ?? loading.includeBarWeight, allowBarToggle: loading.includeBarWeight && loading.plateBase?.kind === 'user_bar', baseWeightKg: session.plateBaseWeightKg ?? resolvePlateBaseWeightKg(loading, preferences.defaultBarWeightKg), loading, machineProfileId: hasSnapshot ? set.machineProfileId : session.machineProfileId, machineProfileLabel: hasSnapshot ? set.machineProfileLabel : session.machineProfileLabel, machineBaseResistanceKg: effectiveBaseKg, machineStatus: effectiveStatus, machineBaseSourceLabel: hasSnapshot ? set.machineBaseSourceLabel : session.machineBaseSourceLabel, machineBaseSourceUrl: hasSnapshot ? set.machineBaseSourceUrl : session.machineBaseSourceUrl, machineManufacturer: hasSnapshot ? set.machineManufacturer : session.machineManufacturer, machineModel: hasSnapshot ? set.machineModel : session.machineModel })} /> : <KeyboardWeightInput valueKg={set.weightKg} units={preferences.units} prefix={prefix} label={t('workout.weightForSet', { set: set.setIndex })} onChange={(value) => onUpdateSet(exerciseId, set.setIndex, 'weightKg', value)} />}
          {weightInputMode === 'keyboard' && <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'weightKg', Math.round((set.weightKg + weightStepKg) * 100) / 100)} aria-label={t('workout.increaseWeight', { set: set.setIndex })} className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">+</button>}
        </>}
      </div>
      <div className="col-span-3 flex items-center justify-center gap-0.5">
        <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'reps', Math.max(1, set.reps - 1))} aria-label={t('workout.reduceReps', { set: set.setIndex })} className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">—</button>
        <input type="number" inputMode="numeric" min="0" step="1" value={set.reps === 0 ? '' : set.reps} placeholder="0" onFocus={(event) => event.target.select()} onChange={(event) => onUpdateSet(exerciseId, set.setIndex, 'reps', Number.parseInt(event.target.value, 10) || 0)} aria-label={t('workout.repsForSet', { set: set.setIndex })} className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-9" />
        <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'reps', set.reps + 1)} aria-label={t('workout.increaseReps', { set: set.setIndex })} className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">+</button>
      </div>
      <div className="col-span-2 flex items-center justify-center"><RirPicker value={set.rir} onChange={(value) => { if (onUpdateSetRir) { onUpdateSetRir(exerciseId, set.setIndex, value); } else if (value !== undefined) { onUpdateSet(exerciseId, set.setIndex, 'rir', value); } }} ariaLabel={t('workout.rirForSet', { set: set.setIndex })} className="font-mono" /></div>
      <div className="col-span-2 flex items-center justify-end pr-1"><button type="button" onClick={() => { onToggleSet(exerciseId, set.setIndex); if (!set.completed && canComplete) onStartRestTimer(preferences.defaultRestSeconds); }} disabled={!set.completed && !canComplete} aria-label={t(set.completed ? 'workout.markPendingSet' : 'workout.completeSet', { set: set.setIndex })} title={!canComplete ? t('workout.invalidSet') : undefined} aria-pressed={set.completed} className={`flex size-11 items-center justify-center rounded-full transition-[transform,background-color,border-color] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 ${set.completed ? 'border-2 border-accent bg-accent text-accent-fg shadow-accent' : 'border-2 border-border-active bg-surface-input text-transparent hover:border-accent'}`}><Check className="size-5 stroke-[3]" /></button></div>
    </div>
  );
}

interface SetTableProps {
  session: ActiveExerciseSession;
  preferences: AppPreferences;
  onUpdateSet: SetRowProps['onUpdateSet'];
  onUpdateSetRir?: SetRowProps['onUpdateSetRir'];
  onToggleSet: SetRowProps['onToggleSet'];
  onStartRestTimer: SetRowProps['onStartRestTimer'];
  onOpenPlates: SetRowProps['onOpenPlates'];
  onAddSet: (exerciseId: string, setType?: WorkoutSetType) => void;
  onRemoveSet: (exerciseId: string) => void;
  onUpdateWeightInputMode: (exerciseId: string, mode: WeightInputMode) => void;
  onToggleAddedWeight: (exerciseId: string, enabled: boolean) => void;
}

export function SetTable({ session, preferences, onUpdateSet, onUpdateSetRir, onToggleSet, onStartRestTimer, onOpenPlates, onAddSet, onRemoveSet, onUpdateWeightInputMode, onToggleAddedWeight }: SetTableProps) {
  const { t } = useI18n();
  const { exercise, sets } = session;
  const loading = resolveExerciseLoadingProfile(exercise).profile;
  const usesAddedWeight = loading.loadMode !== 'added_weight' || Boolean(session.usesAddedWeight);
  const weightInputMode: WeightInputMode = loading.supportsPlates && !loading.supportsKeyboard ? 'plates' : loading.supportsKeyboard && loading.supportsPlates ? (session.weightInputModeOverride || preferences.weightInputMode) : 'keyboard';
  return <div className="glass-surface space-y-2 rounded-ui-xl border border-border-subtle p-3.5 shadow-card">
    {loading.supportsKeyboard && loading.supportsPlates && <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span><div className="flex rounded-ui-md border border-border-subtle bg-surface-input p-0.5" role="group" aria-label={t('workout.weightMode')}>{(['keyboard', 'plates'] as const).map((mode) => <button key={mode} type="button" aria-pressed={weightInputMode === mode} onClick={() => onUpdateWeightInputMode(exercise.id, mode)} className={`min-h-9 rounded-md px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${weightInputMode === mode ? 'bg-accent text-accent-fg' : 'text-text-muted'}`}>{mode === 'keyboard' ? t('workout.keyboard') : t('workout.plates')}</button>)}</div></div>}
    {loading.supportsPlates && !loading.supportsKeyboard && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span><span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent"><Disc3 aria-hidden="true" className="size-4" />{t('workout.plates')}</span></div>}
    {loading.loadMode === 'added_weight' && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.additionalWeight')}</span><button type="button" aria-pressed={usesAddedWeight} onClick={() => onToggleAddedWeight(exercise.id, !usesAddedWeight)} className={`min-h-9 rounded-ui-md border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${usesAddedWeight ? 'border-accent bg-accent-soft text-accent' : 'border-border-subtle bg-surface-input text-text-secondary'}`}>{usesAddedWeight ? t('workout.additionalWeightActive') : t('workout.addWeight')}</button></div>}
    {loading.loadMode === 'assisted' && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.machineAssistance')}</span><span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">{t('workout.counterweight')}</span></div>}
    <div className="grid grid-cols-12 gap-1 px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted"><span className="col-span-1">#</span><span className="col-span-4">{loading.loadMode === 'assisted' ? t('workout.assistance') : t('workout.weight')} ({preferences.units === 'imperial' ? 'LB' : 'KG'})</span><span className="col-span-3">{t('workout.reps')}</span><span className="col-span-2 flex items-center justify-center"><RirHeaderButton /></span><span className="col-span-2 flex justify-end pr-2"><Check className="size-3.5 text-accent" /></span></div>
    {sets.map((set) => <SetRow key={set.setIndex} exerciseId={exercise.id} set={set} session={session} loading={loading} usesAddedWeight={usesAddedWeight} weightInputMode={weightInputMode} preferences={preferences} onUpdateSet={onUpdateSet} onUpdateSetRir={onUpdateSetRir} onToggleSet={onToggleSet} onStartRestTimer={onStartRestTimer} onOpenPlates={onOpenPlates} />)}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 text-xs font-semibold"><OptionPicker value="" options={[{ value: 'working', label: t('workout.workingSet') }, { value: 'warmup', label: t('workout.warmupSet') }, { value: 'drop', label: t('workout.dropSet') }, { value: 'backoff', label: t('workout.backoffSet') }]} onChange={(setType) => onAddSet(exercise.id, setType as WorkoutSetType)} ariaLabel={t('workout.addSetType')} triggerLabel={`+ ${t('workout.addSet')}`} /><Button variant="ghost" size="md" onClick={() => onRemoveSet(exercise.id)} disabled={sets.length <= 1} className="justify-start px-2 text-text-muted hover:text-danger">— {t('workout.removeLastSet')}</Button></div>
  </div>;
}

interface ExerciseSessionCardProps {
  session: ActiveExerciseSession;
  exerciseIndex: number;
  totalExercises: number;
  preferences: AppPreferences;
  mode?: 'live' | 'historical';
  onViewTechnique: (session: ActiveExerciseSession['exercise']) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onSkipExercise?: (exerciseId: string) => void;
  onResumeExercise?: (exerciseId: string) => void;
  onAddReplacement?: (targetExercise: ActiveExerciseSession['exercise']) => void;
  onUpdateSet: SetRowProps['onUpdateSet'];
  onUpdateSetRir?: SetRowProps['onUpdateSetRir'];
  onToggleSet: SetRowProps['onToggleSet'];
  onStartRestTimer: SetRowProps['onStartRestTimer'];
  onOpenPlates: SetRowProps['onOpenPlates'];
  onAddSet: SetTableProps['onAddSet'];
  onRemoveSet: SetTableProps['onRemoveSet'];
  onUpdateWeightInputMode: SetTableProps['onUpdateWeightInputMode'];
  onToggleAddedWeight: SetTableProps['onToggleAddedWeight'];
  onUpdateMachineProfile?: (exerciseId: string, selection: MachineBaseSelection) => void;
}

export function ExerciseSessionCard({
  session,
  exerciseIndex,
  totalExercises,
  preferences,
  mode = 'live',
  onViewTechnique,
  onRemoveExercise,
  onSkipExercise,
  onResumeExercise,
  onAddReplacement,
  onUpdateSet,
  onUpdateSetRir,
  onToggleSet,
  onStartRestTimer,
  onOpenPlates,
  onAddSet,
  onRemoveSet,
  onUpdateWeightInputMode,
  onToggleAddedWeight,
  onUpdateMachineProfile
}: ExerciseSessionCardProps) {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const { exercise, previousRecord, bestRecord, skipped } = session;
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const loading = resolveExerciseLoadingProfile(exercise).profile;
  const isPlateMachine = loading.mechanism === 'plate_loaded' || Boolean(loading.hasMachineBase);
  const imgUrl = getExerciseImgUrl(exercise);
  const hasCompletedSets = session.sets.some((set) => set.completed && isValidWorkoutSet(set));
  const effectiveStartRestTimer = mode === 'historical' ? () => {} : onStartRestTimer;

  if (skipped) {
    return (
      <div className="space-y-3 pt-2 opacity-80" data-testid={`skipped-card-${exercise.id}`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onViewTechnique(exercise)}
            aria-label={t('workout.viewTechnique', { name: exercise.name })}
            className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={t('workout.viewTechnique', { name: exercise.name })}
          >
            {imgUrl ? (
              <img src={imgUrl} alt="" loading="lazy" className="h-full w-full object-cover grayscale transition-transform group-hover:scale-105" />
            ) : (
              <Dumbbell className="size-6 text-text-muted stroke-[1.8]" />
            )}
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100">
              <Eye className="size-4 text-accent" />
            </div>
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {t('workout.exercisePosition', { current: exerciseIndex + 1, total: totalExercises })}
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
            <h3 className="truncate text-lg font-extrabold leading-tight tracking-tight text-text-secondary">
              {exercise.name}
            </h3>
            <div className="flex min-w-0 items-center justify-between gap-3 pt-0.5 text-xs">
              <span className="min-w-0 truncate capitalize text-text-muted">
                {muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}
              </span>
              {bestRecord && <span className="shrink-0 font-semibold text-text-muted">PR {bestRecord}</span>}
            </div>
          </div>
        </div>
        <div className="glass-surface flex flex-col gap-3 rounded-ui-xl border border-dashed border-border-subtle p-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-text-muted">
            <SkipForward className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="text-xs font-semibold text-text-muted">{t('workout.skipped')}</span>
          </div>
          <div className="flex items-center gap-2">
            {onResumeExercise && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResumeExercise(exercise.id)}
                className="text-xs font-bold"
              >
                {t('workout.resumeExercise')}
              </Button>
            )}
            {onAddReplacement && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAddReplacement(exercise)}
                className="text-xs font-bold"
              >
                {t('workout.addReplacement')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onViewTechnique(exercise)}
          aria-label={t('workout.viewTechnique', { name: exercise.name })}
          className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title={t('workout.viewTechnique', { name: exercise.name })}
        >
          {imgUrl ? (
            <img src={imgUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : (
            <Dumbbell className="size-6 text-text-muted stroke-[1.8]" />
          )}
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Eye className="size-4 text-accent" />
          </div>
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-10 items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {t('workout.exercisePosition', { current: exerciseIndex + 1, total: totalExercises })}
            </span>
            <div className="flex items-center gap-1">
              {mode !== 'historical' && onSkipExercise && !hasCompletedSets && (
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onSkipExercise(exercise.id)}
                  aria-label={t('workout.skipExerciseNamed', { name: exercise.name })}
                  className="text-text-muted hover:text-text-primary"
                  title={t('workout.skipExercise')}
                >
                  <SkipForward className="size-4" />
                </IconButton>
              )}
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
          </div>
          <h3 className="truncate text-lg font-extrabold leading-tight tracking-tight text-text-primary">
            {exercise.name}
          </h3>
          <div className="flex min-w-0 items-center justify-between gap-3 pt-0.5 text-xs">
            <span className="min-w-0 truncate capitalize text-text-muted">
              {muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}
            </span>
            {bestRecord && <span className="shrink-0 font-semibold text-amber-400">PR {bestRecord}</span>}
          </div>
          {previousRecord && (
            <p className="pt-0.5 font-mono text-[11px] leading-relaxed text-text-muted">
              <span className="font-semibold text-text-secondary">{t('workout.previous')}</span> {previousRecord}
            </p>
          )}
          {isPlateMachine && (
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setIsMachineModalOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  session.machineBaseResistanceStatus === 'unknown' || !session.machineBaseResistanceStatus
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:border-amber-500 hover:bg-amber-500/20'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-default hover:text-text-primary'
                }`}
                title={t('workout.machineBaseResistance')}
              >
                <SlidersHorizontal className="size-3 shrink-0" />
                {session.machineProfileLabel ? (
                  <>
                    <span className="truncate max-w-[140px]">{session.machineProfileLabel}</span>
                    <span className="font-mono text-accent">
                      ({session.machineBaseResistanceKg !== undefined
                        ? formatDisplayWeight(session.machineBaseResistanceKg, preferences.units)
                        : t('workout.machineBaseUnknown')})
                    </span>
                  </>
                ) : session.machineBaseResistanceStatus === 'none' ? (
                  <span>{t('workout.machineBaseNone')} (0 {preferences.units === 'imperial' ? 'lb' : 'kg'})</span>
                ) : session.machineBaseResistanceStatus === 'suggested' && session.machineBaseResistanceKg !== undefined ? (
                  <>
                    <span>{t('workout.machineBaseSuggested')}</span>
                    <span className="font-mono text-accent">
                      ({formatDisplayWeight(session.machineBaseResistanceKg, preferences.units)})
                    </span>
                  </>
                ) : (
                  <span>{t('workout.machineBaseUnconfigured')}</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      <SetTable
        session={session}
        preferences={preferences}
        onUpdateSet={onUpdateSet}
        onUpdateSetRir={onUpdateSetRir}
        onToggleSet={onToggleSet}
        onStartRestTimer={effectiveStartRestTimer}
        onOpenPlates={onOpenPlates}
        onAddSet={onAddSet}
        onRemoveSet={onRemoveSet}
        onUpdateWeightInputMode={onUpdateWeightInputMode}
        onToggleAddedWeight={onToggleAddedWeight}
      />
      {isPlateMachine && (
        <MachineProfileModal
          isOpen={isMachineModalOpen}
          onClose={() => setIsMachineModalOpen(false)}
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          suggestions={loading.suggestions}
          currentProfileId={session.machineProfileId}
          currentStatus={session.machineBaseResistanceStatus}
          currentWeightKg={session.machineBaseResistanceKg}
          onSelectProfile={(selection) => {
            onUpdateMachineProfile?.(exercise.id, selection);
          }}
        />
      )}
    </div>
  );
}
