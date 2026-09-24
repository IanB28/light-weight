import { Dumbbell, Play, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Exercise, Routine } from '@light-weight/domain';
import { BottomSheet, Button, EmptyState } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth-context.js';
import { useI18n } from '../../lib/i18n.js';
import { getExerciseImgUrl } from '../../lib/exercises.js';
import { RoutineShareSheet } from './RoutineShareSheet.js';

interface RoutineDetailSheetProps {
  routine: Routine | null;
  exercises: Exercise[];
  onClose: () => void;
  onStart: (routineId: string) => void;
  onDelete?: (routineId: string) => void;
}

export function RoutineDetailSheet({ routine, exercises, onClose, onStart, onDelete }: RoutineDetailSheetProps) {
  const auth = useAuth();
  const { t } = useI18n();
  const [sharing, setSharing] = useState(false);
  if (!routine) return null;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const routineExercises = routine.exerciseIds.map((id) => byId.get(id)).filter(Boolean) as Exercise[];
  return (<>
    <BottomSheet open title={routine.name} description={routine.description || `${routine.exerciseIds.length} ejercicios`} onClose={onClose}>
      <div className="space-y-4">
        {routine.origin?.type === 'shared' && (
          <p className="text-xs font-semibold text-text-secondary">{t('sharing.sharedBy', { username: routine.origin.sharedBy.username })}</p>
        )}
        {routineExercises.length ? (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input">
            {routineExercises.map((exercise) => {
              const imgUrl = getExerciseImgUrl(exercise);
              return (
                <div key={exercise.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted">
                    {imgUrl ? (
                      <img src={imgUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Dumbbell className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text-primary">{exercise.name}</p>
                    <p className="text-[11px] capitalize text-text-muted">{`${exercise.primaryMuscle} · ${exercise.category}`}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState compact icon={<Dumbbell className="size-5" />} title="Esta rutina no tiene ejercicios disponibles" description="Puedes crear otra rutina desde la sección de planificación." />
        )}
        <Button className="w-full" onClick={() => onStart(routine.id)} disabled={!routineExercises.length}><Play className="size-4" />Empezar rutina</Button>
        {auth.isAuthenticated && <Button variant="secondary" className="w-full" onClick={() => setSharing(true)}><Send className="size-4" />{t('sharing.share')}</Button>}
        {onDelete && <Button variant="danger" className="w-full" onClick={() => { if (window.confirm(`¿Eliminar la rutina “${routine.name}”?`)) { onDelete(routine.id); onClose(); } }}><Trash2 className="size-4" />Eliminar rutina</Button>}
      </div>
    </BottomSheet>
    <RoutineShareSheet routine={routine} open={sharing} onClose={() => setSharing(false)} />
  </>);
}
