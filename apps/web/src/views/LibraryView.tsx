import React, { useState } from 'react';
import { Search, Plus, Dumbbell, Sparkles, Check, Play } from 'lucide-react';
import { Exercise, MuscleGroup } from '@light-weight/domain';

interface LibraryViewProps {
  exercises: Exercise[];
  isWorkoutActive?: boolean;
  onAddExerciseToActiveWorkout?: (exercise: Exercise) => void;
  onStartWorkoutWithExercise?: (exercise: Exercise) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  exercises,
  isWorkoutActive = false,
  onAddExerciseToActiveWorkout,
  onStartWorkoutWithExercise
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('any');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const muscleChips = [
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

  const equipmentChips = [
    { id: 'any', label: 'Cualquier equipo' },
    { id: 'barbell', label: 'Barra' },
    { id: 'dumbbell', label: 'Mancuernas' },
    { id: 'cable', label: 'Polea' },
    { id: 'bodyweight', label: 'Peso Corporal' }
  ];

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMuscle =
      selectedMuscle === 'all' ||
      ex.primaryMuscle === selectedMuscle ||
      ex.secondaryMuscles?.includes(selectedMuscle as MuscleGroup);
    const matchesEquipment =
      selectedEquipment === 'any' || ex.category === selectedEquipment;

    return matchesSearch && matchesMuscle && matchesEquipment;
  });

  const handleAction = (ex: Exercise) => {
    if (isWorkoutActive && onAddExerciseToActiveWorkout) {
      onAddExerciseToActiveWorkout(ex);
      setAddedIds((prev) => ({ ...prev, [ex.id]: true }));
      setTimeout(() => {
        setAddedIds((prev) => ({ ...prev, [ex.id]: false }));
      }, 1500);
    } else if (onStartWorkoutWithExercise) {
      onStartWorkoutWithExercise(ex);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Exercises Header */}
      <div className="pt-1">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Biblioteca de Ejercicios</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          {exercises.length} movimientos disponibles • Toca para añadir a tu sesión
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar ejercicio o grupo muscular..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#121416]/80 backdrop-blur-xl border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
        />
      </div>

      {/* Muscle Filter Chips (Row 1) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {muscleChips.map((chip) => {
          const isActive = selectedMuscle === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setSelectedMuscle(chip.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.93] cursor-pointer ${
                isActive
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                  : 'bg-[#121416]/80 backdrop-blur-md border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Equipment Filter Chips (Row 2) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {equipmentChips.map((chip) => {
          const isActive = selectedEquipment === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setSelectedEquipment(chip.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.93] cursor-pointer ${
                isActive
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                  : 'bg-[#121416]/80 backdrop-blur-md border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Lista de Ejercicios */}
      <div className="space-y-2">
        {filteredExercises.map((ex) => {
          const isAdded = addedIds[ex.id];
          return (
            <div
              key={ex.id}
              className="p-3.5 rounded-3xl bg-[#121416]/75 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.14] transition-all flex items-center justify-between shadow-xl relative overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-zinc-800/80 border border-white/[0.08] flex items-center justify-center text-zinc-400 overflow-hidden">
                  <Dumbbell className="w-5 h-5 stroke-[1.8] text-zinc-300" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white tracking-tight">{ex.name}</h4>
                  <p className="text-[11px] text-zinc-400 capitalize mt-0.5 font-mono">
                    {ex.primaryMuscle} • {ex.category}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAction(ex)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 active:scale-[0.92] cursor-pointer ${
                  isAdded
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25'
                    : isWorkoutActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/[0.06]'
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>¡Añadido!</span>
                  </>
                ) : isWorkoutActive ? (
                  <>
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Añadir</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Entrenar</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
