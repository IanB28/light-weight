import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Dumbbell,
  LayoutGrid,
  List,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2
} from 'lucide-react';
import { Exercise, Routine, WorkoutSetType } from '@light-weight/domain';
import {
  ExerciseEquipmentFilter,
  ExerciseMuscleFilter,
  matchesExerciseFilters,
  normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { ExerciseCatalogCard, ExerciseCatalogRow } from './ExerciseCatalogCard.js';
import { ExerciseFilterControls } from './ExerciseFilterControls.js';
import {
  Button,
  EmptyState,
  Modal,
  OptionPicker,
  SearchInput,
  SegmentedControl
} from './ui/index.js';
import { useI18n } from '../lib/i18n.js';
import { ViewMode } from '../views/LibraryView.js';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { AppPreferences } from '../lib/preferences.js';
import { displayWeight, parseDisplayWeight } from '../lib/weight-units.js';
import {
  RoutineEditorDraft,
  addRoutineExerciseTemplate,
  addRoutineTemplateSet,
  buildRoutineFromEditorDraft,
  canSaveRoutineEditorDraft,
  createRoutineEditorDraft,
  isRoutineEditorDraftDirty,
  moveRoutineExercise,
  removeRoutineExerciseTemplate,
  removeRoutineTemplateSet,
  updateRoutineTemplateSet
} from '../features/routines/routine-editor-draft.js';

export type RoutineCreationStep = 'details' | 'exercises';

export interface RoutineEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  onSaveRoutine: (routine: Routine) => void;
  mode?: 'create' | 'edit';
  initialRoutine?: Routine | null;
  ownerId?: string;
  preferences?: AppPreferences;
  initialStep?: RoutineCreationStep;
  initialExpandedExerciseId?: string | null;
}

