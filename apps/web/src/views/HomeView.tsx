import React from 'react';
import { Settings, Play, Flame, Calendar, Dumbbell, Plus } from 'lucide-react';
import { Routine, WorkoutSession } from '@light-weight/domain';

interface HomeViewProps {
  todayRoutine?: Routine;
  history?: WorkoutSession[];
  onStartWorkout: (routineId?: string) => void;
  onNavigateToStats: () => void;
  onNavigateToPlan: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  todayRoutine,
  history = [],
  onStartWorkout,
  onNavigateToStats,
  onNavigateToPlan
}) => {
  const todayStr = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const lastSession = history[0];

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
            light-weight
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              F&F
            </span>
          </h1>
          <p className="text-xs text-zinc-400 capitalize font-medium mt-0.5">{todayStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-white/[0.06] px-2.5 py-1 rounded-full">
            {history.length} entrenamientos
          </span>
        </div>
      </div>

      {/* Botón Principal de Acción Rápida: Iniciar Sesión Libre */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-[#141618] to-black border border-emerald-500/30 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 font-mono">
            SESIÓN INMEDIATA
          </span>
          <span className="text-xs text-zinc-400 font-medium">Cero fricción</span>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            ¿Listo para entrenar hoy?
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Comienza sin rutinas fijas: añade cualquier ejercicio sobre la marcha y registra tus cargas.
          </p>
        </div>

        <button
          onClick={() => onStartWorkout()}
          className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-black font-extrabold text-sm rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-black stroke-black" />
          Iniciar Entrenamiento Libre
        </button>
      </div>

      {/* Tarjeta de Rutina Guardada (si existe) */}
      {todayRoutine && (
        <div className="p-4 rounded-3xl bg-[#141618] border border-white/[0.06] flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-800/80 border border-white/[0.06] flex items-center justify-center text-zinc-300">
              <Dumbbell className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                  RUTINA GUARDADA
                </span>
              </div>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">
                {todayRoutine.name}
              </p>
            </div>
          </div>

          <button
            onClick={() => onStartWorkout(todayRoutine.id)}
            className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold text-xs tracking-tight transition-all border border-white/[0.08]"
          >
            Cargar
          </button>
        </div>
      )}

      {/* Resumen de Último Entrenamiento */}
      {lastSession && (
        <div className="p-5 rounded-3xl bg-[#141618] border border-white/[0.06] shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" />
              Última sesión registrada
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {new Date(lastSession.startedAt).toLocaleDateString('es-ES')}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm font-bold text-white">
              {lastSession.routineName || 'Entrenamiento Libre'}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Object.keys(lastSession.sets).map((exId) => (
                <span
                  key={exId}
                  className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-800/80 text-zinc-300 border border-white/[0.04] font-mono"
                >
                  {exId.replace('ex-', '')}: {lastSession.sets[exId].filter((s) => s.completed).length} sets
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={onNavigateToStats}
            className="text-xs text-emerald-400 font-semibold hover:underline block pt-1"
          >
            Ver analíticas y récords →
          </button>
        </div>
      )}
    </div>
  );
};
