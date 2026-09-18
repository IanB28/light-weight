import React, { useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  calculateEffectiveLoadKg,
  calculateSetOneRm,
  isSetEligibleForPersonalRecord,
  shouldCountForVolume,
  type Exercise,
  type LoggedSet,
  type MuscleGroup,
  type Routine,
  type WorkoutSetType
} from '@light-weight/domain';
import { AddExerciseModal } from '../components/AddExerciseModal.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { WorkoutSummaryModal, type CompletedWorkoutSummary } from '../components/WorkoutSummaryModal.js';
import { AppCard, Button, EmptyState, Modal } from '../components/ui/index.js';
import type { AppPreferences, WeightInputMode } from '../lib/preferences.js';
import { useI18n } from '../lib/i18n.js';
import { formatDisplayWeight } from '../lib/weight-units.js';
import { PlatePickerSheet } from '../features/workouts/WeightEntry.js';
import { ExerciseSessionCard, WorkoutHeader, type PlateTarget } from '../features/workouts/WorkoutSessionComponents.js';
import type { ActiveExerciseSession } from '../features/workouts/types.js';

export type { ActiveExerciseSession } from '../features/workouts/types.js';

interface WorkoutViewProps {
  isWorkoutActive: boolean;
  routines: Routine[];
  routineName: string;
  sessionDuration: string;
  exerciseSessions: ActiveExerciseSession[];
  availableExercises: Exercise[];
  history: import('@light-weight/domain').WorkoutSession[];
  currentBodyweightKg?: number | null;
  onToggleSet: (exerciseId: string, setIndex: number) => void;
  onUpdateSet: (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'rir', value: number) => void;
  onAddSet: (exerciseId: string, setType?: WorkoutSetType) => void;
  onRemoveSet: (exerciseId: string) => void;
  onAddExercise: (exercise: Exercise) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onSkipExercise?: (exerciseId: string) => void;
  onResumeExercise?: (exerciseId: string) => void;
  onCreateCustomExercise: (name: string, muscle: MuscleGroup) => void;
  onFinishWorkout: () => void;
  onCancelWorkout: () => void;
  onStartRestTimer: (seconds: number) => void;
  onStartRoutine: (routineId: string) => void;
  preferences: AppPreferences;
  onUpdateWeightInputMode: (exerciseId: string, mode: WeightInputMode) => void;
  onToggleAddedWeight: (exerciseId: string, enabled: boolean) => void;
  onUpdateBarInclusion: (exerciseId: string, includeBarWeight: boolean) => void;
  onUpdatePlateBaseWeight: (exerciseId: string, weightKg: number) => void;
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

export const isValidWorkoutSet = (set: LoggedSet) => Number.isFinite(set.weightKg) && set.weightKg >= 0 && Number.isFinite(set.reps) && set.reps > 0;

export const calculateEffectiveTotalSets = (exerciseSessions: ActiveExerciseSession[]): number =>
  exerciseSessions.reduce((count, session) => count + (session.skipped ? 0 : session.sets.length), 0);

export const WorkoutView: React.FC<WorkoutViewProps> = ({
  isWorkoutActive, routines, routineName, sessionDuration, exerciseSessions, availableExercises, history,
  currentBodyweightKg,
  onToggleSet, onUpdateSet, onAddSet, onRemoveSet, onAddExercise, onRemoveExercise, onSkipExercise, onResumeExercise, onCreateCustomExercise,
  onFinishWorkout, onCancelWorkout, onStartRestTimer, onStartRoutine, preferences, onUpdateWeightInputMode,
  onToggleAddedWeight, onUpdateBarInclusion, onUpdatePlateBaseWeight
}) => {
  const { t } = useI18n();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [replacementMuscle, setReplacementMuscle] = useState<string | null>(null);
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);
  const [summaryData, setSummaryData] = useState<CompletedWorkoutSummary | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [plateTarget, setPlateTarget] = useState<PlateTarget | null>(null);
  const displayRoutineName = routineName === 'Entrenamiento Libre' ? t('workout.freeWorkout') : routineName;
  const completedSetsCount = exerciseSessions.reduce(
    (count, session) => count + (session.skipped ? 0 : session.sets.filter((set) => set.completed && isValidWorkoutSet(set)).length),
    0
  );
  const totalSetsCount = calculateEffectiveTotalSets(exerciseSessions);
  const totalVolumeKg = exerciseSessions.reduce(
    (total, session) =>
      session.skipped
        ? total
        : total +
          session.sets
            .filter(shouldCountForVolume)
            .reduce(
              (sum, set) =>
                sum +
                calculateEffectiveLoadKg({
                  exercise: session.exercise,
                  setWeightKg: set.weightKg,
                  bodyweightKg: currentBodyweightKg
                }) *
                  set.reps,
              0
            ),
    0
  );

  const handleAddReplacement = (targetExercise: Exercise) => {
    setReplacementMuscle(targetExercise.primaryMuscle);
    setIsAddModalOpen(true);
  };

