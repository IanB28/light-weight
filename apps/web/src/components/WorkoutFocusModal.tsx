import React from 'react';
import { X, Flame, Dumbbell, ArrowUpRight, Zap, Sparkles } from 'lucide-react';
import { MuscleGroup } from '@light-weight/domain';

export type WorkoutFocus =
  | 'push'
  | 'pull'
  | 'upper'
  | 'lower'
  | 'quads'
  | 'glutes'
  | 'full';

export interface FocusOption {
  id: WorkoutFocus;
  label: string;
  subtitle: string;
  badge: string;
  primaryMuscles: MuscleGroup[];
  color: string;
}

export const FOCUS_OPTIONS: FocusOption[] = [
  {
    id: 'push',
    label: 'Push (Empuje)',
    subtitle: 'Pecho, Hombro frontal/lateral y Tríceps',
    badge: 'Empuje',
    primaryMuscles: ['chest', 'shoulders', 'triceps'],
    color: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30'
  },
  {
    id: 'pull',
    label: 'Pull (Tirón)',
    subtitle: 'Espalda, Dorsal, Bíceps y Trapecio',
    badge: 'Tirón',
    primaryMuscles: ['back', 'biceps', 'forearms'],
    color: 'from-sky-500/20 to-blue-500/10 text-sky-400 border-sky-500/30'
  },
  {
    id: 'upper',
    label: 'Upper Body (Torso Completo)',
    subtitle: 'Todo el tren superior equilibrado',
    badge: 'Torso',
    primaryMuscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
    color: 'from-teal-500/20 to-cyan-500/10 text-teal-400 border-teal-500/30'
  },
  {
    id: 'lower',
    label: 'Lower Body (Pierna Completa)',
    subtitle: 'Cuádriceps, Femoral, Glúteo y Gemelo',
    badge: 'Pierna',
    primaryMuscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
    color: 'from-indigo-500/20 to-purple-500/10 text-indigo-400 border-indigo-500/30'
  },
  {
    id: 'quads',
    label: 'Quads Focus (Tren Anterior)',
    subtitle: 'Énfasis en cuádriceps y sentadillas pesadas',
    badge: 'Cuádriceps',
    primaryMuscles: ['quadriceps'],
    color: 'from-rose-500/20 to-pink-500/10 text-rose-400 border-rose-500/30'
  },
  {
    id: 'glutes',
    label: 'Glutes & Posterior (Cadena Posterior)',
    subtitle: 'Hip Thrust, RDL y femoral para hipertrofia',
    badge: 'Glúteos & Femoral',
    primaryMuscles: ['glutes', 'hamstrings'],
    color: 'from-purple-500/20 to-violet-500/10 text-purple-400 border-purple-500/30'
  },
  {
    id: 'full',
    label: 'Full Body / Libre',
    subtitle: 'Combina cualquier ejercicio sobre la marcha',
    badge: 'Libre',
    primaryMuscles: [],
    color: 'from-zinc-800 to-zinc-900 text-zinc-300 border-white/[0.1]'
  }
];

interface WorkoutFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFocus: (focus: WorkoutFocus, focusName: string, prefilterMuscles: MuscleGroup[]) => void;
}

export const WorkoutFocusModal: React.FC<WorkoutFocusModalProps> = ({
  isOpen,
  onClose,
  onSelectFocus
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div className="w-full max-w-md dark-glass-card rounded-t-[28px] sm:rounded-[28px] border border-white/[0.08] p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-6 duration-200 max-h-[85vh] flex flex-col select-none">
        {/* iOS Mobile Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between shrink-0 pb-1 border-b border-white/[0.08]">
          <div>
            <span className="text-[10px] uppercase font-mono font-extrabold tracking-wider text-accent">
              SESIÓN INMEDIATA
            </span>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              ¿Qué entrenarás hoy?
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Elige tu enfoque para personalizar tu sesión y filtrar ejercicios
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full glass-subcard hover:border-white/20 active:scale-[0.93] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Options List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-none py-1">
          {FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onSelectFocus(opt.id, opt.label, opt.primaryMuscles);
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-2xl glass-subcard hover:border-white/20 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer relative overflow-hidden"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${opt.color} border flex items-center justify-center shrink-0 shadow-sm`}
                >
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white group-hover:text-accent transition-colors truncate">
                      {opt.label}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {opt.subtitle}
                  </p>
                </div>
              </div>

              <div className="w-7 h-7 rounded-full bg-white/[0.06] group-hover:bg-accent group-hover:text-accent-fg flex items-center justify-center text-zinc-400 transition-all shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