export const RoutineEditorModal: React.FC<RoutineEditorModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSaveRoutine,
  mode = 'create',
  initialRoutine = null,
  ownerId,
  preferences,
  initialStep = 'details',
  initialExpandedExerciseId = null
}) => {
  const { t } = useI18n();
  const units = preferences?.units || 'metric';

  const [step, setStep] = useState<RoutineCreationStep>(initialStep);
  const [draft, setDraft] = useState<RoutineEditorDraft>(() =>
    createRoutineEditorDraft(initialRoutine, ownerId)
  );
  const initialDraftRef = useRef<RoutineEditorDraft>(draft);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<ExerciseMuscleFilter>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<ExerciseEquipmentFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [visibleCount, setVisibleCount] = useState(60);

  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(initialExpandedExerciseId);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Initialize draft when modal opens or initialRoutine changes
  useEffect(() => {
    if (isOpen) {
      const initial = createRoutineEditorDraft(initialRoutine, ownerId);
      setDraft(initial);
      initialDraftRef.current = initial;
      setStep(initialStep);
      setSearchTerm('');
      setSelectedMuscle('all');
      setSelectedEquipment('all');
      setViewMode('grid');
      setVisibleCount(60);
      setExpandedExerciseId(initialExpandedExerciseId);
      setShowDiscardConfirm(false);
    }
  }, [isOpen, initialRoutine, ownerId, initialStep, initialExpandedExerciseId]);

  useEffect(() => {
    setVisibleCount(60);
  }, [searchTerm, selectedMuscle, selectedEquipment]);

  if (!isOpen) return null;

  const isDirty = isRoutineEditorDraftDirty(initialDraftRef.current, draft);
  const exerciseMap = new Map(availableExercises.map((e) => [e.id, e]));

  const viewOptions = [
    { value: 'grid', label: t('library.grid'), icon: <LayoutGrid className="size-3.5" aria-hidden="true" /> },
    { value: 'list', label: t('library.list'), icon: <List className="size-3.5" aria-hidden="true" /> }
  ] satisfies { value: ViewMode; label: string; icon: React.ReactNode }[];

  const filteredExercises = availableExercises.filter((exercise) => {
    const normalizedQuery = normalizeExerciseSearch(searchTerm);
    return matchesExerciseFilters(exercise, normalizedQuery, selectedMuscle, selectedEquipment);
  });

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleSave = () => {
    if (!canSaveRoutineEditorDraft(draft)) return;
    const routine = buildRoutineFromEditorDraft(draft);
    onSaveRoutine(routine);
    onClose();
  };

  const toggleSelectExercise = (exerciseId: string) => {
    const exists = draft.exercises.some((e) => e.exerciseId === exerciseId);
    if (exists) {
      setDraft((prev) => removeRoutineExerciseTemplate(prev, exerciseId));
      if (expandedExerciseId === exerciseId) {
        setExpandedExerciseId(null);
      }
    } else {
      setDraft((prev) => addRoutineExerciseTemplate(prev, exerciseId));
    }
  };

  const selectedCountText =
    draft.exercises.length === 1
      ? t('routine.selectedExercises_one')
      : t('routine.selectedExercises', { count: draft.exercises.length });

  const modalTitle =
    mode === 'edit'
      ? t('routine.edit')
      : step === 'details'
        ? t('routine.create')
        : draft.name.trim() || t('routine.create');

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
        <div className="absolute inset-0" onClick={handleRequestClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="routine-editor-title"
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
                id="routine-editor-title"
                className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight mt-0.5 truncate"
              >
                {modalTitle}
              </h3>
            </div>

            <button
              type="button"
              onClick={handleRequestClose}
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
                    autoFocus={mode === 'create'}
                    placeholder={t('routine.namePlaceholder')}
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
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
                    value={draft.description}
                    onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full p-3 rounded-xl bg-zinc-900/80 border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: EXERCISES & STRUCTURE */
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
              {/* Selected Routine Structure Section */}
              {draft.exercises.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-zinc-200">
                      {t('routine.structureTitle')}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {selectedCountText}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {draft.exercises.map((exDraft, index) => {
                      const exercise = exerciseMap.get(exDraft.exerciseId);
                      const isExpanded = expandedExerciseId === exDraft.exerciseId;
                      const imgUrl = exercise ? getExerciseImgUrl(exercise) : null;
                      const setsCount = exDraft.sets.length;
                      const setsCountLabel =
                        setsCount === 1
                          ? t('routine.setsCount_one')
                          : t('routine.setsCount', { count: setsCount });

                      const minWeight = Math.min(...exDraft.sets.map((s) => s.targetWeightKg));
                      const maxWeight = Math.max(...exDraft.sets.map((s) => s.targetWeightKg));
                      const minDisplay = displayWeight(minWeight, units);
                      const maxDisplay = displayWeight(maxWeight, units);
                      const unitLabel = units === 'imperial' ? 'lb' : 'kg';
                      const weightSummary =
                        minDisplay === maxDisplay
                          ? `${minDisplay} ${unitLabel}`
                          : `${minDisplay}–${maxDisplay} ${unitLabel}`;

                      return (
                        <div
                          key={exDraft.exerciseId}
                          className={`rounded-ui-xl border transition-all ${
                            isExpanded
                              ? 'border-accent/40 bg-zinc-900/90 shadow-lg'
                              : 'border-white/[0.08] bg-zinc-900/50 hover:border-white/15'
                          }`}
                        >
                          {/* Exercise Card Summary Bar */}
                          <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5">
                            {/* Position Badge */}
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px] font-mono font-bold text-zinc-400">
                              {`#${index + 1}`}
                            </div>

                            {/* Thumbnail */}
                            <div className="size-9 shrink-0 flex items-center justify-center rounded-ui-md border border-border-subtle bg-surface-input text-zinc-400 overflow-hidden">
                              {imgUrl ? (
                                <img src={imgUrl} alt="" loading="lazy" className="size-full object-cover" />
                              ) : (
                                <Dumbbell className="size-4" />
                              )}
                            </div>

                            {/* Exercise Name & Info */}
                            <button
                              type="button"
                              onClick={() => setExpandedExerciseId(isExpanded ? null : exDraft.exerciseId)}
                              aria-expanded={isExpanded}
                              className="min-w-0 flex-1 text-left py-0.5"
                            >
                              <p className="truncate text-xs sm:text-sm font-bold text-text-primary">
                                {exercise?.name || exDraft.exerciseId}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400 truncate">
                                {setsCountLabel} · <span className="text-accent">{weightSummary}</span>
                              </p>
                            </button>

                            {/* Reorder Up Button (>= 44x44px touch target) */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => setDraft((prev) => moveRoutineExercise(prev, index, index - 1))}
                              aria-label={`${t('routine.moveUp')}: ${exercise?.name || exDraft.exerciseId}`}
                              className="size-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-surface-input border border-white/[0.06] text-zinc-400 hover:text-white hover:border-white/20 active:scale-95 transition-all disabled:opacity-20 disabled:pointer-events-none disabled:border-transparent shrink-0"
                            >
                              <ChevronUp className="size-4" />
                            </button>

                            {/* Reorder Down Button (>= 44x44px touch target) */}
                            <button
                              type="button"
                              disabled={index === draft.exercises.length - 1}
                              onClick={() => setDraft((prev) => moveRoutineExercise(prev, index, index + 1))}
                              aria-label={`${t('routine.moveDown')}: ${exercise?.name || exDraft.exerciseId}`}
                              className="size-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-surface-input border border-white/[0.06] text-zinc-400 hover:text-white hover:border-white/20 active:scale-95 transition-all disabled:opacity-20 disabled:pointer-events-none disabled:border-transparent shrink-0"
                            >
                              <ChevronDown className="size-4" />
                            </button>

                            {/* Expand / Collapse Chevron */}
                            <button
                              type="button"
                              onClick={() => setExpandedExerciseId(isExpanded ? null : exDraft.exerciseId)}
                              aria-expanded={isExpanded}
                              aria-label={`Editar series para ${exercise?.name || exDraft.exerciseId}`}
                              className="size-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white active:scale-95 transition-all shrink-0"
                            >
                              <ChevronRight className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Remove Exercise */}
                            <button
                              type="button"
                              onClick={() => {
                                setDraft((prev) => removeRoutineExerciseTemplate(prev, exDraft.exerciseId));
                                if (isExpanded) setExpandedExerciseId(null);
                              }}
                              aria-label={`${t('routine.removeExercise')}: ${exercise?.name || exDraft.exerciseId}`}
                              className="size-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-400 active:scale-95 transition-all shrink-0"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>

                          {/* Expandable Set Structure */}
                          {isExpanded && (
                            <div className="border-t border-white/[0.08] p-3 space-y-2.5 bg-black/20">
                              <div className="grid grid-cols-12 gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1">
                                <span className="col-span-3 text-center">{t('routine.setTypeCompact')}</span>
                                <span className="col-span-8 text-center">
                                  {`${t('routine.targetWeight')} (${unitLabel.toUpperCase()})`}
                                </span>
                                <span className="col-span-1 text-right" />
                              </div>

                              {exDraft.sets.map((set, sIdx) => {
                                const setMarker =
                                  set.setType === 'working'
                                    ? String(sIdx + 1)
                                    : set.setType === 'warmup'
                                      ? 'C'
                                      : set.setType === 'drop'
                                        ? 'D'
                                        : 'B';
                                const displayVal = displayWeight(set.targetWeightKg, units);

                                return (
                                  <div key={set.id} className="grid grid-cols-12 items-center gap-1.5">
                                    {/* Set Type Compact Picker */}
                                    <div className="col-span-3">
                                      <OptionPicker
                                        value={set.setType}
                                        triggerLabel={setMarker}
                                        options={[
                                          { value: 'working', label: t('workout.workingSet') },
                                          { value: 'warmup', label: t('workout.warmupSet') },
                                          { value: 'drop', label: t('workout.dropSet') },
                                          { value: 'backoff', label: t('workout.backoffSet') }
                                        ]}
                                        onChange={(val) =>
                                          setDraft((prev) =>
                                            updateRoutineTemplateSet(prev, exDraft.exerciseId, sIdx, {
                                              setType: val as WorkoutSetType
                                            })
                                          )
                                        }
                                        ariaLabel={t('routine.setType')}
                                        className="h-10 text-xs font-mono font-bold justify-center"
                                      />
                                    </div>

                                    {/* Target Weight with +/- buttons */}
                                    <div className="col-span-8 flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const step = units === 'imperial' ? 5 : 2.5;
                                          const curDisplay = displayWeight(set.targetWeightKg, units);
                                          const nextDisplay = Math.max(0, Math.round((curDisplay - step) * 10) / 10);
                                          const nextKg = parseDisplayWeight(nextDisplay, units);
                                          setDraft((prev) =>
                                            updateRoutineTemplateSet(prev, exDraft.exerciseId, sIdx, {
                                              targetWeightKg: nextKg
                                            })
                                          );
                                        }}
                                        aria-label={t('workout.reduceWeight', { set: sIdx + 1 })}
                                        className="h-10 w-8 sm:w-10 flex items-center justify-center rounded-md border border-white/[0.08] bg-surface-input text-xs font-bold text-zinc-400 hover:text-white active:scale-95 transition-all shrink-0"
                                      >
                                        —
                                      </button>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step={units === 'imperial' ? '5' : '2.5'}
                                        value={displayVal === 0 ? '' : displayVal}
                                        placeholder="0"
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                          const raw = e.target.value.trim();
                                          const num = raw === '' ? 0 : parseFloat(raw);
                                          const parsedKg = Number.isFinite(num) ? parseDisplayWeight(Math.max(0, num), units) : 0;
                                          setDraft((prev) =>
                                            updateRoutineTemplateSet(prev, exDraft.exerciseId, sIdx, {
                                              targetWeightKg: parsedKg
                                            })
                                          );
                                        }}
                                        aria-label={`${t('routine.targetWeight')}: ${sIdx + 1}`}
                                        className="h-10 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-sm font-bold tabular-nums text-text-primary outline-none focus:border-accent"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const step = units === 'imperial' ? 5 : 2.5;
                                          const curDisplay = displayWeight(set.targetWeightKg, units);
                                          const nextDisplay = Math.round((curDisplay + step) * 10) / 10;
                                          const nextKg = parseDisplayWeight(nextDisplay, units);
                                          setDraft((prev) =>
                                            updateRoutineTemplateSet(prev, exDraft.exerciseId, sIdx, {
                                              targetWeightKg: nextKg
                                            })
                                          );
                                        }}
                                        aria-label={t('workout.increaseWeight', { set: sIdx + 1 })}
                                        className="h-10 w-8 sm:w-10 flex items-center justify-center rounded-md border border-white/[0.08] bg-surface-input text-xs font-bold text-zinc-400 hover:text-white active:scale-95 transition-all shrink-0"
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* Remove Set Button */}
                                    <div className="col-span-1 flex items-center justify-end">
                                      <button
                                        type="button"
                                        disabled={exDraft.sets.length <= 1}
                                        onClick={() =>
                                          setDraft((prev) =>
                                            removeRoutineTemplateSet(prev, exDraft.exerciseId, sIdx)
                                          )
                                        }
                                        aria-label={`${t('routine.removeSet')}: ${sIdx + 1}`}
                                        className="p-1.5 text-zinc-500 hover:text-red-400 disabled:opacity-20 disabled:hover:text-zinc-500"
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Add Set Button */}
                              <div className="pt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDraft((prev) => addRoutineTemplateSet(prev, exDraft.exerciseId))
                                  }
                                  className="w-full text-xs font-semibold text-accent hover:text-accent"
                                >
                                  <Plus className="size-3.5" />
                                  <span>{t('routine.addSet')}</span>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add More Exercises Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-200">
                    {t('routine.addExercisesTitle')}
                  </span>
                  <SegmentedControl
                    value={viewMode}
                    options={viewOptions}
                    onChange={setViewMode}
                    label={t('library.view')}
                    className="w-[140px] shrink-0"
                  />
                </div>

                {/* Search Input */}
                <SearchInput
                  label={t('routine.searchExercises')}
                  placeholder={t('routine.searchExercises')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                {/* Filters */}
                <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
                  <ExerciseFilterControls
                    muscle={selectedMuscle}
                    equipment={selectedEquipment}
                    onMuscleChange={setSelectedMuscle}
                    onEquipmentChange={setSelectedEquipment}
                  />
                </div>

                {/* Catalog List / Grid */}
                <div className="space-y-2 pt-1">
                  <div className="px-1 text-[11px] text-zinc-400" aria-live="polite">
                    {filteredExercises.length}{' '}
                    {filteredExercises.length === 1 ? t('library.exercise') : t('library.exercises')}
                  </div>

                  {filteredExercises.length === 0 ? (
                    <EmptyState
                      icon={<Dumbbell className="size-5" />}
                      title={t('library.noResults')}
                      description={t('library.noResultsDescription')}
                      actionLabel={t('library.clearFilters')}
                      onAction={() => {
                        setSearchTerm('');
                        setSelectedMuscle('all');
                        setSelectedEquipment('all');
                      }}
                    />
                  ) : viewMode === 'list' ? (
                    <div className="glass-surface divide-y divide-border-subtle overflow-hidden rounded-ui-xl border border-border-subtle shadow-card">
                      {filteredExercises.slice(0, visibleCount).map((ex) => (
                        <ExerciseCatalogRow
                          key={ex.id}
                          exercise={ex}
                          mode="routine-selection"
                          selected={draft.exercises.some((e) => e.exerciseId === ex.id)}
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
                          selected={draft.exercises.some((e) => e.exerciseId === ex.id)}
                          onToggleSelect={toggleSelectExercise}
                        />
                      ))}
                    </div>
                  )}

                  {/* Load More */}
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
                          {t('library.showing', {
                            visible: Math.min(visibleCount, filteredExercises.length),
                            total: filteredExercises.length
                          })}
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="p-4 border-t border-white/[0.08] bg-black/40 flex items-center gap-2.5 shrink-0">
            {step === 'details' ? (
              <>
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl transition-all border border-white/[0.08]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('exercises')}
                  disabled={!draft.name.trim()}
                  className={`flex-1 py-3 flex items-center justify-center gap-1.5 font-extrabold text-xs rounded-xl transition-all shadow-lg ${
                    draft.name.trim()
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
                  disabled={!canSaveRoutineEditorDraft(draft)}
                  title={draft.exercises.length === 0 ? t('routine.selectAtLeastOne') : undefined}
                  className={`flex-1 py-3 font-extrabold text-xs rounded-xl transition-all shadow-lg ${
                    canSaveRoutineEditorDraft(draft)
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

      {/* Discard Confirmation Modal */}
      <Modal
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={t('routine.discardTitle')}
        description={t('routine.discardDesc')}
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
            {t('routine.continueEditing')}
          </Button>
          <Button variant="danger" onClick={handleConfirmDiscard}>
            {t('routine.discard')}
          </Button>
        </div>
      </Modal>
    </>
  );
};
