import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { featuredLoadHundredths, type Exercise, type FeaturedPrSelection, type FeaturedPrVariant, type StrengthRank } from '@light-weight/domain';
import { BottomSheet, Button, IconButton } from '../../components/ui/index.js';
import { useI18n } from '../../lib/i18n.js';
import { formatFeaturedVariantLoad } from './featured-pr-presentation.js';
import { ProfilePrRow } from './ProfilePrRow.js';
import { usePreferences } from '../../lib/preferences-context.js';

export interface FeaturedPrExerciseOption {
  exercise: Exercise;
  variants: FeaturedPrVariant[];
  rank: StrengthRank | null;
}

interface FeaturedPrSheetProps {
  open: boolean;
  selections: FeaturedPrSelection[];
  exercises: FeaturedPrExerciseOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (selections: FeaturedPrSelection[]) => Promise<boolean>;
}

export type FeaturedPrDraftSlot = { slot: 1 | 2 | 3; exerciseId?: string; loadWeightKg?: number };

export function createFeaturedPrDraft(selections: FeaturedPrSelection[]): FeaturedPrDraftSlot[] {
  return selections.length ? selections.map((selection) => ({ ...selection })) : [{ slot: 1 }];
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
  const complete = draft.filter((item): item is FeaturedPrSelection => Boolean(item.exerciseId)
    && typeof item.loadWeightKg === 'number');
  return complete.length === draft.length ? complete : null;
}

function isSameLoadVariant(left: number | undefined, right: number): boolean {
  const leftHundredths = featuredLoadHundredths(left);
  return leftHundredths !== null && leftHundredths === featuredLoadHundredths(right);
}

export function FeaturedPrSheet({ open, selections, exercises, saving, onClose, onSave }: FeaturedPrSheetProps) {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const [draft, setDraft] = useState<FeaturedPrDraftSlot[]>(() => createFeaturedPrDraft(selections));
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(createFeaturedPrDraft(selections));
    setPickingSlot(null);
    setExpandedExerciseId(null);
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
      <div className="space-y-3">
        {draft.map((item) => {
          const option = item.exerciseId ? optionsById.get(item.exerciseId) : undefined;
          const variant = option?.variants.find((candidate) => isSameLoadVariant(item.loadWeightKg, candidate.loadWeightKg));
          const isPicking = pickingSlot === item.slot;
          return (
            <section key={item.slot} className="rounded-ui-xl border border-border-subtle bg-surface-input p-2.5" aria-labelledby={`featured-slot-${item.slot}`}>
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <h3 id={`featured-slot-${item.slot}`} className="text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">{t('profile.featuredSlot', { count: item.slot })}</h3>
                <IconButton size="sm" variant="ghost" aria-label={t('profile.featuredRemoveSlot', { count: item.slot })} onClick={() => setDraft((current) => current.filter((slot) => slot.slot !== item.slot))}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </div>

              {option && variant ? (
                <ProfilePrRow
                  exercise={option.exercise}
                  name={option.exercise.name}
                  rank={option.rank}
                  repCount={variant.reps}
                  displayLoad={formatFeaturedVariantLoad(option.exercise, variant, preferences.units)}
                  selected={isPicking}
                  onSelect={() => { setPickingSlot(isPicking ? null : item.slot); setExpandedExerciseId(option.exercise.id); setQuery(''); }}
                  ariaLabel={t('profile.featuredChangeSelection', { name: option.exercise.name })}
                />
              ) : (
                <button type="button" aria-expanded={isPicking} onClick={() => { setPickingSlot(isPicking ? null : item.slot); setExpandedExerciseId(null); setQuery(''); }} className="flex min-h-12 w-full items-center justify-center rounded-ui-lg border border-dashed border-border-active bg-surface px-3 text-sm font-bold text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Plus aria-hidden="true" className="mr-2 size-4 text-accent" />{t('profile.featuredChooseTopSet')}
                </button>
              )}

              {isPicking && (
                <div className="mt-2 space-y-2 rounded-ui-lg border border-border-subtle bg-surface p-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-ui-md border border-border-subtle bg-surface-input px-3 focus-within:ring-2 focus-within:ring-accent">
                    <Search aria-hidden="true" className="size-4 text-text-muted" />
                    <span className="sr-only">{t('profile.featuredSearchExercise')}</span>
                    <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setExpandedExerciseId(null); }} placeholder={t('profile.featuredSearchExercise')} className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
                  </label>
                  <div className="max-h-[min(52vh,26rem)] space-y-2 overflow-y-auto overscroll-contain">
                    {filteredExercises.map((candidate) => {
                      const primary = candidate.variants[0];
                      const expanded = expandedExerciseId === candidate.exercise.id;
                      return (
                        <div key={candidate.exercise.id} className="space-y-1">
                          <ProfilePrRow
                            exercise={candidate.exercise}
                            name={candidate.exercise.name}
                            rank={candidate.rank}
                            repCount={primary?.reps}
                            displayLoad={primary ? formatFeaturedVariantLoad(candidate.exercise, primary, preferences.units) : t('profile.featuredUnavailable')}
                            selected={expanded}
                            onSelect={() => setExpandedExerciseId(expanded ? null : candidate.exercise.id)}
                            ariaLabel={t('profile.featuredShowVariants', { name: candidate.exercise.name })}
                          />
                          {expanded && (
                            <div className="ml-3 space-y-1 border-l border-border-active pl-2" role="group" aria-label={t('profile.featuredVariantsFor', { name: candidate.exercise.name })}>
                              {candidate.variants.map((loadVariant) => {
                                const selected = item.exerciseId === candidate.exercise.id && isSameLoadVariant(item.loadWeightKg, loadVariant.loadWeightKg);
                                return (
                                  <ProfilePrRow
                                    key={`${candidate.exercise.id}:${loadVariant.loadWeightKg.toFixed(2)}`}
                                    exercise={candidate.exercise}
                                    name={candidate.exercise.name}
                                    rank={candidate.rank}
                                    repCount={loadVariant.reps}
                                    displayLoad={formatFeaturedVariantLoad(candidate.exercise, loadVariant, preferences.units)}
                                    selected={selected}
                                    onSelect={() => {
                                      updateSlot(item.slot, { exerciseId: candidate.exercise.id, loadWeightKg: loadVariant.loadWeightKg });
                                      setPickingSlot(null);
                                      setExpandedExerciseId(null);
                                    }}
                                    ariaLabel={t('profile.featuredSelectVariant', { name: candidate.exercise.name, reps: loadVariant.reps, load: formatFeaturedVariantLoad(candidate.exercise, loadVariant, preferences.units) })}
                                    className="min-h-12"
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredExercises.length === 0 && <p className="p-3 text-center text-xs text-text-muted">{t('profile.featuredNoExercises')}</p>}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {draft.length < 3 && <Button type="button" variant="secondary" className="w-full" onClick={addSlot}><Plus aria-hidden="true" className="size-4" />{t('profile.featuredAddSlot')}</Button>}
        {error && <p role="alert" className="rounded-ui-lg border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2 pb-safe-bottom">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" loading={saving} disabled={saving} onClick={() => void submit()}>{t('common.save')}</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
