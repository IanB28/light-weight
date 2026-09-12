import React, { useEffect, useMemo, useState } from 'react';
import { CircleMinus, CirclePlus, Disc3 } from 'lucide-react';
import {
  calculateLoadedBarWeight,
  kilogramsToPounds,
  normalizeWeightKg,
  poundsToKilograms
} from '@light-weight/domain';
import { UnitSystem } from '../../lib/preferences.js';
import { useI18n } from '../../lib/i18n.js';
import { BottomSheet, Button } from '../../components/ui/index.js';

const formatLoad = (weightKg: number, units: UnitSystem) => {
  const value = units === 'imperial' ? kilogramsToPounds(weightKg) : weightKg;
  const rounded = Math.round(value * (units === 'imperial' ? 10 : 100)) / (units === 'imperial' ? 10 : 100);
  return `${rounded} ${units === 'imperial' ? 'lb' : 'kg'}`;
};

export function KeyboardWeightInput({ valueKg, units, label, onChange }: { valueKg: number; units: UnitSystem; label: string; onChange: (weightKg: number) => void }) {
  const displayValue = units === 'imperial' ? kilogramsToPounds(valueKg) : valueKg;
  const [draft, setDraft] = useState(displayValue === 0 ? '' : String(Math.round(displayValue * 10) / 10));

  useEffect(() => {
    const next = units === 'imperial' ? kilogramsToPounds(valueKg) : valueKg;
    setDraft(next === 0 ? '' : String(Math.round(next * 10) / 10));
  }, [units, valueKg]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    const nextKg = units === 'imperial' ? poundsToKilograms(parsed) : parsed;
    onChange(normalizeWeightKg(nextKg));
  };

  return <input type="text" inputMode="decimal" value={draft} placeholder="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value.replace(/[^0-9.,]/g, ''))} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }} aria-label={label} className="h-11 min-w-0 w-full rounded-ui-md border border-border-subtle bg-surface-input py-0.5 text-center font-mono text-base font-bold tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 min-[390px]:w-16" />;
}

function decomposeLoad(totalKg: number, barKg: number, plates: number[]): Record<string, number> {
  const counts: Record<string, number> = {};
  let remaining = Math.max(0, (totalKg - barKg) / 2);
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const count = Math.floor((remaining + 0.001) / plate);
    if (count > 0) {
      counts[String(plate)] = count;
      remaining -= count * plate;
    }
  }
  return remaining < 0.01 ? counts : {};
}

export function PlateWeightButton({ valueKg, units, label, onClick }: { valueKg: number; units: UnitSystem; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} className="flex h-11 w-full min-w-0 items-center justify-center gap-1 rounded-ui-md border border-accent/35 bg-accent-soft px-1 font-mono text-xs font-bold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Disc3 aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{formatLoad(valueKg, units).replace(/\s(kg|lb)$/, '')}</span></button>;
}

export function PlatePickerSheet({ open, onClose, valueKg, units, barWeightKg, availablePlatesKg, onApply }: { open: boolean; onClose: () => void; valueKg: number; units: UnitSystem; barWeightKg: number; availablePlatesKg: number[]; onApply: (weightKg: number) => void }) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) setCounts(decomposeLoad(valueKg, barWeightKg, availablePlatesKg));
  }, [availablePlatesKg, barWeightKg, open, valueKg]);

  const platesPerSide = useMemo(() => availablePlatesKg.flatMap((plate) => Array.from({ length: counts[String(plate)] || 0 }, () => plate)), [availablePlatesKg, counts]);
  const totalKg = calculateLoadedBarWeight(barWeightKg, platesPerSide);

  return <BottomSheet open={open} onClose={onClose} title={t('workout.platePicker')} description={`${t('workout.bar')}: ${formatLoad(barWeightKg, units)}`}>
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-center text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t('workout.perSide')}</p>
        <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3">
          {availablePlatesKg.map((plate) => {
            const count = counts[String(plate)] || 0;
            return <div key={plate} className={`rounded-ui-lg border p-2 ${count ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface'}`}>
              <button type="button" aria-label={`+ ${formatLoad(plate, units)}`} onClick={() => setCounts((current) => ({ ...current, [String(plate)]: count + 1 }))} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-ui-md font-mono text-sm font-extrabold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><CirclePlus aria-hidden="true" className="size-4 text-accent" />{formatLoad(plate, units)}</button>
              <div className="flex items-center justify-between border-t border-border-subtle pt-1.5">
                <button type="button" disabled={count === 0} onClick={() => setCounts((current) => ({ ...current, [String(plate)]: Math.max(0, count - 1) }))} aria-label={`- ${formatLoad(plate, units)}`} className="flex size-10 items-center justify-center rounded-full text-text-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><CircleMinus aria-hidden="true" className="size-4" /></button>
                <span className="font-mono text-xs font-bold text-text-secondary" aria-label={t('workout.plateCount', { count })}>×{count}</span>
              </div>
            </div>;
          })}
        </div>
      </div>
      <div className="rounded-ui-xl border border-border-subtle bg-surface-elevated p-4 text-center" aria-live="polite"><p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('workout.total')}</p><p className="mt-1 font-mono text-3xl font-extrabold text-text-primary">{formatLoad(totalKg, units)}</p></div>
      <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setCounts({})}>{t('workout.clearPlates')}</Button><Button onClick={() => { onApply(totalKg); onClose(); }}>{t('workout.useWeight', { weight: formatLoad(totalKg, units) })}</Button></div>
    </div>
  </BottomSheet>;
}
