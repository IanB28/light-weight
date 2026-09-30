import React, { useEffect, useMemo, useState } from 'react';
import { Check, Dumbbell, Plus, Search, Trash2 } from 'lucide-react';
import type { Exercise, FeaturedPrSelection } from '@light-weight/domain';
import { BottomSheet, Button, IconButton } from '../../components/ui/index.js';
import { RepBadge } from '../../components/RepBadge.js';
import { getExerciseImgUrl } from '../../lib/exercises.js';
import { useI18n } from '../../lib/i18n.js';

export interface FeaturedPrExerciseOption {
  exercise: Exercise;
  availableRepCounts: number[];
}

interface FeaturedPrSheetProps {
  open: boolean;
  selections: FeaturedPrSelection[];
  exercises: FeaturedPrExerciseOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (selections: FeaturedPrSelection[]) => Promise<boolean>;
}

export type FeaturedPrDraftSlot = { slot: 1 | 2 | 3; exerciseId?: string; repCount?: number };

export function createFeaturedPrDraft(selections: FeaturedPrSelection[]): FeaturedPrDraftSlot[] {
  return selections.length
    ? selections.map((selection) => ({ ...selection }))
    : [{ slot: 1 }];
}

export function nextFeaturedPrSlot(draft: FeaturedPrDraftSlot[]): 1 | 2 | 3 | null {
  return ([1, 2, 3] as const).find((slot) => !draft.some((item) => item.slot === slot)) ?? null;
}

export function filterFeaturedPrExerciseOptions(
  exercises: FeaturedPrExerciseOption[],
  draft: FeaturedPrDraftSlot[],
  pickingSlot: number | null,
  query: string
): FeaturedPrExerciseOption[] {
  const usedExerciseIds = new Set(draft.flatMap((item) => item.exerciseId ? [item.exerciseId] : []));
  const currentExerciseId = draft.find((slot) => slot.slot === pickingSlot)?.exerciseId;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return exercises.filter(({ exercise }) => {
    if (usedExerciseIds.has(exercise.id) && currentExerciseId !== exercise.id) return false;
    return !normalizedQuery || exercise.name.toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function completeFeaturedPrDraft(draft: FeaturedPrDraftSlot[]): FeaturedPrSelection[] | null {
  const complete = draft.filter((item): item is Required<FeaturedPrDraftSlot> => Boolean(item.exerciseId && item.repCount));
  return complete.length === draft.length ? complete : null;
}

export function FeaturedPrSheet({ open, selections, exercises, saving, onClose, onSave }: FeaturedPrSheetProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<FeaturedPrDraftSlot[]>(() => createFeaturedPrDraft(selections));
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(createFeaturedPrDraft(selections));
    setPickingSlot(null);
    setQuery('');
    setError(null);
  }, [open, selections]);

  const optionsById = useMemo(() => new Map(exercises.map((option) => [option.exercise.id, option])), [exercises]);
  const filteredExercises = filterFeaturedPrExerciseOptions(exercises, draft, pickingSlot, query);

  const updateSlot = (slot: number, patch: Partial<FeaturedPrDraftSlot>) => {
    setDraft((current) => current.map((item) => item.slot === slot ? { ...item, ...patch } : item));
  };

  const addSlot = () => {
    const next = nextFeaturedPrSlot(draft);
    if (next) setDraft((current) => [...current, { slot: next }].sort((a, b) => a.slot - b.slot));
  };

  const submit = async () => {
    const complete = completeFeaturedPrDraft(draft);
    if (!complete) { setError(t('profile.featuredIncomplete')); return; }
    setError(null);
    const saved = await onSave(complete);
    if (saved) onClose();
    else setError(t('profile.featuredSaveError'));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('profile.featuredCustomizeTitle')} description={t('profile.featuredCustomizeDescription')} className="sm:max-w-lg">
      <div className="space-y-4">
        {draft.map((item) => {
          const option = item.exerciseId ? optionsById.get(item.exerciseId) : undefined;
          const optionImageUrl = option ? getExerciseImgUrl(option.exercise) : null;
          const isPicking = pickingSlot === item.slot;
          return (
            <section key={item.slot} className="rounded-ui-xl border border-border-subtle bg-surface-input p-3" aria-labelledby={`featured-slot-${item.slot}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id={`featured-slot-${item.slot}`} className="text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
                  {t('profile.featuredSlot', { count: item.slot })}
                </h3>
                <IconButton size="sm" variant="ghost" aria-label={t('profile.featuredRemoveSlot', { count: item.slot })} onClick={() => setDraft((current) => current.filter((slot) => slot.slot !== item.slot))}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </div>

              <button
                type="button"
                aria-expanded={isPicking}
                onClick={() => { setPickingSlot(isPicking ? null : item.slot); setQuery(''); }}
                className="flex min-h-12 w-full items-center gap-3 rounded-ui-lg border border-border-subtle bg-surface px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted">
                  {optionImageUrl
                    ? <img src={optionImageUrl} alt="" loading="lazy" className="size-full object-cover" />
                    : <Dumbbell aria-hidden="true" className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('profile.featuredExercise')}</span>
                  <span className="block truncate text-sm font-bold text-text-primary">{option?.exercise.name ?? t('profile.featuredChooseExercise')}</span>
                </span>
              </button>

              {isPicking && (
                <div className="mt-2 space-y-2 rounded-ui-lg border border-border-subtle bg-surface p-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-ui-md border border-border-subtle bg-surface-input px-3 focus-within:ring-2 focus-within:ring-accent">
                    <Search aria-hidden="true" className="size-4 text-text-muted" />
                    <span className="sr-only">{t('profile.featuredSearchExercise')}</span>
                    <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('profile.featuredSearchExercise')} className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
                  </label>
                  <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain">
                    {filteredExercises.map(({ exercise }) => (
                      <button key={exercise.id} type="button" onClick={() => {
                        updateSlot(item.slot, { exerciseId: exercise.id, repCount: undefined });
                        setPickingSlot(null);
                      }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-ui-md px-3 text-left text-sm font-semibold text-text-primary hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <span className="truncate">{exercise.name}</span>
                        {item.exerciseId === exercise.id && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
                      </button>
                    ))}
                    {filteredExercises.length === 0 && <p className="p-3 text-center text-xs text-text-muted">{t('profile.featuredNoExercises')}</p>}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('profile.featuredRepetitions')}</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((repCount) => {
                    const available = option?.availableRepCounts.includes(repCount) ?? false;
                    const selected = item.repCount === repCount;
                    return (
                      <button key={repCount} type="button" disabled={!available} aria-pressed={selected} aria-label={`${repCount}RM`} onClick={() => updateSlot(item.slot, { repCount })} className={`flex min-h-11 items-center justify-center rounded-ui-md border outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 ${selected ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface'}`}>
                        <RepBadge repCount={repCount} className={selected ? '' : 'border-transparent bg-transparent text-text-secondary shadow-none'} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        {draft.length < 3 && (
          <Button type="button" variant="secondary" className="w-full" onClick={addSlot}>
            <Plus aria-hidden="true" className="size-4" /> {t('profile.featuredAddSlot')}
          </Button>
        )}
        {error && <p role="alert" className="rounded-ui-lg border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" loading={saving} disabled={saving} onClick={() => void submit()}>{t('common.save')}</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
