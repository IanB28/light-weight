import type { ExerciseLoadingProfile, LoggedSet, WorkoutSetType } from '@light-weight/domain';
import { normalizeWorkoutSetType, poundsToKilograms, resolveExerciseLoadingProfile, resolvePlateBaseWeightKg } from '@light-weight/domain';
import { Check, Disc3, Dumbbell, Eye, Trash2, X } from 'lucide-react';
import { Button, IconButton, OptionPicker } from '../../components/ui/index.js';
import { getExerciseImgUrl } from '../../lib/exercises.js';
import { useExerciseLabels, useI18n } from '../../lib/i18n.js';
import type { AppPreferences, WeightInputMode } from '../../lib/preferences.js';
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
  onToggleSet: (exerciseId: string, setIndex: number) => void;
  onStartRestTimer: (seconds: number) => void;
  onOpenPlates: (target: PlateTarget) => void;
}

export function SetRow({ exerciseId, set, session, loading, usesAddedWeight, weightInputMode, preferences, onUpdateSet, onToggleSet, onStartRestTimer, onOpenPlates }: SetRowProps) {
  const { t } = useI18n();
  const canComplete = isValidWorkoutSet(set);
  const setType = normalizeWorkoutSetType(set);
  const setTypeLabel = setType === 'warmup' ? t('workout.warmupSet') : setType === 'drop' ? t('workout.dropSet') : setType === 'backoff' ? t('workout.backoffSet') : t('workout.workingSet');
  const setMarker = setType === 'working' ? String(set.setIndex) : setType === 'warmup' ? 'C' : setType === 'drop' ? 'D' : 'B';
  const weightStepKg = preferences.units === 'imperial' ? poundsToKilograms(5) : 2.5;
  return (
    <div className={`grid grid-cols-12 items-center gap-1 rounded-2xl p-1.5 transition-[background-color,border-color] ${set.completed ? 'border border-accent/25 bg-accent/15' : 'glass-subcard'}`}>
      <div className="col-span-1 flex items-center justify-center"><span aria-label={`${set.setIndex}: ${setTypeLabel}`} title={setTypeLabel} className={`flex size-6 items-center justify-center rounded-full font-mono text-xs font-bold ${set.completed ? 'bg-accent text-accent-fg' : 'bg-surface-active text-text-muted'}`}>{setMarker}</span></div>
      <div className="col-span-4 flex items-center justify-center gap-0.5">
        {!usesAddedWeight ? <span aria-label={t('workout.bodyweightOnly')} className="flex h-11 w-full items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input font-mono text-xs font-bold text-text-muted">BW</span> : <>
          {weightInputMode === 'keyboard' && <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'weightKg', Math.max(0, Math.round((set.weightKg - weightStepKg) * 100) / 100))} aria-label={t('workout.reduceWeight', { set: set.setIndex })} className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">—</button>}
          {weightInputMode === 'plates' ? <PlateWeightButton valueKg={set.weightKg} units={preferences.units} label={t('workout.weightForSet', { set: set.setIndex })} onClick={() => onOpenPlates({ exerciseId, setIndex: set.setIndex, valueKg: set.weightKg, includeBarWeight: loading.plateBase?.kind === 'fixed' ? true : session.includeBarWeight ?? loading.includeBarWeight, allowBarToggle: loading.includeBarWeight && loading.plateBase?.kind === 'user_bar', baseWeightKg: session.plateBaseWeightKg ?? resolvePlateBaseWeightKg(loading, preferences.defaultBarWeightKg), loading })} /> : <KeyboardWeightInput valueKg={set.weightKg} units={preferences.units} label={t('workout.weightForSet', { set: set.setIndex })} onChange={(value) => onUpdateSet(exerciseId, set.setIndex, 'weightKg', value)} />}
          {weightInputMode === 'keyboard' && <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'weightKg', Math.round((set.weightKg + weightStepKg) * 100) / 100)} aria-label={t('workout.increaseWeight', { set: set.setIndex })} className="hidden h-11 w-7 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">+</button>}
        </>}
      </div>
      <div className="col-span-3 flex items-center justify-center gap-0.5">
        <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'reps', Math.max(1, set.reps - 1))} aria-label={t('workout.reduceReps', { set: set.setIndex })} className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">—</button>
        <input type="number" inputMode="numeric" min="0" step="1" value={set.reps === 0 ? '' : set.reps} placeholder="0" onFocus={(event) => event.target.select()} onChange={(event) => onUpdateSet(exerciseId, set.setIndex, 'reps', Number.parseInt(event.target.value, 10) || 0)} aria-label={t('workout.repsForSet', { set: set.setIndex })} className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-9" />
        <button type="button" onClick={() => onUpdateSet(exerciseId, set.setIndex, 'reps', set.reps + 1)} aria-label={t('workout.increaseReps', { set: set.setIndex })} className="hidden h-11 w-6 items-center justify-center rounded-md text-sm font-bold text-text-muted hover:bg-surface-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-[390px]:flex">+</button>
      </div>
      <div className="col-span-2 flex items-center justify-center"><OptionPicker value={set.rir ?? 2} options={[0, 1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} onChange={(value) => onUpdateSet(exerciseId, set.setIndex, 'rir', value)} ariaLabel={t('workout.rirForSet', { set: set.setIndex })} triggerLabel={String(set.rir ?? 2)} className="font-mono" /></div>
      <div className="col-span-2 flex items-center justify-end pr-1"><button type="button" onClick={() => { onToggleSet(exerciseId, set.setIndex); if (!set.completed && canComplete) onStartRestTimer(preferences.defaultRestSeconds); }} disabled={!set.completed && !canComplete} aria-label={t(set.completed ? 'workout.markPendingSet' : 'workout.completeSet', { set: set.setIndex })} title={!canComplete ? t('workout.invalidSet') : undefined} aria-pressed={set.completed} className={`flex size-11 items-center justify-center rounded-full transition-[transform,background-color,border-color] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 ${set.completed ? 'border-2 border-accent bg-accent text-accent-fg shadow-accent' : 'border-2 border-border-active bg-surface-input text-transparent hover:border-accent'}`}><Check className="size-5 stroke-[3]" /></button></div>
    </div>
  );
}

