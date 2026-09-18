import React, { useState, useEffect, useMemo } from 'react';
import { X, Dumbbell, LayoutGrid, List, ArrowLeft, ArrowRight } from 'lucide-react';
import { Routine, Exercise } from '@light-weight/domain';
import {
  ExerciseEquipmentFilter,
  ExerciseMuscleFilter,
  matchesExerciseFilters,
  normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { ExerciseCatalogCard, ExerciseCatalogRow } from './ExerciseCatalogCard.js';
import { ExerciseFilterControls } from './ExerciseFilterControls.js';
import { Button, EmptyState, SearchInput, SegmentedControl } from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { ViewMode } from '../views/LibraryView.js';

export type RoutineCreationStep = 'details' | 'exercises';

export function toggleSelectionOrder(prevIds: string[], id: string): string[] {
  return prevIds.includes(id)
    ? prevIds.filter((x) => x !== id)
    : [...prevIds, id];
}

export function canProceedToStep2(name: string): boolean {
  return name.trim().length > 0;
}

export function canSaveRoutine(name: string, exerciseIds: string[]): boolean {
  return name.trim().length > 0 && exerciseIds.length > 0;
}

export function buildRoutinePayload(
  name: string,
  description: string,
  exerciseIds: string[],
  ownerId?: string
): Routine {
  return {
    id: 'rt-' + Date.now(),
    userId: ownerId || 'local-anonymous',
    name: name.trim(),
    description: description.trim() || undefined,
    exerciseIds: [...exerciseIds],
  };
}

interface CreateRoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  onSaveRoutine: (newRoutine: Routine) => void;
  ownerId?: string;
}

