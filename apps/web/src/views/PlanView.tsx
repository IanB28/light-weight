import React, { useState } from 'react';
import { ChevronRight, Dumbbell, Plus } from 'lucide-react';
import { Exercise, Routine, getRoutineExerciseIds } from '@light-weight/domain';
import { CreateRoutineModal } from '../components/CreateRoutineModal.js';
import { RoutineEditorModal } from '../components/RoutineEditorModal.js';
import { ViewHeader } from '../components/ViewHeader.js';
import { AppCard, Button, EmptyState, SectionHeader } from '../components/ui/index.js';
import { RoutineDetailSheet } from '../features/routines/RoutineDetailSheet.js';
import { RoutinePicker } from '../components/RoutinePicker.js';
import { WeeklySchedule, WeekDay } from '../lib/storage.js';
import { TranslationKey, useI18n } from '../lib/i18n.js';
import { ReceivedRoutines } from '../features/routines/ReceivedRoutines.js';
import type { AppPreferences } from '../lib/preferences.js';

interface PlanViewProps {
  routines: Routine[];
  exercises: Exercise[];
  weeklySchedule: WeeklySchedule;
  onUpdateWeeklySchedule?: (schedule: WeeklySchedule) => void;
  onSelectAndStartRoutine: (routineId: string) => void;
  onSaveRoutine: (newRoutine: Routine) => void;
  onDeleteRoutine?: (routineId: string) => void;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
  routineOwnerId?: string;
  preferences?: AppPreferences;
}

const DAYS_LIST: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const PlanView: React.FC<PlanViewProps> = ({
  routines,
  exercises,
  weeklySchedule,
  onUpdateWeeklySchedule,
  onSelectAndStartRoutine,
  onSaveRoutine,
  onDeleteRoutine,
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings,
  routineOwnerId,
  preferences
}) => {
  const { t } = useI18n();
  const dayLabel = (day: WeekDay, length: 'short' | 'full') => t(`weekday.${day}.${length}` as TranslationKey);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const assignedCount = Object.values(weeklySchedule).filter(Boolean).length;

  const assignRoutine = (day: WeekDay, routineId: string | null) => {
    onUpdateWeeklySchedule?.({ ...weeklySchedule, [day]: routineId });
  };

  return (
    <div className="space-y-section">
      <ViewHeader
        title={t('plan.title')}
        subtitle={t('plan.subtitle')}
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      <section className="space-y-2">
        <SectionHeader
          title={t('plan.thisWeek')}
          meta={`${assignedCount} ${assignedCount === 1 ? t('plan.assignedDay') : t('plan.assignedDays')}`}
        />
        <AppCard compact className="divide-y divide-border-subtle overflow-hidden p-2">
          {assignedCount === 0 && (
            <EmptyState
              compact
              className="py-3"
              title={t('plan.noSchedule')}
              description={routines.length ? t('plan.chooseRoutine') : t('plan.createThenAssign')}
            />
          )}
          {DAYS_LIST.map((day) => (
            <div key={day} className="grid min-h-14 grid-cols-[4rem_minmax(0,1fr)] items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 text-xs font-semibold text-text-secondary">{dayLabel(day, 'short')}</span>
              <RoutinePicker
                dayLabel={dayLabel(day, 'full')}
                value={weeklySchedule[day]}
                routines={routines}
                onChange={(routineId) => assignRoutine(day, routineId)}
              />
            </div>
          ))}
        </AppCard>
      </section>

      <ReceivedRoutines onImport={onSaveRoutine} exercises={exercises} preferences={preferences} />

      <section className="space-y-2">
        <SectionHeader
          title={t('plan.myRoutines')}
          meta={`${routines.length} ${t('plan.saved')}`}
          action={
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="size-4" />
              {t('plan.newRoutine')}
            </Button>
          }
        />
        {routines.length === 0 ? (
          <AppCard compact>
            <EmptyState
              compact
              icon={<Dumbbell className="size-5" />}
              title={t('plan.noRoutines')}
              description={t('plan.noRoutinesDescription')}
              actionLabel={t('plan.createFirst')}
              onAction={() => setIsCreateModalOpen(true)}
            />
          </AppCard>
        ) : (
          <div className="space-y-2">
            {routines.map((routine) => {
              const exerciseCount = getRoutineExerciseIds(routine).length;
              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setSelectedRoutine(routine)}
                  className="glass-surface ui-interactive-surface ui-focus-visible ui-pressable flex min-h-16 w-full min-w-0 items-center justify-between gap-3 rounded-ui-xl border p-card-compact text-left transition-[border-color,transform] duration-150"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg border border-border-subtle bg-surface-input text-accent">
                      <Dumbbell className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="ui-card-title truncate text-text-primary">{routine.name}</h3>
                      <p className="ui-caption mt-0.5">
                        {exerciseCount} {exerciseCount === 1 ? t('library.exercise') : t('library.exercises')}
                      </p>
                      {routine.origin?.type === 'shared' && <p className="ui-caption mt-0.5 truncate">
                        {t('sharing.sharedBy', { username: routine.origin.sharedBy.username })}
                      </p>}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-text-muted" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <CreateRoutineModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        availableExercises={exercises}
        onSaveRoutine={onSaveRoutine}
        ownerId={routineOwnerId}
        preferences={preferences}
      />

      <RoutineDetailSheet
        routine={selectedRoutine}
        exercises={exercises}
        onClose={() => setSelectedRoutine(null)}
        onStart={onSelectAndStartRoutine}
        onEdit={(routine) => {
          setSelectedRoutine(null);
          setEditingRoutine(routine);
        }}
        onDelete={onDeleteRoutine}
      />

      <RoutineEditorModal
        isOpen={Boolean(editingRoutine)}
        onClose={() => setEditingRoutine(null)}
        availableExercises={exercises}
        mode="edit"
        initialRoutine={editingRoutine}
        ownerId={routineOwnerId}
        preferences={preferences}
        onSaveRoutine={(updated) => {
          onSaveRoutine(updated);
          setSelectedRoutine(updated);
          setEditingRoutine(null);
        }}
      />
    </div>
  );
};
