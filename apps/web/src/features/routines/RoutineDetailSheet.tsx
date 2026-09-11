import { Dumbbell, Play, Trash2 } from 'lucide-react';
import { Exercise, Routine } from '@light-weight/domain';
import { BottomSheet, Button, EmptyState } from '../../components/ui/index.js';

interface RoutineDetailSheetProps {
  routine: Routine | null;
  exercises: Exercise[];
  onClose: () => void;
  onStart: (routineId: string) => void;
  onDelete?: (routineId: string) => void;
}

export function RoutineDetailSheet({ routine, exercises, onClose, onStart, onDelete }: RoutineDetailSheetProps) {
  if (!routine) return null;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const routineExercises = routine.exerciseIds.map((id) => byId.get(id)).filter(Boolean) as Exercise[];
  return (
    <BottomSheet open title={routine.name} description={routine.description || `${routine.exerciseIds.length} ejercicios`} onClose={onClose}>
      <div className="space-y-4">
        {routineExercises.length ? (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input">
            {routineExercises.map((exercise, index) => (
              <div key={exercise.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-bold text-accent">{index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-text-primary">{exercise.name}</p><p className="text-[11px] capitalize text-text-muted">{exercise.primaryMuscle} · {exercise.category}</p></div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<Dumbbell className="size-5" />} title="Esta rutina no tiene ejercicios disponibles" description="Puedes crear otra rutina desde la sección de planificación." />
        )}
        <Button className="w-full" onClick={() => onStart(routine.id)} disabled={!routineExercises.length}><Play className="size-4" />Empezar rutina</Button>
        {onDelete && <Button variant="danger" className="w-full" onClick={() => { if (window.confirm(`¿Eliminar la rutina “${routine.name}”?`)) { onDelete(routine.id); onClose(); } }}><Trash2 className="size-4" />Eliminar rutina</Button>}
      </div>
    </BottomSheet>
  );
}
