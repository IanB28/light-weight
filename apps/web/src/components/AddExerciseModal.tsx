import React, { useState, useMemo } from 'react';
import { Search, Plus, X, Dumbbell } from 'lucide-react';
import { Exercise, MuscleGroup } from '@light-weight/domain';

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  onSelectExercise: (exercise: Exercise) => void;
  onCreateCustomExercise: (name: string, muscle: MuscleGroup) => void;
}

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSelectExercise,
  onCreateCustomExercise
}) => {
  const [query, setQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>('chest');

  const filtered = useMemo(() => {
    return availableExercises.filter((ex) => {
      const matchesQuery = ex.name.toLowerCase().includes(query.toLowerCase());
      const matchesMuscle = selectedMuscle === 'all' || ex.primaryMuscle === selectedMuscle;
      return matchesQuery && matchesMuscle;
    });
  }, [availableExercises, query, selectedMuscle]);

  if (!isOpen) return null;

  const handleCreateNew = () => {
    if (!query.trim()) return;
    onCreateCustomExercise(query.trim(), customMuscle);
    setQuery('');
    onClose();
  };

  const muscles: { id: string; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'chest', label: 'Pecho' },
    { id: 'back', label: 'Espalda' },
    { id: 'quadriceps', label: 'Cuádriceps' },
    { id: 'hamstrings', label: 'Femoral' },
    { id: 'shoulders', label: 'Hombros' },
    { id: 'biceps', label: 'Bíceps' },
    { id: 'triceps', label: 'Tríceps' },
    { id: 'core', label: 'Core' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#121416]/92 backdrop-blur-2xl border border-white/[0.12] rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-black/90 animate-in slide-in-from-bottom-6 duration-200">
        {/* iOS Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mt-2.5 mb-0.5 sm:hidden" />

        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2 tracking-tight">
            <Dumbbell className="w-4 h-4 text-emerald-400" />
            Agregar Ejercicio
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.93] flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Search Input with Apple style */}
        <div className="p-4 pb-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar ejercicio (ej. Press, Sentadilla...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Muscle Filter Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {muscles.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMuscle(m.id)}
                className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap active:scale-[0.94] transition-all cursor-pointer ${
                  selectedMuscle === m.id
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-4 pt-1 space-y-1.5 divide-y divide-white/[0.04]">
          {filtered.map((exercise) => (
            <button
              key={exercise.id}
              onClick={() => {
                onSelectExercise(exercise);
                onClose();
              }}
              className="w-full text-left py-3 px-3 rounded-2xl hover:bg-white/[0.04] active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer"
            >
              <div>
                <p className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                  {exercise.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-mono capitalize text-zinc-400">
                    {exercise.primaryMuscle}
                  </span>
                  <span className="text-[10px] text-zinc-600">•</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {exercise.category}
                  </span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-zinc-400 font-medium">No se encontró "{query}"</p>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] max-w-xs mx-auto space-y-3 text-left">
                <p className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Crear Ejercicio Personalizado
                </p>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Músculo Principal</label>
                  <select
                    value={customMuscle}
                    onChange={(e) => setCustomMuscle(e.target.value as MuscleGroup)}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-900 border border-white/[0.08] text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
                  >
                    {muscles.filter((m) => m.id !== 'all').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleCreateNew}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.97] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  Crear y Añadir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
