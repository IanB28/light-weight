import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Dumbbell } from 'lucide-react';
import { Exercise } from '@light-weight/domain';
import {
  EQUIPMENT_LABELS,
  ExerciseEquipmentFilter,
  ExerciseMuscleFilter,
  matchesExerciseFilters,
  MUSCLE_LABELS,
  normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { ExerciseFilterControls } from './ExerciseFilterControls.js';
import { BottomSheet, Button, EmptyState, SearchInput } from './ui/index.js';

interface ExercisePickerProps {
  label: string;
  value: string;
  exercises: Exercise[];
  onChange: (exerciseId: string) => void;
}

export function ExercisePicker({ label, value, exercises, onChange }: ExercisePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<ExerciseMuscleFilter>('all');
  const [equipment, setEquipment] = useState<ExerciseEquipmentFilter>('all');
  const [visibleCount, setVisibleCount] = useState(60);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedExercise = exercises.find((exercise) => exercise.id === value);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    setVisibleCount(60);
  }, [query, muscle, equipment]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = normalizeExerciseSearch(query);
    return exercises.filter((exercise) => matchesExerciseFilters(exercise, normalizedQuery, muscle, equipment));
  }, [equipment, exercises, muscle, query]);

  const resetFilters = () => {
    setQuery('');
    setMuscle('all');
    setEquipment('all');
  };

  const handleSelect = (exerciseId: string) => {
    onChange(exerciseId);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-[10px] font-mono font-bold uppercase text-text-muted">{label}</span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          resetFilters();
          setOpen(true);
        }}
        className="flex min-h-12 w-full items-center gap-3 rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left transition-[background-color,border-color] hover:border-border-active hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-ui-md border border-border-subtle bg-surface text-accent">
          <Dumbbell aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-text-primary">
            {selectedExercise?.name || 'Seleccionar ejercicio'}
          </span>
          {selectedExercise && (
            <span className="block truncate text-[11px] text-text-muted">
              {MUSCLE_LABELS[selectedExercise.primaryMuscle]} · {EQUIPMENT_LABELS[selectedExercise.category]}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Buscar ejercicio"
        description="Busca por nombre o reduce la lista con los filtros."
        className="sm:max-w-lg"
      >
        <div className="space-y-3">
          <SearchInput
            ref={searchRef}
            label="Buscar ejercicio"
            placeholder="Nombre, músculo o equipo…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <ExerciseFilterControls
            muscle={muscle}
            equipment={equipment}
            onMuscleChange={setMuscle}
            onEquipmentChange={setEquipment}
          />

          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border-subtle pb-2 text-xs text-text-muted">
            <span aria-live="polite">
              {filteredExercises.length} {filteredExercises.length === 1 ? 'resultado' : 'resultados'}
            </span>
            {(query || muscle !== 'all' || equipment !== 'all') && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="px-2.5">
                Limpiar filtros
              </Button>
            )}
          </div>

          {filteredExercises.length === 0 ? (
            <EmptyState
              icon={<Dumbbell className="size-5" />}
              title="No encontramos ejercicios"
              description="Prueba con otro nombre o elimina alguno de los filtros."
              actionLabel="Limpiar filtros"
              onAction={resetFilters}
            />
          ) : (
            <div className="max-h-[46dvh] space-y-1 overflow-y-auto overscroll-contain pr-1" aria-label="Resultados de ejercicios">
              {filteredExercises.slice(0, visibleCount).map((exercise) => {
                const selected = exercise.id === value;
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleSelect(exercise.id)}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-ui-lg border px-3 py-2 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-border-subtle hover:bg-surface-active'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-text-primary">{exercise.name}</span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {MUSCLE_LABELS[exercise.primaryMuscle]} · {EQUIPMENT_LABELS[exercise.category]}
                      </span>
                    </span>
                    {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
                  </button>
                );
              })}
              {visibleCount < filteredExercises.length && (
                <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 60)} className="mt-2 w-full">
                  Mostrar 60 más
                </Button>
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