  const handleFinishClick = () => {
    if (completedSetsCount === 0) return;
    const newRecords: CompletedWorkoutSummary['newRecords'] = [];
    exerciseSessions.forEach((session) => {
      if (session.skipped) return;
      const eligibleSets = session.sets.filter(
        (set) =>
          isValidWorkoutSet(set) &&
          isSetEligibleForPersonalRecord({
            set,
            exercise: session.exercise,
            bodyweightKg: currentBodyweightKg
          })
      );
      const bestSet = eligibleSets.reduce<LoggedSet | null>((best, set) => {
        if (!best) return set;
        const current1Rm = calculateSetOneRm(set, {
          exercise: session.exercise,
          bodyweightKg: currentBodyweightKg,
          formula: 'average'
        }) ?? 0;
        const best1Rm = calculateSetOneRm(best, {
          exercise: session.exercise,
          bodyweightKg: currentBodyweightKg,
          formula: 'average'
        }) ?? 0;
        return current1Rm > best1Rm ? set : best;
      }, null);

      if (bestSet) {
        const estimatedOneRm = calculateSetOneRm(bestSet, {
          exercise: session.exercise,
          bodyweightKg: currentBodyweightKg,
          formula: 'average'
        }) ?? 0;
        if (estimatedOneRm > (session.bestEst1Rm || 0)) {
          newRecords.push({
            exerciseName: session.exercise.name,
            weightKg: bestSet.weightKg,
            reps: bestSet.reps,
            estimatedOneRm: Math.round(estimatedOneRm * 10) / 10,
            loadMode: session.exercise.loading?.loadMode
          });
        }
      }
    });
    setSummaryData({ routineName: displayRoutineName, durationFormatted: sessionDuration, totalVolumeKg, totalCompletedSets: completedSetsCount, newRecords: newRecords.slice(0, 3) });
  };

  return <div className="space-y-4 pb-36">
    {(isWorkoutActive || exerciseSessions.length > 0) && <WorkoutHeader routineName={displayRoutineName} sessionDuration={sessionDuration} completedSetsCount={completedSetsCount} totalSetsCount={totalSetsCount} totalVolumeLabel={formatDisplayWeight(totalVolumeKg, preferences.units)} onDiscard={() => setShowDiscardConfirm(true)} onFinish={handleFinishClick} />}
    {exerciseSessions.length === 0 ? <AppCard className="space-y-4">
      <EmptyState icon={<Dumbbell className="size-5" />} title={t('workout.emptyTitle')} description={isWorkoutActive ? t('workout.emptyActive') : t('workout.emptyInactive')} actionLabel={t('exercise.add')} onAction={() => { setReplacementMuscle(null); setIsAddModalOpen(true); }} />
      {routines.length > 0 && <div className="space-y-2 border-t border-border-subtle pt-4"><p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('workout.useRoutine')}</p>{routines.slice(0, 3).map((routine) => <button key={routine.id} type="button" onClick={() => onStartRoutine(routine.id)} className="flex min-h-11 w-full items-center justify-between rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-sm font-bold text-text-primary hover:border-border-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="truncate">{routine.name}</span><span className="text-xs font-medium text-text-muted">{routine.exerciseIds.length} {routine.exerciseIds.length === 1 ? t('library.exercise') : t('library.exercises')}</span></button>)}</div>}
    </AppCard> : exerciseSessions.map((session, index) => <ExerciseSessionCard key={session.exercise.id} session={session} exerciseIndex={index} totalExercises={exerciseSessions.length} preferences={preferences} onViewTechnique={setSelectedMediaExercise} onRemoveExercise={onRemoveExercise} onSkipExercise={onSkipExercise} onResumeExercise={onResumeExercise} onAddReplacement={handleAddReplacement} onUpdateSet={onUpdateSet} onToggleSet={onToggleSet} onStartRestTimer={onStartRestTimer} onOpenPlates={setPlateTarget} onAddSet={onAddSet} onRemoveSet={onRemoveSet} onUpdateWeightInputMode={onUpdateWeightInputMode} onToggleAddedWeight={onToggleAddedWeight} />)}
    {exerciseSessions.length > 0 && <div className="pt-4"><Button variant="secondary" onClick={() => { setReplacementMuscle(null); setIsAddModalOpen(true); }} className="w-full border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"><Plus className="size-5 stroke-[2.5]" />{t('workout.addToSession')}</Button></div>}
    <AddExerciseModal isOpen={isAddModalOpen} onClose={() => { setReplacementMuscle(null); setIsAddModalOpen(false); }} availableExercises={availableExercises} history={history} onSelectExercise={(exercise) => { setReplacementMuscle(null); onAddExercise(exercise); }} onCreateCustomExercise={onCreateCustomExercise} initialMuscleFilter={replacementMuscle || getDefaultMuscleFilter(routineName)} />
    <ExerciseMediaModal exercise={selectedMediaExercise} isOpen={Boolean(selectedMediaExercise)} onClose={() => setSelectedMediaExercise(null)} />
    <WorkoutSummaryModal isOpen={Boolean(summaryData)} summary={summaryData} onConfirmSave={() => { setSummaryData(null); onFinishWorkout(); }} />
    <Modal open={showDiscardConfirm} onClose={() => setShowDiscardConfirm(false)} title={t('workout.discardTitle')} description={t('workout.discardDescription')}><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>{t('workout.continue')}</Button><Button variant="danger" onClick={() => { setShowDiscardConfirm(false); onCancelWorkout(); }}>{t('workout.discard')}</Button></div></Modal>
    <PlatePickerSheet open={Boolean(plateTarget)} onClose={() => setPlateTarget(null)} valueKg={plateTarget?.valueKg || 0} units={preferences.units} baseWeightKg={plateTarget?.baseWeightKg || 0} availablePlatesKg={preferences.availablePlatesKg} includeBarWeight={plateTarget?.includeBarWeight ?? false} allowBarToggle={plateTarget?.allowBarToggle ?? false} loading={plateTarget?.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE} onApply={(valueKg, includeBarWeight, baseWeightKg) => { if (!plateTarget) return; onUpdateSet(plateTarget.exerciseId, plateTarget.setIndex, 'weightKg', valueKg); onUpdateBarInclusion(plateTarget.exerciseId, includeBarWeight); onUpdatePlateBaseWeight(plateTarget.exerciseId, baseWeightKg); }} />
  </div>;
};
