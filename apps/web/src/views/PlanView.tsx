import React from 'react';
import { Upload, ChevronRight, Plus, Dumbbell, Calendar } from 'lucide-react';
import { Routine, Exercise } from '@light-weight/domain';

interface PlanViewProps {
  routines: Routine[];
  exercises: Exercise[];
  onSelectAndStartRoutine: (routineId: string) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  routines,
  exercises,
  onSelectAndStartRoutine
}) => {
  const weeklySchedule = [
    { day: 'Monday', routine: 'Push Day', isRest: false },
    { day: 'Tuesday', routine: 'Rest', isRest: true },
    { day: 'Wednesday', routine: 'Pull Day', isRest: false },
    { day: 'Thursday', routine: 'Rest', isRest: true },
    { day: 'Friday', routine: 'Leg Day', isRest: false },
    { day: 'Saturday', routine: 'Rest', isRest: true },
    { day: 'Sunday', routine: 'Rest', isRest: true }
  ];

  return (
    <div className="space-y-5 pb-28">
      {/* openGym Plan Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Plan</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Your weekly routine</p>
        </div>
        <button
          className="w-9 h-9 rounded-full bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          title="Exportar / Backup"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>

      {/* Section: Week schedule */}
      <div className="space-y-2.5">
        <span className="text-xs font-bold text-zinc-400 block px-1">Week schedule</span>

        <div className="rounded-3xl bg-[#141618] border border-white/[0.06] divide-y divide-white/[0.04] overflow-hidden shadow-xl">
          {weeklySchedule.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3.5 hover:bg-zinc-800/40 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-200">{item.day}</span>

              {item.isRest ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/80 text-zinc-400 text-xs font-semibold">
                  <span>Rest</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              ) : (
                <button
                  onClick={() => {
                    const matched = routines.find((r) =>
                      r.name.toLowerCase().includes(item.routine.toLowerCase().slice(0, 4))
                    );
                    if (matched) onSelectAndStartRoutine(matched.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
                >
                  <Dumbbell className="w-3 h-3 stroke-[2.5]" />
                  <span>{item.routine}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section: Routines */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-zinc-400">Routines</span>
          <button className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-all cursor-pointer">
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            New
          </button>
        </div>

        <div className="space-y-2">
          {routines.map((routine) => (
            <div
              key={routine.id}
              onClick={() => onSelectAndStartRoutine(routine.id)}
              className="p-4 rounded-3xl bg-[#141618] border border-white/[0.06] hover:border-white/[0.12] transition-all flex items-center justify-between cursor-pointer active:scale-[0.99] group shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Dumbbell className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                    {routine.name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {routine.exerciseIds.length} exercises
                  </p>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
