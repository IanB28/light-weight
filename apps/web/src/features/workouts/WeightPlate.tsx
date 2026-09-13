import React from 'react';
import { Minus } from 'lucide-react';
import type { UnitSystem } from '../../lib/preferences.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';

interface WeightPlateProps {
  weightKg: number;
  units: UnitSystem;
  count: number;
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  onRemove: () => void;
}

export function WeightPlate({ weightKg, units, count, addLabel, removeLabel, onAdd, onRemove }: WeightPlateProps) {
  const selected = count > 0;

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={addLabel}
        aria-pressed={selected}
        onClick={onAdd}
        className={`relative flex size-20 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${selected ? 'border-accent bg-accent-soft text-accent shadow-accent' : 'border-border-active bg-surface-input text-text-secondary hover:border-accent/60 hover:text-text-primary'}`}
      >
        <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-1 size-[calc(100%-0.5rem)]">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <circle cx="50" cy="50" r="6" className="fill-surface stroke-current" strokeWidth="2" />
        </svg>
        <span className="absolute top-3 font-mono text-base font-black tabular-nums leading-none">{displayWeight(weightKg, units)}</span>
        <span className="absolute bottom-3 text-[9px] font-extrabold uppercase tracking-[0.14em]">{WEIGHT_UNIT_PRESETS[units].unit}</span>
        {selected && <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border border-accent bg-surface-elevated px-1 font-mono text-[10px] font-black text-accent">×{count}</span>}
      </button>
      <button type="button" disabled={!selected} aria-label={removeLabel} onClick={onRemove} className="flex size-10 items-center justify-center rounded-full border border-border-subtle bg-surface text-text-secondary transition-colors hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-25">
        <Minus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
