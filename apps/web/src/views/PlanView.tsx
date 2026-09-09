import React, { useState } from 'react';
import { ChevronRight, Plus, Dumbbell, Trash2 } from 'lucide-react';
import { Routine, Exercise } from '@light-weight/domain';
import { CreateRoutineModal } from '../components/CreateRoutineModal.js';
import { BackupModal } from '../components/BackupModal.js';
import { ViewHeader } from '../components/ViewHeader.js';
import {
  WeeklySchedule,
  WeekDay,
  WEEKDAY_NAMES_ES
} from '../lib/storage.js';

interface PlanViewProps {
  routines: Routine[];
  exercises: Exercise[];
  weeklySchedule: WeeklySchedule;
  onUpdateWeeklySchedule?: (schedule: WeeklySchedule) => void;
  onSelectAndStartRoutine: (routineId: string) => void;
  onSaveRoutine: (newRoutine: Routine) => void;
  onDeleteRoutine?: (routineId: string) => void;
  onDataRestored?: () => void;
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
}

const DAYS_LIST: WeekDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

export const PlanView: React.FC<PlanViewProps> = ({
  routines,
  exercises,
  weeklySchedule,
  onUpdateWeeklySchedule,
  onSelectAndStartRoutine,
  onSaveRoutine,
  onDeleteRoutine,
  onDataRestored,
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  return (
    <div className="space-y-4 pb-28">
      {/* 1. Header Homogéneo */}
      <ViewHeader
        title="Planificación"
        subtitle="Calendario semanal y rutinas personalizadas"
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings || (() => setIsBackupModalOpen(true))}
      />

      {/* Section: Week schedule */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Distribución Semanal</span>
          <span className="text-[11px] text-zinc-400 font-mono">7 Días</span>
        </div>

        <div className="p-2 dark-glass-card rounded-[28px] border border-white/[0.08] divide-y divide-white/[0.04] overflow-hidden shadow-xl">
          {DAYS_LIST.map((dayKey) => {
            const routineId = weeklySchedule[dayKey];
            const assignedRoutine = routineId ? routines.find((r) => r.id === routineId) : null;
            const dayName = WEEKDAY_NAMES_ES[dayKey].full;

            return (
              <div
                key={dayKey}
                className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors rounded-xl"
              >
                <span className="text-xs font-semibold text-zinc-200">{dayName}</span>

                {assignedRoutine ? (
                  <button
                    onClick={() => onSelectAndStartRoutine(assignedRoutine.id)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-bold hover:bg-accent/25 active:scale-[0.94] transition-all cursor-pointer shadow-sm"
                  >
                    <Dumbbell className="w-3 h-3 stroke-[2.5]" />
                    <span>{assignedRoutine.name}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-subcard text-zinc-400 text-xs font-medium">
                    <span>Descanso</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section: Routines */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tus Rutinas ({routines.length})</span>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-accent text-accent-fg text-xs font-bold hover:brightness-110 active:scale-[0.94] transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            Nueva Rutina
          </button>
        </div>

        <div className="space-y-2">
          {routines.map((routine) => (
            <div
              key={routine.id}
              onClick={() => onSelectAndStartRoutine(routine.id)}
              className="p-4 dark-glass-card rounded-[28px] border border-white/[0.08] hover:border-white/20 transition-all flex items-center justify-between cursor-pointer active:scale-[0.98] group shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-accent shrink-0">
                  <Dumbbell className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-accent transition-colors">
                    {routine.name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                    {routine.exerciseIds.length} ejercicios programados
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {onDeleteRoutine && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`¿Deseas eliminar la rutina "${routine.name}"?`)) {
                        onDeleteRoutine(routine.id);
                      }
                    }}
                    className="w-8 h-8 rounded-full bg-transparent hover:bg-red-500/10 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-colors active:scale-90"
                    title="Eliminar rutina"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Crear Nueva Rutina */}
      <CreateRoutineModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        availableExercises={exercises}
        onSaveRoutine={onSaveRoutine}
      />

      {/* Modal: Exportar / Importar Copia de Seguridad */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataRestored={onDataRestored}
      />
    </div>
  );
};
