import React from 'react';
import { X, Calendar, Dumbbell, Play, CheckCircle2, ChevronRight, Moon, Flame } from 'lucide-react';
import { Routine, WorkoutSession } from '@light-weight/domain';
import { findExerciseById } from '../lib/exercises.js';

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  completedSession?: WorkoutSession;
  scheduledRoutine?: Routine;
  availableRoutines: Routine[];
  onStartRoutine: (routineId: string) => void;
  onStartFreeWorkout: () => void;
  onAssignRoutine: (routineId: string | null) => void;
  onViewSessionDetail?: (session: WorkoutSession) => void;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  isOpen,
  onClose,
  date,
  completedSession,
  scheduledRoutine,
  availableRoutines,
  onStartRoutine,
  onStartFreeWorkout,
  onAssignRoutine,
  onViewSessionDetail
}) => {
  if (!isOpen) return null;

  const dateFormatted = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div role="dialog" aria-modal="true" aria-labelledby="day-detail-title" className="w-full max-w-md dark-glass-card rounded-t-[28px] sm:rounded-[28px] border border-white/[0.08] p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-6 duration-200 max-h-[85dvh] flex flex-col select-none">
        {/* iOS Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between shrink-0 pb-1 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 id="day-detail-title" className="text-base font-extrabold text-white capitalize tracking-tight">
                  {dateFormatted}
                </h3>
                {isToday && (
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                    Hoy
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Planificación y registro de entrenamiento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del día"
            className="flex size-11 shrink-0 items-center justify-center rounded-full glass-subcard text-zinc-400 transition-all hover:border-white/20 hover:text-white active:scale-[0.96]"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none py-1">
          {/* Si ya se completó un entrenamiento este día */}
          {completedSession ? (
            <div className="p-4 rounded-2xl glass-subcard border-accent/30 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  Sesión Completada
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {new Date(completedSession.startedAt).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>

              <div>
                <h4 className="text-base font-extrabold text-white">
                  {completedSession.routineName || 'Entrenamiento Libre'}
                </h4>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {Object.keys(completedSession.sets).map((exId) => {
                    const exName = findExerciseById(exId)?.name || exId.replace('ex-', '');
                    const setsCount = completedSession.sets[exId].filter((s) => s.completed).length;
                    return (
                      <span
                        key={exId}
                        className="px-2.5 py-1 rounded-lg text-xs bg-black/40 border border-white/[0.06] text-zinc-300 font-mono"
                      >
                        {exName}: {setsCount} sets
                      </span>
                    );
                  })}
                </div>
              </div>

              {onViewSessionDetail && (
                <button
                  type="button"
                  onClick={() => {
                    onViewSessionDetail(completedSession);
                    onClose();
                  }}
                  className="text-xs text-accent font-bold hover:underline flex items-center gap-1 pt-1"
                >
                  <span>Ver analíticas completas de esta sesión</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            /* Si NO hay entrenamiento completado */
            <div className="space-y-3">
              {scheduledRoutine ? (
                <div className="glass-subcard p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-accent">
                      RUTINA ASIGNADA
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {scheduledRoutine.exerciseIds.length} ejercicios
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-white">
                      {scheduledRoutine.name}
                    </h4>
                    {scheduledRoutine.description && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {scheduledRoutine.description}
                      </p>
                    )}
                  </div>

                  {/* Ejercicios de la rutina */}
                  <div className="space-y-1.5 pt-1">
                    {scheduledRoutine.exerciseIds.map((exId, idx) => {
                      const ex = findExerciseById(exId);
                      return (
                        <div
                          key={exId}
                          className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/[0.04] text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-zinc-500 font-mono text-[10px]">
                              {idx + 1}.
                            </span>
                            <span className="font-semibold text-zinc-200 truncate">
                              {ex?.name || exId}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 capitalize shrink-0 ml-2">
                            {ex?.primaryMuscle || ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón Iniciar */}
                  <button
                    type="button"
                    onClick={() => {
                      onStartRoutine(scheduledRoutine.id);
                      onClose();
                    }}
                    className="w-full py-3 rounded-2xl bg-accent hover:brightness-110 active:scale-[0.97] text-accent-fg font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 cursor-pointer mt-2"
                  >
                    <Play className="w-4 h-4 fill-current stroke-current" />
                    Iniciar Rutina de este Día
                  </button>
                </div>
              ) : (
                /* Día de Descanso */
                <div className="glass-subcard p-5 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-zinc-400 mx-auto">
                    <Moon className="w-6 h-6 text-zinc-300" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      Día de Descanso Programado
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                      Permite que tus fibras musculares se regeneren. O si lo prefieres, puedes iniciar una sesión libre o asignar una rutina.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onStartFreeWorkout();
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-2xl glass-subcard hover:border-white/20 active:scale-[0.96] text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    Entrenar de todos modos (Sesión Libre)
                  </button>
                </div>
              )}

              {/* Selector para cambiar la rutina de este día */}
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Cambiar asignación para este día:
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAssignRoutine(null)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer ${
                      !scheduledRoutine
                        ? 'bg-zinc-800 border-accent/40 text-accent'
                        : 'bg-black/30 border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>Descanso</span>
                    {!scheduledRoutine && <CheckCircle2 className="w-3.5 h-3.5 text-accent" />}
                  </button>

                  {availableRoutines.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onAssignRoutine(r.id)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer ${
                        scheduledRoutine?.id === r.id
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-black/30 border-white/[0.06] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-2">{r.name}</span>
                      {scheduledRoutine?.id === r.id && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
