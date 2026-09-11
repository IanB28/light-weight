import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Dumbbell, Check, Eye, ChevronRight, List, LayoutGrid } from 'lucide-react';
import { Exercise, MuscleGroup } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { ViewHeader } from '../components/ViewHeader.js';
import { AppCard, Button, ErrorState, LoadingState } from '../components/ui/index.js';

interface LibraryViewProps {
  exercises?: Exercise[];
  isWorkoutActive?: boolean;
  activeWorkoutDuration?: string;
  onNavigateToWorkout?: () => void;
  onOpenSettings?: () => void;
  onAddExerciseToActiveWorkout?: (exercise: Exercise) => void;
  onStartWorkoutWithExercise?: (exercise: Exercise) => void;
  catalogStatus?: 'loading' | 'ready' | 'error';
  onRetryCatalog?: () => void;
}

type ViewMode = 'list' | 'grid';

export const LibraryView: React.FC<LibraryViewProps> = ({
  exercises = [],
  isWorkoutActive = false,
  activeWorkoutDuration = '00:00',
  onNavigateToWorkout,
  onOpenSettings,
  onAddExerciseToActiveWorkout,
  onStartWorkoutWithExercise,
  catalogStatus = 'ready',
  onRetryCatalog
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('any');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [selectedMediaExercise, setSelectedMediaExercise] = useState<Exercise | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  // Modo de visualización: 'list' (iOS Health) o 'grid' (recuadros)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('lightweight_exercise_view_mode');
      return saved === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('lightweight_exercise_view_mode', mode);
    } catch {}
  };

  // Resetear límite visible al cambiar filtros
  useEffect(() => {
    setVisibleCount(60);
  }, [searchTerm, selectedMuscle, selectedEquipment]);

  // Usar el catálogo completo de 1,300+ ejercicios si no se especifican otros
  const allExercises = exercises;

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

  const filteredExercises = useMemo(() => allExercises.filter((ex) => {
    const query = searchTerm.trim().toLocaleLowerCase('es');
    const matchesSearch =
      ex.name.toLocaleLowerCase('es').includes(query) ||
      ex.category.toLowerCase().includes(query) ||
      Boolean(ex.targetMuscle?.toLocaleLowerCase('es').includes(query));
    const matchesMuscle =
      selectedMuscle === 'all' ||
      ex.primaryMuscle === selectedMuscle ||
      ex.secondaryMuscles?.includes(selectedMuscle as MuscleGroup);
    const matchesEquipment =
      selectedEquipment === 'any' || ex.category === selectedEquipment;

    return matchesSearch && matchesMuscle && matchesEquipment;
  }), [allExercises, searchTerm, selectedMuscle, selectedEquipment]);

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

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedMuscle('all');
    setSelectedEquipment('any');
  };

  if (catalogStatus !== 'ready') {
    return (
      <div className="space-y-4 pb-28">
        <ViewHeader
          title="Biblioteca"
          subtitle="Catálogo de ejercicios y técnica"
          isWorkoutActive={isWorkoutActive}
          activeWorkoutDuration={activeWorkoutDuration}
          onNavigateToWorkout={onNavigateToWorkout}
          onOpenSettings={onOpenSettings}
        />
        <AppCard>
          {catalogStatus === 'loading' ? (
            <LoadingState title="Cargando ejercicios…" description="Preparando el catálogo para búsqueda y filtros." />
          ) : (
            <ErrorState title="No pudimos cargar los ejercicios" description="Comprueba la conexión e inténtalo de nuevo." onAction={onRetryCatalog} />
          )}
        </AppCard>
      </div>
    );
  }

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

      {/* 5. Barra de Control de Visualización (Segmented Control: Lista vs Recuadros) */}
      <div className="flex items-center justify-between pt-1 pb-0.5 px-2">
        <div className="text-xs text-zinc-400 font-medium">
          Mostrando <span className="text-white font-bold">{Math.min(visibleCount, filteredExercises.length)}</span> de {filteredExercises.length}
        </div>

        <div className="flex items-center p-0.5 rounded-xl bg-black/40 border border-white/[0.08] shadow-inner">
          <button
            type="button"
            onClick={() => handleSetViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
              viewMode === 'list'
                ? 'bg-accent text-accent-fg font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Ver como Lista (estilo iOS Health)"
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-accent text-accent-fg font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Ver como Recuadros"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Recuadros</span>
          </button>
        </div>
      </div>

      {/* 6. Contenido Principal: Lista vs Recuadros */}
      {filteredExercises.length === 0 ? (
        <div className="py-12 px-4 text-center dark-glass-card rounded-[28px] border border-white/[0.08]">
          <Dumbbell className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-white">No encontramos ejercicios con estos filtros.</p>
          <p className="text-xs text-zinc-400 mt-1">
            Intenta ajustar los términos de búsqueda o los filtros de músculo y equipo.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : viewMode === 'list' ? (
        /* MODO LISTA: Estilo iOS Health agrupado con divisores sutiles */
        <div className="dark-glass-card rounded-[28px] border border-white/[0.08] overflow-hidden shadow-2xl divide-y divide-white/[0.06]">
          {filteredExercises.slice(0, visibleCount).map((ex) => {
            const isAdded = addedIds[ex.id];
            const imgUrl = getExerciseImgUrl(ex);

            return (
              <div
                key={ex.id}
                onClick={() => setSelectedMediaExercise(ex)}
                className="px-3.5 py-3 flex items-center justify-between hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer group"
              >
                {/* Thumbnail 44x44 + Nombre */}
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                  <div className="relative w-11 h-11 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-400 overflow-hidden shrink-0 group-hover:border-white/20 transition-all shadow-sm">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={ex.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Dumbbell className="w-5 h-5 stroke-[1.8] text-zinc-400" />
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Eye className="w-3.5 h-3.5 text-accent" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white tracking-tight truncate group-hover:text-accent transition-colors">
                      {ex.name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 capitalize font-mono mt-0.5 truncate">
                      {ex.primaryMuscle} • {ex.category}
                    </p>
                  </div>
                </div>

                {/* Botón de Pesa (Dumbbell) + Chevron iOS */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(ex);
                    }}
                    title={
                      isWorkoutActive
                        ? 'Añadir al entrenamiento activo'
                        : 'Entrenar este ejercicio'
                    }
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
                        <Dumbbell className="w-3.5 h-3.5" />
                        <span>Entrenar</span>
                      </>
                    )}
                  </button>

                  <div className="w-4 h-4 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODO RECUADROS: Cuadrícula responsive de tarjetas */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
          {filteredExercises.slice(0, visibleCount).map((ex) => {
            const isAdded = addedIds[ex.id];
            const imgUrl = getExerciseImgUrl(ex);

            return (
              <div
                key={ex.id}
                onClick={() => setSelectedMediaExercise(ex)}
                className="dark-glass-card rounded-[22px] border border-white/[0.08] p-3 flex flex-col justify-between hover:border-white/20 transition-all active:scale-[0.98] shadow-lg group cursor-pointer"
              >
                <div>
                  {/* Caja de Imagen Cuadrada */}
                  <div className="aspect-square w-full rounded-2xl bg-zinc-900 border border-white/[0.08] overflow-hidden relative flex items-center justify-center group-hover:border-white/20 transition-all">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={ex.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Dumbbell className="w-8 h-8 stroke-[1.6] text-zinc-500" />
                    )}

                    {/* Tag de Músculo Flotante */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full glass-subcard text-[10px] font-semibold text-zinc-300 backdrop-blur-md capitalize max-w-[80%] truncate shadow-sm">
                      {ex.primaryMuscle}
                    </span>

                    {/* Overlay de Hover para ver técnica */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-medium">
                      <Eye className="w-3.5 h-3.5 text-accent" />
                      <span>Ver técnica</span>
                    </div>
                  </div>

                  {/* Datos del Ejercicio */}
                  <div className="mt-2.5 min-w-0">
                    <h4 className="text-xs font-bold text-white tracking-tight line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                      {ex.name}
                    </h4>
                    <p className="text-[10px] text-zinc-400 capitalize font-mono truncate mt-1">
                      {ex.category}
                    </p>
                  </div>
                </div>

                {/* Botón de Pesa (Dumbbell) al Pie */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(ex);
                    }}
                    title={
                      isWorkoutActive
                        ? 'Añadir al entrenamiento activo'
                        : 'Entrenar este ejercicio'
                    }
                    className={`w-full flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-150 active:scale-[0.95] cursor-pointer ${
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
                        <Dumbbell className="w-3.5 h-3.5" />
                        <span>Entrenar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Botón Cargar Más Ejercicios */}
      {visibleCount < filteredExercises.length && (
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 40)}
            className="px-5 py-2.5 rounded-full glass-subcard hover:border-white/20 active:scale-95 text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer shadow-md flex items-center gap-2"
          >
            <span>Cargar más ejercicios (+40)</span>
            <span className="text-[11px] font-mono text-zinc-500">
              {visibleCount} de {filteredExercises.length}
            </span>
          </button>
        </div>
      )}

      {/* 8. Modal de Demostración Visual (GIF & Instrucciones) */}
      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />
    </div>
  );
};
