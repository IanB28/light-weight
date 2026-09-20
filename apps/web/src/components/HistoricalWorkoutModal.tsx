import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Dumbbell, Plus, Trash2 } from 'lucide-react';
import type { Exercise, Routine, WorkoutSession, WorkoutSetType } from '@light-weight/domain';
import { AddExerciseModal } from './AddExerciseModal.js';
import { Button, Modal, OptionPicker } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { getMachineProfilesForExercise } from '../lib/machine-profiles.js';
import {
  createHistoricalWorkoutSession,
  HistoricalWorkoutValidationError,
  type HistoricalExerciseDraft,
  type HistoricalSetDraft
} from '../features/workouts/historical-workout.js';

interface HistoricalWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (session: WorkoutSession) => void;
  userId: string;
  exercises: Exercise[];
  history: WorkoutSession[];
  routines: Routine[];
  initialDate?: Date;
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTimeKey(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const emptySet = (): HistoricalSetDraft => ({ weight: '', reps: '', rir: '', setType: 'working' });

export function HistoricalWorkoutModal({ isOpen, onClose, onSave, userId, exercises, history, routines, initialDate }: HistoricalWorkoutModalProps) {
  const { t } = useI18n();
  const setTypeOptions: Array<{ value: WorkoutSetType; label: string }> = [
    { value: 'working', label: t('workout.workingSet') },
    { value: 'warmup', label: t('workout.warmupSet') },
    { value: 'drop', label: t('workout.dropSet') },
    { value: 'backoff', label: t('workout.backoffSet') }
  ];
  const [performedDate, setPerformedDate] = useState(localDateKey());
  const [performedTime, setPerformedTime] = useState(localTimeKey());
  const [durationMinutes, setDurationMinutes] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [routineId, setRoutineId] = useState('');
  const [draftExercises, setDraftExercises] = useState<HistoricalExerciseDraft[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPerformedDate(localDateKey(initialDate || new Date()));
    setPerformedTime(localTimeKey());
    setDurationMinutes('');
    setRoutineName('');
    setRoutineId('');
    setDraftExercises([]);
    setError(null);
  }, [initialDate, isOpen]);

  const hasExercises = draftExercises.length > 0;
  const validSetCount = useMemo(() => draftExercises.reduce((count, exercise) => count + exercise.sets.length, 0), [draftExercises]);
  const addExercise = (exercise: Exercise) => setDraftExercises((current) => current.some((item) => item.exercise.id === exercise.id)
    ? current
    : [...current, { exercise, sets: [emptySet()] }]);
  const updateSet = (exerciseId: string, setIndex: number, patch: Partial<HistoricalSetDraft>) => setDraftExercises((current) => current.map((exercise) => exercise.exercise.id !== exerciseId
    ? exercise
    : { ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, ...patch } : set) }));
  const addSet = (exerciseId: string) => setDraftExercises((current) => current.map((exercise) => exercise.exercise.id === exerciseId ? { ...exercise, sets: [...exercise.sets, emptySet()] } : exercise));
  const updateMachineProfile = (exerciseId: string, profileId: string) => setDraftExercises((current) => current.map((exercise) => {
    if (exercise.exercise.id !== exerciseId) return exercise;
    const profile = getMachineProfilesForExercise(exerciseId).find((item) => item.id === profileId);
    return { ...exercise, machineProfile: profile };
  }));
  const selectRoutine = (selectedId: string) => {
    const routine = routines.find((item) => item.id === selectedId);
    setRoutineId(selectedId);
    if (routine) setRoutineName(routine.name);
  };
  const removeSet = (exerciseId: string, setIndex: number) => setDraftExercises((current) => current.map((exercise) => exercise.exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.filter((_, index) => index !== setIndex) } : exercise).filter((exercise) => exercise.sets.length > 0));

  const save = () => {
    try {
      const session = createHistoricalWorkoutSession({ userId, routineId: routineId || undefined, performedDate, performedTime, durationMinutes, routineName, exercises: draftExercises });
      onSave(session);
      onClose();
    } catch (cause) {
      setError(cause instanceof HistoricalWorkoutValidationError ? cause.message : t('historical.saveError'));
    }
  };

  return <>
    <Modal open={isOpen} onClose={onClose} title={t('historical.title')} description={t('historical.description')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-bold text-text-secondary"><span>{t('historical.performedDate')}</span><input type="date" max={localDateKey()} value={performedDate} onChange={(event) => setPerformedDate(event.target.value)} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent" /></label>
          <label className="space-y-1 text-xs font-bold text-text-secondary"><span>{t('historical.performedTime')}</span><input type="time" value={performedTime} onChange={(event) => setPerformedTime(event.target.value)} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-bold text-text-secondary"><span>{t('historical.sessionName')}</span><input value={routineName} maxLength={255} onChange={(event) => { setRoutineName(event.target.value); setRoutineId(''); }} placeholder={t('historical.freeWorkout')} className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent" /></label>
          <label className="space-y-1 text-xs font-bold text-text-secondary"><span>{t('historical.duration')}</span><input inputMode="numeric" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="—" className="h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent" /></label>
        </div>
        {routines.length > 0 && <OptionPicker value={routineId} options={[{ value: '', label: t('historical.noRoutine') }, ...routines.map((routine) => ({ value: routine.id, label: routine.name }))]} onChange={selectRoutine} ariaLabel={t('historical.routine')} />}
        <div className="space-y-2">
          {draftExercises.map(({ exercise, sets, machineProfile }) => <section key={exercise.id} className="rounded-ui-lg border border-border-subtle bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-text-primary">{exercise.name}</h3><p className="text-[11px] text-text-muted">{exercise.primaryMuscle} · {exercise.category}</p></div><Button variant="ghost" size="sm" onClick={() => setDraftExercises((current) => current.filter((item) => item.exercise.id !== exercise.id))} aria-label={`Quitar ${exercise.name}`}><Trash2 className="size-4" /></Button></div>
            {exercise.category === 'machine' && (() => {
              const profiles = getMachineProfilesForExercise(exercise.id);
              if (profiles.length === 0) return <p className="mb-2 text-[11px] text-text-muted">{t('historical.machineManual')}</p>;
              return <div className="mb-2"><OptionPicker value={machineProfile?.id || ''} options={[{ value: '', label: t('historical.noMachine') }, ...profiles.map((profile) => ({ value: profile.id, label: profile.label }))]} onChange={(profileId) => updateMachineProfile(exercise.id, profileId)} ariaLabel={t('historical.machineProfile')} /></div>;
            })()}
            <div className="space-y-2">{sets.map((set, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label={`Peso serie ${index + 1}`} inputMode="decimal" value={set.weight} onChange={(event) => updateSet(exercise.id, index, { weight: event.target.value })} placeholder="kg" className="h-10 min-w-0 rounded-ui-md border border-border-subtle bg-surface-input px-2 text-sm text-text-primary" /><input aria-label={`Repeticiones serie ${index + 1}`} inputMode="numeric" value={set.reps} onChange={(event) => updateSet(exercise.id, index, { reps: event.target.value })} placeholder="reps" className="h-10 min-w-0 rounded-ui-md border border-border-subtle bg-surface-input px-2 text-sm text-text-primary" /><input aria-label={`RIR opcional serie ${index + 1}`} inputMode="numeric" value={set.rir} onChange={(event) => updateSet(exercise.id, index, { rir: event.target.value })} placeholder="RIR" className="h-10 min-w-0 rounded-ui-md border border-border-subtle bg-surface-input px-2 text-sm text-text-primary" /><button type="button" onClick={() => removeSet(exercise.id, index)} aria-label={`Eliminar serie ${index + 1}`} className="flex size-10 items-center justify-center rounded-ui-md text-text-muted hover:bg-surface-active"><Trash2 className="size-4" /></button><div className="col-span-4"><OptionPicker value={set.setType} options={setTypeOptions} onChange={(setType) => updateSet(exercise.id, index, { setType })} ariaLabel="Tipo de serie" /></div></div>)}</div>
            <Button variant="secondary" size="sm" onClick={() => addSet(exercise.id)} className="mt-3 w-full"><Plus className="size-4" />{t('workout.addSet')}</Button>
          </section>)}</div>
        <Button variant="secondary" onClick={() => setPickerOpen(true)} className="w-full"><Dumbbell className="size-4" />{hasExercises ? t('historical.addExercise') : t('historical.addExerciseAndSets')}</Button>
        {error && <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{error}</p>}
        <Button onClick={save} disabled={!validSetCount} className="w-full"><CalendarPlus className="size-4" />{t('historical.save')}</Button>
      </div>
    </Modal>
    <AddExerciseModal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} availableExercises={exercises} history={history} onSelectExercise={addExercise} onCreateCustomExercise={() => undefined} />
  </>;
}
