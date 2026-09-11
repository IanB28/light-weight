import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Dumbbell, SlidersHorizontal } from 'lucide-react';
import { Exercise, ExerciseCategory, MuscleGroup } from '@light-weight/domain';
import { BottomSheet, Button, Chip, EmptyState, SearchInput } from './ui/index.js';

interface ExercisePickerProps {
  label: string;
  value: string;
  exercises: Exercise[];
  onChange: (exerciseId: string) => void;
}

const MUSCLE_OPTIONS: { value: 'all' | MuscleGroup; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'chest', label: 'Pecho' },
  { value: 'back', label: 'Espalda' },
  { value: 'shoulders', label: 'Hombros' },
  { value: 'quadriceps', label: 'Cuádriceps' },
  { value: 'hamstrings', label: 'Femoral' },
  { value: 'glutes', label: 'Glúteos' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'forearms', label: 'Antebrazos' },
  { value: 'core', label: 'Core' },
  { value: 'calves', label: 'Gemelos' }
];

const EQUIPMENT_OPTIONS: { value: 'all' | ExerciseCategory; label: string }[] = [
  { value: 'all', label: 'Todo el equipo' },
  { value: 'barbell', label: 'Barra' },
  { value: 'dumbbell', label: 'Mancuernas' },
  { value: 'machine', label: 'Máquina' },
  { value: 'cable', label: 'Polea' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'other', label: 'Otro' }
];

const MUSCLE_LABELS = Object.fromEntries(
  MUSCLE_OPTIONS.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
) as Record<MuscleGroup, string>;

const EQUIPMENT_LABELS = Object.fromEntries(
  EQUIPMENT_OPTIONS.filter((option) => option.value !== 'all').map((option) => [option.value, option.label])
) as Record<ExerciseCategory, string>;

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .trim();

export function ExercisePicker({ label, value, exercises, onChange }: ExercisePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<'all' | MuscleGroup>('all');
  const [equipment, setEquipment] = useState<'all' | ExerciseCategory>('all');
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
    const normalizedQuery = normalizeSearch(query);
    return exercises.filter((exercise) => {
      const searchableText = normalizeSearch([
        exercise.name,
        exercise.targetMuscle || '',
        MUSCLE_LABELS[exercise.primaryMuscle],
        EQUIPMENT_LABELS[exercise.category]
      ].join(' '));
      const matchesQuery = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
      const matchesMuscle = muscle === 'all' || exercise.primaryMuscle === muscle || exercise.secondaryMuscles?.includes(muscle);
      const matchesEquipment = equipment === 'all' || exercise.category === equipment;
      return matchesQuery && matchesMuscle && matchesEquipment;
    });
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

          <div className="space-y-2" aria-label="Filtros de ejercicios">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-text-secondary">
              <SlidersHorizontal aria-hidden="true" className="size-3.5 text-accent" />
              Grupo muscular
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-smooth scrollbar-none">
              {MUSCLE_OPTIONS.map((option) => (
                <Chip key={option.value} selected={muscle === option.value} onClick={() => setMuscle(option.value)}>
                  {option.label}
                </Chip>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-smooth scrollbar-none">
              {EQUIPMENT_OPTIONS.map((option) => (
                <Chip key={option.value} selected={equipment === option.value} onClick={() => setEquipment(option.value)}>
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

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