interface SetTableProps {
  session: ActiveExerciseSession;
  preferences: AppPreferences;
  onUpdateSet: SetRowProps['onUpdateSet'];
  onToggleSet: SetRowProps['onToggleSet'];
  onStartRestTimer: SetRowProps['onStartRestTimer'];
  onOpenPlates: SetRowProps['onOpenPlates'];
  onAddSet: (exerciseId: string, setType?: WorkoutSetType) => void;
  onRemoveSet: (exerciseId: string) => void;
  onUpdateWeightInputMode: (exerciseId: string, mode: WeightInputMode) => void;
  onToggleAddedWeight: (exerciseId: string, enabled: boolean) => void;
}

export function SetTable({ session, preferences, onUpdateSet, onToggleSet, onStartRestTimer, onOpenPlates, onAddSet, onRemoveSet, onUpdateWeightInputMode, onToggleAddedWeight }: SetTableProps) {
  const { t } = useI18n();
  const { exercise, sets } = session;
  const loading = resolveExerciseLoadingProfile(exercise).profile;
  const usesAddedWeight = loading.loadMode !== 'added_weight' || Boolean(session.usesAddedWeight);
  const weightInputMode: WeightInputMode = loading.supportsPlates && !loading.supportsKeyboard ? 'plates' : loading.supportsKeyboard && loading.supportsPlates ? (session.weightInputModeOverride || preferences.weightInputMode) : 'keyboard';
  return <div className="glass-surface space-y-2 rounded-ui-xl border border-border-subtle p-3.5 shadow-card">
    {loading.supportsKeyboard && loading.supportsPlates && <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span><div className="flex rounded-ui-md border border-border-subtle bg-surface-input p-0.5" role="group" aria-label={t('workout.weightMode')}>{(['keyboard', 'plates'] as const).map((mode) => <button key={mode} type="button" aria-pressed={weightInputMode === mode} onClick={() => onUpdateWeightInputMode(exercise.id, mode)} className={`min-h-9 rounded-md px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${weightInputMode === mode ? 'bg-accent text-accent-fg' : 'text-text-muted'}`}>{mode === 'keyboard' ? t('workout.keyboard') : t('workout.plates')}</button>)}</div></div>}
    {loading.supportsPlates && !loading.supportsKeyboard && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.weightMode')}</span><span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent"><Disc3 aria-hidden="true" className="size-4" />{t('workout.plates')}</span></div>}
    {loading.loadMode === 'added_weight' && <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle pb-2"><span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.additionalWeight')}</span><button type="button" aria-pressed={usesAddedWeight} onClick={() => onToggleAddedWeight(exercise.id, !usesAddedWeight)} className={`min-h-9 rounded-ui-md border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${usesAddedWeight ? 'border-accent bg-accent-soft text-accent' : 'border-border-subtle bg-surface-input text-text-secondary'}`}>{usesAddedWeight ? t('workout.additionalWeightActive') : t('workout.addWeight')}</button></div>}
    <div className="grid grid-cols-12 gap-1 px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-text-muted"><span className="col-span-1">#</span><span className="col-span-4">{t('workout.weight')} ({preferences.units === 'imperial' ? 'LB' : 'KG'})</span><span className="col-span-3">{t('workout.reps')}</span><span className="col-span-2">RIR</span><span className="col-span-2 flex justify-end pr-2"><Check className="size-3.5 text-accent" /></span></div>
    {sets.map((set) => <SetRow key={set.setIndex} exerciseId={exercise.id} set={set} session={session} loading={loading} usesAddedWeight={usesAddedWeight} weightInputMode={weightInputMode} preferences={preferences} onUpdateSet={onUpdateSet} onToggleSet={onToggleSet} onStartRestTimer={onStartRestTimer} onOpenPlates={onOpenPlates} />)}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 text-xs font-semibold"><OptionPicker value="working" options={[{ value: 'working', label: `+ ${t('workout.addSet')}` }, { value: 'warmup', label: t('workout.addWarmup') }, { value: 'drop', label: t('workout.dropSet') }, { value: 'backoff', label: t('workout.backoffSet') }]} onChange={(setType) => onAddSet(exercise.id, setType as WorkoutSetType)} ariaLabel={t('workout.addSetType')} triggerLabel={`+ ${t('workout.addSet')}`} /><Button variant="ghost" size="md" onClick={() => onRemoveSet(exercise.id)} disabled={sets.length <= 1} className="justify-start px-2 text-text-muted hover:text-danger">— {t('workout.removeLastSet')}</Button></div>
  </div>;
}

interface ExerciseSessionCardProps {
  session: ActiveExerciseSession;
  exerciseIndex: number;
  totalExercises: number;
  preferences: AppPreferences;
  onViewTechnique: (session: ActiveExerciseSession['exercise']) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onUpdateSet: SetRowProps['onUpdateSet'];
  onToggleSet: SetRowProps['onToggleSet'];
  onStartRestTimer: SetRowProps['onStartRestTimer'];
  onOpenPlates: SetRowProps['onOpenPlates'];
  onAddSet: SetTableProps['onAddSet'];
  onRemoveSet: SetTableProps['onRemoveSet'];
  onUpdateWeightInputMode: SetTableProps['onUpdateWeightInputMode'];
  onToggleAddedWeight: SetTableProps['onToggleAddedWeight'];
}

export function ExerciseSessionCard({ session, exerciseIndex, totalExercises, preferences, onViewTechnique, onRemoveExercise, onUpdateSet, onToggleSet, onStartRestTimer, onOpenPlates, onAddSet, onRemoveSet, onUpdateWeightInputMode, onToggleAddedWeight }: ExerciseSessionCardProps) {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const { exercise, previousRecord, bestRecord } = session;
  const imgUrl = getExerciseImgUrl(exercise);
  return <div className="space-y-3 pt-2">
    <div className="flex items-start gap-3"><button type="button" onClick={() => onViewTechnique(exercise)} aria-label={t('workout.viewTechnique', { name: exercise.name })} className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" title={t('workout.viewTechnique', { name: exercise.name })}>{imgUrl ? <img src={imgUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <Dumbbell className="size-6 text-text-muted stroke-[1.8]" />}<div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100"><Eye className="size-4 text-accent" /></div></button>
      <div className="min-w-0 flex-1 space-y-1"><div className="flex min-h-10 items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t('workout.exercisePosition', { current: exerciseIndex + 1, total: totalExercises })}</span><IconButton variant="ghost" size="sm" onClick={() => onRemoveExercise(exercise.id)} aria-label={t('workout.removeExercise', { name: exercise.name })} className="text-text-muted hover:text-danger" title={t('workout.removeExercise', { name: exercise.name })}><Trash2 className="size-4" /></IconButton></div><h3 className="truncate text-lg font-extrabold leading-tight tracking-tight text-text-primary">{exercise.name}</h3><div className="flex min-w-0 items-center justify-between gap-3 pt-0.5 text-xs"><span className="min-w-0 truncate capitalize text-text-muted">{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}</span>{bestRecord && <span className="shrink-0 font-semibold text-amber-400">PR {bestRecord}</span>}</div>{previousRecord && <p className="pt-0.5 font-mono text-[11px] leading-relaxed text-text-muted"><span className="font-semibold text-text-secondary">{t('workout.previous')}</span> {previousRecord}</p>}</div>
    </div>
    <SetTable session={session} preferences={preferences} onUpdateSet={onUpdateSet} onToggleSet={onToggleSet} onStartRestTimer={onStartRestTimer} onOpenPlates={onOpenPlates} onAddSet={onAddSet} onRemoveSet={onRemoveSet} onUpdateWeightInputMode={onUpdateWeightInputMode} onToggleAddedWeight={onToggleAddedWeight} />
  </div>;
}
