import React, { useState } from 'react';
import { Search, Plus, Dumbbell, Check, Play, Eye } from 'lucide-react';
import { Exercise, MuscleGroup } from '@light-weight/domain';
import { CATALOG_EXERCISES, getExerciseImgUrl } from '../lib/exercises.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { ViewHeader } from '../components/ViewHeader.js';

interface LibraryViewProps {
  exercises?: Exercise[];
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
  onAddExerciseToActiveWorkout?: (exercise: Exercise) => void;
  onStartWorkoutWithExercise?: (exercise: Exercise) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  exercises = CATALOG_EXERCISES,
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings,
  onAddExerciseToActiveWorkout,
  onStartWorkoutWithExercise
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('any');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);

  // Usar el catálogo completo de 1,300+ ejercicios si no se especifican otros
  const allExercises = exercises.length > 0 ? exercises : CATALOG_EXERCISES;

  const muscleChips = [
    { id: 'all', label: 'Todos' },
    { id: 'chest', label: 'Pecho' },
    { id: 'back', label: 'Espalda' },
    { id: 'quadriceps', label: 'Cuádriceps' },
    { id: 'hamstrings', label: 'Femoral' },
    { id: 'glutes', label: 'Glúteos' },
    { id: 'shoulders', label: 'Hombros' },
    { id: 'biceps', label: 'Bíceps' },
    { id: 'triceps', label: 'Tríceps' },
    { id: 'core', label: 'Core' },
    { id: 'calves', label: 'Gemelos' }
  ];

  const equipmentChips = [
    { id: 'any', label: 'Cualquier equipo' },
    { id: 'barbell', label: 'Barra' },
    { id: 'dumbbell', label: 'Mancuernas' },
    { id: 'cable', label: 'Polea' },
    { id: 'bodyweight', label: 'Peso Corporal' },
    { id: 'machine', label: 'Máquina' }
  ];

  const filteredExercises = allExercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ex.targetMuscle && ex.targetMuscle.toLowerCase().includes(searchTerm.toLowerCase()));
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
      {/* 1. Header Homogéneo */}
      <ViewHeader
        title="Biblioteca"
        subtitle={`${filteredExercises.length} ejercicios con GIFs de técnica`}
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      {/* Search bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar entre 1,300+ ejercicios por nombre o músculo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-11 pl-10 pr-4 rounded-2xl glass-subcard border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent transition-colors shadow-inner"
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
                  ? 'bg-accent text-accent-fg shadow-md shadow-accent/20 font-bold'
                  : 'glass-subcard text-zinc-400 hover:text-white'
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
                  ? 'bg-accent text-accent-fg shadow-md shadow-accent/20 font-bold'
                  : 'glass-subcard text-zinc-400 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Lista de Ejercicios */}
      <div className="space-y-2">
        {filteredExercises.slice(0, 60).map((ex) => {
          const isAdded = addedIds[ex.id];
          const imgUrl = getExerciseImgUrl(ex);

          return (
            <div
              key={ex.id}
              className="p-3 dark-glass-card rounded-[28px] border border-white/[0.08] hover:border-white/15 transition-all flex items-center justify-between shadow-xl"
            >
              {/* Thumbnail + Name */}
              <div
                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 pr-2"
                onClick={() => setSelectedMediaExercise(ex)}
                title="Toca para ver el GIF y la técnica"
              >
                <div className="relative w-12 h-12 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-400 overflow-hidden shrink-0 group">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={ex.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <Dumbbell className="w-5 h-5 stroke-[1.8] text-zinc-300" />
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-4 h-4 text-accent" />
                  </div>
                </div>

                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white tracking-tight truncate hover:text-accent transition-colors">
                    {ex.name}
                  </h4>
                  <p className="text-[11px] text-zinc-400 capitalize mt-0.5 font-mono truncate">
                    {ex.primaryMuscle} • {ex.category}
                  </p>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedMediaExercise(ex)}
                  className="w-8 h-8 rounded-full glass-subcard flex items-center justify-center text-zinc-400 hover:text-accent transition-colors active:scale-90"
                  title="Ver GIF y técnica"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleAction(ex)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 active:scale-[0.92] cursor-pointer ${
                    isAdded
                      ? 'bg-accent text-accent-fg shadow-md shadow-accent/20'
                      : isWorkoutActive
                      ? 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent hover:text-accent-fg'
                      : 'bg-accent text-accent-fg hover:brightness-110 shadow-sm'
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
            </div>
          );
        })}
      </div>

      {/* Modal de Demostración Visual (GIF & Instrucciones) */}
      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />
    </div>
  );
};
