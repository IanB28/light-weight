import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Dumbbell, Check, Eye, ChevronRight, List, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { Exercise } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';
import {
  ExerciseEquipmentFilter,
  ExerciseMuscleFilter,
  matchesExerciseFilters,
  normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { ExerciseMediaModal } from '../components/ExerciseMediaModal.js';
import { ExerciseFilterControls } from '../components/ExerciseFilterControls.js';
import { ViewHeader } from '../components/ViewHeader.js';
import { AppCard, BottomSheet, Button, EmptyState, ErrorState, LoadingState, SearchInput, SegmentedControl } from '../components/ui/index.js';

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

const VIEW_OPTIONS = [
  { value: 'list', label: 'Lista', icon: <List className="size-3.5" aria-hidden="true" /> },
  { value: 'grid', label: 'Grid', icon: <LayoutGrid className="size-3.5" aria-hidden="true" /> }
] satisfies { value: ViewMode; label: string; icon: React.ReactNode }[];

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
  const [selectedMuscle, setSelectedMuscle] = useState<ExerciseMuscleFilter>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<ExerciseEquipmentFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const filteredExercises = useMemo(() => {
    const normalizedQuery = normalizeExerciseSearch(searchTerm);
    return allExercises.filter((exercise) => matchesExerciseFilters(
      exercise,
      normalizedQuery,
      selectedMuscle,
      selectedEquipment
    ));
  }, [allExercises, searchTerm, selectedMuscle, selectedEquipment]);

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
    setSelectedEquipment('all');
  };

  const clearFacetFilters = () => {
    setSelectedMuscle('all');
    setSelectedEquipment('all');
  };

  const activeFilterCount = Number(selectedMuscle !== 'all') + Number(selectedEquipment !== 'all');

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
        isWorkoutActive={isWorkoutActive}
        activeWorkoutDuration={activeWorkoutDuration}
        onNavigateToWorkout={onNavigateToWorkout}
        onOpenSettings={onOpenSettings}
      />

      {/* Search bar */}
      <SearchInput
          label="Buscar ejercicios"
          placeholder="Buscar entre 1,300+ ejercicios por nombre o músculo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Filtros y preferencia de vista permanecen disponibles sin competir con la búsqueda. */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          className="shrink-0"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filtros{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </Button>
        <SegmentedControl value={viewMode} options={VIEW_OPTIONS} onChange={handleSetViewMode} label="Vista de la biblioteca" className="w-[146px] shrink-0" />
      </div>

      <div className="px-1 text-xs text-text-muted" aria-live="polite">
        {filteredExercises.length} {filteredExercises.length === 1 ? 'ejercicio' : 'ejercicios'}
      </div>

      {/* 6. Contenido Principal: Lista vs Recuadros */}
      {filteredExercises.length === 0 ? (
        <AppCard><EmptyState icon={<Dumbbell className="size-5" />} title="No encontramos ejercicios con estos filtros." description="Intenta ajustar los términos de búsqueda o los filtros de músculo y equipo." actionLabel="Limpiar filtros" onAction={clearFilters} /></AppCard>
      ) : viewMode === 'list' ? (
        /* MODO LISTA: Estilo iOS Health agrupado con divisores sutiles */
        <div className="glass-surface divide-y divide-border-subtle overflow-hidden rounded-ui-xl border border-border-subtle shadow-card">
          {filteredExercises.slice(0, visibleCount).map((ex) => {
            const isAdded = addedIds[ex.id];
            const imgUrl = getExerciseImgUrl(ex);

            return (
              <div
                key={ex.id}
                className="group flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-surface-active"
              >
                {/* Thumbnail 44x44 + Nombre */}
                <button type="button" onClick={() => setSelectedMediaExercise(ex)} aria-label={`Ver técnica de ${ex.name}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-ui-md pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input text-text-muted shadow-sm transition-colors group-hover:border-border-active">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <Dumbbell className="size-5 stroke-[1.8] text-text-muted" />
                    )}
                    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-app/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <Eye className="size-3.5 text-accent" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="block truncate text-sm font-bold tracking-tight text-text-primary transition-colors group-hover:text-accent">
                      {ex.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] capitalize text-text-muted">
                      {ex.primaryMuscle} • {ex.category}
                    </span>
                  </div>
                </button>

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
                    aria-label={isWorkoutActive ? `Añadir ${ex.name} al entrenamiento activo` : `Entrenar con ${ex.name}`}
                    aria-live="polite"
                    className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-[transform,background-color,color] duration-150 active:scale-[0.96] ${
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

                  <div aria-hidden="true" className="flex size-4 items-center justify-center text-text-muted transition-colors group-hover:text-text-secondary">
                    <ChevronRight className="size-4" />
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
                className="glass-surface group flex min-w-0 flex-col justify-between rounded-[22px] border border-border-subtle p-3 shadow-card transition-colors hover:border-border-active"
              >
                <button type="button" onClick={() => setSelectedMediaExercise(ex)} aria-label={`Ver técnica de ${ex.name}`} className="min-w-0 rounded-ui-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {/* Caja de Imagen Cuadrada */}
                  <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-ui-lg border border-border-subtle bg-surface-input transition-colors group-hover:border-border-active">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Dumbbell className="size-8 stroke-[1.6] text-text-muted" />
                    )}

                    {/* Tag de Músculo Flotante */}
                    <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold capitalize text-text-secondary shadow-sm">
                      {ex.primaryMuscle}
                    </span>

                    {/* Overlay de Hover para ver técnica */}
                    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center gap-1 bg-app/45 text-xs font-medium text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <Eye className="size-3.5 text-accent" />
                      <span>Ver técnica</span>
                    </div>
                  </div>

                  {/* Datos del Ejercicio */}
                  <div className="mt-2.5 min-w-0">
                    <span className="line-clamp-2 text-xs font-bold leading-snug tracking-tight text-text-primary transition-colors group-hover:text-accent">
                      {ex.name}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] capitalize text-text-muted">
                      {ex.category}
                    </span>
                  </div>
                </button>

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
                    aria-label={isWorkoutActive ? `Añadir ${ex.name} al entrenamiento activo` : `Entrenar con ${ex.name}`}
                    aria-live="polite"
                    className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-ui-md px-2 text-xs font-bold transition-[transform,background-color,color] duration-150 active:scale-[0.96] ${
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
          <Button
            variant="secondary"
            onClick={() => setVisibleCount((prev) => prev + 40)}
            className="rounded-full"
          >
            <span>Cargar más ejercicios (+40)</span>
            <span className="font-mono text-[11px] text-text-muted">
              {visibleCount} de {filteredExercises.length}
            </span>
          </Button>
        </div>
      )}

      {/* 8. Modal de Demostración Visual (GIF & Instrucciones) */}
      <ExerciseMediaModal
        exercise={selectedMediaExercise}
        isOpen={Boolean(selectedMediaExercise)}
        onClose={() => setSelectedMediaExercise(null)}
      />

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        description="Reduce la biblioteca por músculo o equipo."
      >
        <div className="space-y-5">
          <ExerciseFilterControls
            muscle={selectedMuscle}
            equipment={selectedEquipment}
            onMuscleChange={setSelectedMuscle}
            onEquipmentChange={setSelectedEquipment}
          />
          <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-4">
            <Button variant="secondary" onClick={clearFacetFilters} disabled={activeFilterCount === 0}>
              Limpiar
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              Mostrar {filteredExercises.length}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
