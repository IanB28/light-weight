import React, { useEffect, useMemo, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { calculateLoadedBarWeight, decomposeLoadedBarWeight, getPlateLoadMultiplier, normalizeWeightKg } from '@light-weight/domain';
import type { ExerciseLoadingProfile } from '@light-weight/domain';
import type { UnitSystem } from '../../lib/preferences.js';
import { useI18n } from '../../lib/i18n.js';
import { displayWeight, formatDisplayWeight, parseDisplayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import { BottomSheet, Button } from '../../components/ui/index.js';
import { WeightPlate } from './WeightPlate.js';

export function KeyboardWeightInput({ valueKg, units, label, onChange }: { valueKg: number; units: UnitSystem; label: string; onChange: (weightKg: number) => void }) {
  const displayValue = displayWeight(valueKg, units);
  const [draft, setDraft] = useState(displayValue === 0 ? '' : String(displayValue));

  useEffect(() => {
    const next = displayWeight(valueKg, units);
    setDraft(next === 0 ? '' : String(next));
  }, [units, valueKg]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    onChange(normalizeWeightKg(parseDisplayWeight(parsed, units)));
  };

  return <input type="text" inputMode="decimal" value={draft} placeholder="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value.replace(/[^0-9.,]/g, ''))} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }} aria-label={label} className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-16" />;
}

export function PlateWeightButton({ valueKg, units, label, onClick }: { valueKg: number; units: UnitSystem; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} className="flex h-11 w-full min-w-0 items-center justify-center gap-1 rounded-ui-md border border-accent/35 bg-accent-soft px-1 font-mono text-xs font-bold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Disc3 aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{displayWeight(valueKg, units)}</span></button>;
}

export function PlatePickerSheet({ open, onClose, valueKg, units, baseWeightKg, availablePlatesKg, includeBarWeight, allowBarToggle, loading, onApply }: { open: boolean; onClose: () => void; valueKg: number; units: UnitSystem; baseWeightKg: number; availablePlatesKg: number[]; includeBarWeight: boolean; allowBarToggle: boolean; loading: ExerciseLoadingProfile; onApply: (weightKg: number, includeBarWeight: boolean, baseWeightKg: number) => void }) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isExactInitialLoad, setIsExactInitialLoad] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [includesBar, setIncludesBar] = useState(includeBarWeight);
  const [selectedBaseWeightKg, setSelectedBaseWeightKg] = useState(baseWeightKg);

  useEffect(() => {
    if (!open) return;
    const baseIsRequired = loading.plateBase?.kind === 'fixed';
    const effectiveBarWeightKg = (baseIsRequired || includeBarWeight) ? baseWeightKg : 0;
    const plateMultiplier = getPlateLoadMultiplier(loading);
    const decomposition = decomposeLoadedBarWeight(valueKg, effectiveBarWeightKg, availablePlatesKg, 0.02, plateMultiplier);
    setCounts(decomposition.counts);
    setIsExactInitialLoad(decomposition.isExact);
    setHasInteracted(false);
    setIncludesBar(baseIsRequired || includeBarWeight);
    setSelectedBaseWeightKg(baseWeightKg);
  }, [availablePlatesKg, baseWeightKg, includeBarWeight, loading, open, valueKg]);

  const platesPerSide = useMemo(
    () => availablePlatesKg.flatMap((plate) => Array.from({ length: counts[String(plate)] || 0 }, () => plate)),
    [availablePlatesKg, counts]
  );
  const effectiveBarWeightKg = (loading.plateBase?.kind === 'fixed' || includesBar) ? selectedBaseWeightKg : 0;
  const plateMultiplier = getPlateLoadMultiplier(loading);
  const totalKg = calculateLoadedBarWeight(effectiveBarWeightKg, platesPerSide, plateMultiplier);
  const unit = WEIGHT_UNIT_PRESETS[units].unit;
  const selectedLoad = platesPerSide.length > 0
    ? `${platesPerSide.map((plate) => displayWeight(plate, units)).join(' + ')} ${unit}`
    : '—';
  const isPerSide = plateMultiplier === 2 || loading.loadMode === 'per_side';
  const loadLabel = isPerSide ? t('workout.perSide') : t('workout.selectedLoad');

  const updateCount = (plate: number, delta: number) => {
    setHasInteracted(true);
    setCounts((current) => ({ ...current, [String(plate)]: Math.max(0, (current[String(plate)] || 0) + delta) }));
  };

  return <BottomSheet open={open} onClose={onClose} title={t('workout.platePicker')}>
    <div className="space-y-4 pb-16 sm:pb-0">
      {loading.plateBase?.label === 'smith' && <div className="flex items-center justify-between gap-2 rounded-ui-lg border border-border-subtle bg-surface-input p-2"><span className="text-xs font-bold text-text-primary">Barra Smith</span><div className="flex gap-1" role="group" aria-label="Peso de barra Smith">{(loading.plateBase.selectableWeightsKg || []).map((weight) => <button key={weight} type="button" aria-pressed={Math.abs(selectedBaseWeightKg - weight) < 0.001} onClick={() => { setSelectedBaseWeightKg(weight); setHasInteracted(true); }} className={`min-h-11 rounded-ui-md px-3 font-mono text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${Math.abs(selectedBaseWeightKg - weight) < 0.001 ? 'bg-accent text-accent-fg' : 'text-text-secondary'}`}>{formatDisplayWeight(weight, units)}</button>)}</div></div>}
      {allowBarToggle && <button type="button" aria-pressed={includesBar} onClick={() => { setIncludesBar((current) => !current); setHasInteracted(true); }} className={`flex min-h-11 w-full items-center justify-between rounded-ui-lg border px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${includesBar ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface-input'}`}>
        <span className="text-xs font-bold text-text-primary">{t('workout.includeBar')}</span>
        <span className={`font-mono text-xs font-bold ${includesBar ? 'text-accent' : 'text-text-muted'}`}>{includesBar ? formatDisplayWeight(selectedBaseWeightKg, units) : t('workout.barDisabled')}</span>
      </button>}
      <div className="space-y-2">
        <p className="text-center text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{loadLabel}</p>
        <div className="grid grid-cols-3 gap-x-1 gap-y-3">
          {availablePlatesKg.map((plate) => {
            const count = counts[String(plate)] || 0;
            const weight = formatDisplayWeight(plate, units);
            const addLabel = isPerSide
              ? t('workout.addPlate', { weight, count })
              : t('workout.addLoadPlate', { weight, count });
            const removeLabel = isPerSide
              ? t('workout.removePlate', { weight, count })
              : t('workout.removeLoadPlate', { weight, count });
            return <WeightPlate key={plate} weightKg={plate} units={units} count={count} addLabel={addLabel} removeLabel={removeLabel} onAdd={() => updateCount(plate, 1)} onRemove={() => updateCount(plate, -1)} />;
          })}
        </div>
      </div>
      <div className="rounded-ui-xl border border-border-subtle bg-surface-elevated p-3" aria-live="polite">
        <dl className="space-y-1.5 text-xs">
          {includesBar && <div className="flex justify-between gap-3"><dt className="text-text-muted">{loading.plateBase?.label === 'smith' ? 'Barra Smith' : t('workout.bar')}</dt><dd className="font-mono font-bold text-text-primary">{formatDisplayWeight(selectedBaseWeightKg, units)}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-text-muted">{loadLabel}</dt><dd className="min-w-0 truncate text-right font-mono font-bold text-text-secondary">{selectedLoad}</dd></div>
          <div className="flex items-end justify-between gap-3 border-t border-border-subtle pt-2"><dt className="font-bold text-text-secondary">{t('workout.total')}</dt><dd className="font-mono text-2xl font-black text-accent">{formatDisplayWeight(totalKg, units)}</dd></div>
        </dl>
      </div>
      {!isExactInitialLoad && !hasInteracted && <p role="status" className="text-center text-xs leading-relaxed text-text-muted">{t('workout.currentLoadNotRepresentable')}</p>}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-md grid-cols-2 gap-2 border-t border-border-subtle bg-surface-elevated/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:sticky sm:-bottom-1 sm:-mx-1 sm:px-1 sm:pb-1">
        <Button variant="secondary" onClick={() => { setHasInteracted(true); setCounts({}); }}>{t('workout.clearPlates')}</Button>
        <Button disabled={!isExactInitialLoad && !hasInteracted} onClick={() => { onApply(totalKg, includesBar, selectedBaseWeightKg); onClose(); }}>{t('workout.useWeight', { weight: formatDisplayWeight(totalKg, units) })}</Button>
      </div>
    </div>
  </BottomSheet>;
}
