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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-[#121416] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-emerald-400" />
            Agregar Ejercicio
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Buscador */}
        <div className="p-3 border-b border-white/[0.06] space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar ejercicio o escribir nuevo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>

          {/* Chips de filtro */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {muscles.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMuscle(m.id)}
                className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                  selectedMuscle === m.id
                    ? 'bg-emerald-500 text-black font-semibold'
                    : 'bg-zinc-800/70 text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelectExercise(ex);
                onClose();
              }}
              className="w-full p-3 rounded-2xl bg-[#181A1D] hover:bg-zinc-800/80 border border-white/[0.04] flex items-center justify-between text-left transition-all active:scale-98"
            >
              <div>
                <div className="font-semibold text-sm text-white">{ex.name}</div>
                <div className="text-xs text-zinc-400 capitalize mt-0.5">
                  {ex.primaryMuscle} • {ex.category}
                </div>
              </div>
              <Plus className="w-5 h-5 text-emerald-400" />
            </button>
          ))}

          {filtered.length === 0 && query.trim() && (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-zinc-400">
                No encontramos <strong>"{query}"</strong> en el catálogo base.
              </p>

              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-zinc-400">Músculo principal:</span>
                <select
                  value={customMuscle}
                  onChange={(e) => setCustomMuscle(e.target.value as MuscleGroup)}
                  className="bg-zinc-900 border border-zinc-700 text-xs text-white rounded-lg px-2 py-1"
                >
                  <option value="chest">Pecho</option>
                  <option value="back">Espalda</option>
                  <option value="quadriceps">Cuádriceps</option>
                  <option value="hamstrings">Femoral</option>
                  <option value="shoulders">Hombros</option>
                  <option value="biceps">Bíceps</option>
                  <option value="triceps">Tríceps</option>
                  <option value="glutes">Glúteos</option>
                  <option value="core">Core</option>
                </select>
              </div>

              <button
                onClick={handleCreateNew}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition-all"
              >
                + Crear y agregar "{query.trim()}"
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
