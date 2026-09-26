import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';
import { Exercise, MuscleGroup, WorkoutSession } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { deriveExerciseUsage, rankExerciseDiscovery } from '../lib/exercise-discovery.js';
import {
  ExerciseEquipmentFilter, ExerciseMuscleFilter,
  matchesExerciseFilters, MUSCLE_FILTER_OPTIONS, normalizeExerciseSearch
} from '../lib/exercise-filters.js';
import { useExerciseLabels, useI18n } from '../lib/i18n.js';
import { BottomSheet, Button, EmptyState, OptionPicker, SearchInput, SectionHeader } from './ui/index.js';
import { ExerciseFilterControls } from './ExerciseFilterControls.js';

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: Exercise[];
  history: WorkoutSession[];
  onSelectExercise: (exercise: Exercise) => void;
  onCreateCustomExercise?: (name: string, muscle: MuscleGroup) => void;
  initialMuscleFilter?: string;
}

export function AddExerciseModal({ isOpen, onClose, availableExercises, history, onSelectExercise, onCreateCustomExercise, initialMuscleFilter = 'all' }: AddExerciseModalProps) {
  const { t } = useI18n();
  const { muscleLabel, equipmentLabel } = useExerciseLabels();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<ExerciseMuscleFilter>('all');
  const [equipment, setEquipment] = useState<ExerciseEquipmentFilter>('all');
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>('chest');
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => {
    if (!isOpen) return;
    const validMuscle = MUSCLE_FILTER_OPTIONS.some((option) => option.value === initialMuscleFilter);
    setMuscle(validMuscle ? initialMuscleFilter as ExerciseMuscleFilter : 'all');
    setEquipment('all');
    setQuery('');
    const timer = window.setTimeout(() => searchRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [initialMuscleFilter, isOpen]);
  useEffect(() => setVisibleCount(60), [equipment, muscle, query]);

  const normalizedQuery = useMemo(() => normalizeExerciseSearch(query), [query]);
  const filtered = useMemo(() => availableExercises.filter((exercise) => matchesExerciseFilters(exercise, normalizedQuery, muscle, equipment)), [availableExercises, equipment, muscle, normalizedQuery]);
  const usage = useMemo(() => deriveExerciseUsage(history), [history]);
  const discovery = useMemo(() => normalizedQuery ? { featured: [], remaining: filtered, featuredKind: null } : rankExerciseDiscovery(filtered, usage, muscle), [filtered, muscle, normalizedQuery, usage]);
  const ordered = [...discovery.featured, ...discovery.remaining];

  const choose = (exercise: Exercise) => { onSelectExercise(exercise); onClose(); };
  const createCustom = () => {
    const name = query.trim();
    if (!name || !onCreateCustomExercise) return;
    onCreateCustomExercise(name, customMuscle);
    onClose();
  };
  const featuredTitle = discovery.featuredKind === 'recent' ? t('exercise.recent') : discovery.featuredKind === 'frequent' ? t('exercise.frequent') : t('exercise.recommended');

  const row = (exercise: Exercise) => <button key={exercise.id} type="button" onClick={() => choose(exercise)} className="flex min-h-14 w-full items-center gap-3 rounded-ui-lg px-2.5 py-2 text-left hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted">{getExerciseImgUrl(exercise) ? <img src={getExerciseImgUrl(exercise) || ''} alt="" loading="lazy" className="size-full object-cover" /> : <Dumbbell className="size-4" />}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-text-primary">{exercise.name}</span><span className="block truncate text-[11px] text-text-muted">{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.category)}</span></span>
    <Plus aria-hidden="true" className="size-4 shrink-0 text-accent" />
  </button>;

  return <BottomSheet open={isOpen} onClose={onClose} title={t('exercise.addTitle')} className="sm:max-w-lg">
    <div className="space-y-3">
      <SearchInput ref={searchRef} label={t('exercise.search')} placeholder={t('exercise.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
      <ExerciseFilterControls muscle={muscle} equipment={equipment} onMuscleChange={setMuscle} onEquipmentChange={setEquipment} />
      <p className="text-xs text-text-muted" aria-live="polite">{filtered.length} {t('exercise.results').toLocaleLowerCase()}</p>
      {ordered.length === 0 ? <div className="space-y-3"><EmptyState compact icon={<Dumbbell className="size-5" />} title={t('exercise.none')} description={t('exercise.noneDescription')} /><div className="rounded-ui-xl border border-border-subtle bg-surface p-3"><SectionHeader title={t('exercise.createCustom')} /><div className="mt-2 space-y-1.5 text-xs font-bold text-text-secondary"><span>{t('exercise.primaryMuscle')}</span><OptionPicker value={customMuscle} options={MUSCLE_FILTER_OPTIONS.filter((option) => option.value !== 'all').map((option) => ({ value: option.value as MuscleGroup, label: muscleLabel(option.value as MuscleGroup) }))} onChange={setCustomMuscle} ariaLabel={t('exercise.primaryMuscle')} /></div><Button onClick={createCustom} disabled={!query.trim()} className="mt-3 w-full"><Plus className="size-4" />{t('exercise.createAndAdd')}</Button></div></div> : <div className="max-h-[48dvh] overflow-y-auto overscroll-contain pr-1">{discovery.featured.length > 0 && <><SectionHeader title={featuredTitle} />{discovery.featured.map(row)}<SectionHeader title={t('exercise.all')} className="mt-3" /></>}{discovery.remaining.slice(0, Math.max(0, visibleCount - discovery.featured.length)).map(row)}{visibleCount < ordered.length && <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 60)} className="mt-2 w-full">{t('exercise.more')}</Button>}</div>}
    </div>
  </BottomSheet>;
}