export const CreateRoutineModal: React.FC<CreateRoutineModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSaveRoutine,
  ownerId,
}) => {
  const { t } = useI18n();

  const [step, setStep] = useState<RoutineCreationStep>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<ExerciseMuscleFilter>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<ExerciseEquipmentFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [visibleCount, setVisibleCount] = useState(60);

  // Reset state on modal open/close
  const resetForm = () => {
    setStep('details');
    setName('');
    setDescription('');
    setSelectedExerciseIds([]);
    setSearchTerm('');
    setSelectedMuscle('all');
    setSelectedEquipment('all');
    setViewMode('grid');
    setVisibleCount(60);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Reset visibleCount when search/filters change
  useEffect(() => {
    setVisibleCount(60);
  }, [searchTerm, selectedMuscle, selectedEquipment]);

  if (!isOpen) return null;

  const viewOptions = [
    { value: 'grid', label: t('library.grid'), icon: <LayoutGrid className="size-3.5" aria-hidden="true" /> },
    { value: 'list', label: t('library.list'), icon: <List className="size-3.5" aria-hidden="true" /> }
  ] satisfies { value: ViewMode; label: string; icon: React.ReactNode }[];

  const filteredExercises = availableExercises.filter((exercise) => {
    const normalizedQuery = normalizeExerciseSearch(searchTerm);
    return matchesExerciseFilters(
      exercise,
      normalizedQuery,
      selectedMuscle,
      selectedEquipment
    );
  });

  const toggleSelectExercise = (id: string) => {
    setSelectedExerciseIds((prev) => toggleSelectionOrder(prev, id));
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = () => {
    if (!canSaveRoutine(name, selectedExerciseIds)) return;

    const newRoutine = buildRoutinePayload(name, description, selectedExerciseIds, ownerId);
    onSaveRoutine(newRoutine);
    handleClose();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedMuscle('all');
    setSelectedEquipment('all');
  };

  const selectedCountText =
    selectedExerciseIds.length === 1
      ? t('routine.selectedExercises_one')
      : t('routine.selectedExercises', { count: selectedExerciseIds.length });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="absolute inset-0" onClick={handleClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-routine-title"
        className="relative w-full max-w-xl dark-glass-card border border-white/[0.08] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col z-10 animate-slide-up"
      >
        {/* iOS Grab Handle */}
        <div className="w-full pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08]">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent font-mono">
                {step === 'details'
                  ? t('routine.stepOf', { current: 1, total: 2 })
                  : t('routine.stepOf', { current: 2, total: 2 })}
              </span>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                · {step === 'details' ? t('routine.stepDetails') : t('routine.stepExercises')}
              </span>
            </div>
            <h3
              id="create-routine-title"
              className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight mt-0.5 truncate"
            >
              {step === 'details' ? t('routine.create') : name.trim() || t('routine.create')}
            </h3>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="flex size-10 shrink-0 items-center justify-center rounded-full glass-subcard text-zinc-400 transition-colors hover:border-white/20 hover:text-white active:scale-[0.96]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 'details' ? (
          /* STEP 1: DETAILS */
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1.5">
                  {t('routine.name')} <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('routine.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1.5">
                  {t('routine.descriptionOptional')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('routine.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: EXERCISES */
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 overscroll-contain">
            {/* Top Bar: Selected count & ViewMode Switcher */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-200" aria-live="polite">
                {selectedCountText}
              </span>
              <SegmentedControl
                value={viewMode}
                options={viewOptions}
                onChange={setViewMode}
                label={t('library.view')}
                className="w-[140px] shrink-0"
              />
            </div>

            {/* Selected Chips Strip (Scrollable) */}
            {selectedExerciseIds.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {selectedExerciseIds.map((id) => {
                  const ex = availableExercises.find((e) => e.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/30"
                    >
                      <span className="max-w-[140px] truncate">{ex?.name || id}</span>
                      <button
                        type="button"
                        onClick={() => toggleSelectExercise(id)}
                        aria-label={`Quitar ${ex?.name || id}`}
                        className="hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search Input */}
            <SearchInput
              label={t('routine.searchExercises')}
              placeholder={t('routine.searchExercises')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* Filters (Muscle & Equipment) */}
            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
              <ExerciseFilterControls
                muscle={selectedMuscle}
                equipment={selectedEquipment}
                onMuscleChange={setSelectedMuscle}
                onEquipmentChange={setSelectedEquipment}
              />
            </div>

            {/* Catalog list / grid */}
            <div className="space-y-2 pt-1">
              <div className="px-1 text-[11px] text-zinc-400" aria-live="polite">
                {filteredExercises.length} {filteredExercises.length === 1 ? t('library.exercise') : t('library.exercises')}
              </div>

              {filteredExercises.length === 0 ? (
                <EmptyState
                  icon={<Dumbbell className="size-5" />}
                  title={t('library.noResults')}
                  description={t('library.noResultsDescription')}
                  actionLabel={t('library.clearFilters')}
                  onAction={clearFilters}
                />
              ) : viewMode === 'list' ? (
                <div className="glass-surface divide-y divide-border-subtle overflow-hidden rounded-ui-xl border border-border-subtle shadow-card">
                  {filteredExercises.slice(0, visibleCount).map((ex) => (
                    <ExerciseCatalogRow
                      key={ex.id}
                      exercise={ex}
                      mode="routine-selection"
                      selected={selectedExerciseIds.includes(ex.id)}
                      onToggleSelect={toggleSelectExercise}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredExercises.slice(0, visibleCount).map((ex) => (
                    <ExerciseCatalogCard
                      key={ex.id}
                      exercise={ex}
                      mode="routine-selection"
                      selected={selectedExerciseIds.includes(ex.id)}
                      onToggleSelect={toggleSelectExercise}
                    />
                  ))}
                </div>
              )}

              {/* Load More Button */}
              {visibleCount < filteredExercises.length && (
                <div className="pt-2 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setVisibleCount((prev) => prev + 60)}
                    className="rounded-full"
                  >
                    <span>{t('library.loadMore')}</span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {t('library.showing', { visible: Math.min(visibleCount, filteredExercises.length), total: filteredExercises.length })}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-black/40 flex items-center gap-2.5 shrink-0">
          {step === 'details' ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl transition-all border border-white/[0.08]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => setStep('exercises')}
                disabled={!canProceedToStep2(name)}
                className={`flex-1 py-3 flex items-center justify-center gap-1.5 font-extrabold text-xs rounded-xl transition-all shadow-lg ${
                  canProceedToStep2(name)
                    ? 'bg-accent hover:brightness-110 text-accent-fg active:scale-[0.98] shadow-accent/20 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <span>{t('routine.next')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="flex-1 py-3 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl transition-all border border-white/[0.08]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('routine.back')}</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSaveRoutine(name, selectedExerciseIds)}
                title={selectedExerciseIds.length === 0 ? t('routine.selectAtLeastOne') : undefined}
                className={`flex-1 py-3 font-extrabold text-xs rounded-xl transition-all shadow-lg ${
                  canSaveRoutine(name, selectedExerciseIds)
                    ? 'bg-accent hover:brightness-110 text-accent-fg active:scale-[0.98] shadow-accent/20 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {t('routine.save')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
