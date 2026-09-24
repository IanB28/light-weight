import React from 'react';
import { Minus } from 'lucide-react';
import type { UnitSystem } from '../../lib/preferences.js';
import { displayWeight, WEIGHT_UNIT_PRESETS } from '../../lib/weight-units.js';
import { resolvePlateAsset } from '../../lib/plate-assets.js';

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
  const assetUrl = resolvePlateAsset(weightKg, units);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={addLabel}
        aria-pressed={selected}
        onClick={onAdd}
        className={`relative flex size-20 items-center justify-center rounded-full border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
          selected
            ? 'border-accent shadow-accent'
            : 'border-transparent hover:border-border-active/60'
        }`}
      >
        {assetUrl ? (
          <img
            src={assetUrl}
            alt=""
            className="size-full object-contain pointer-events-none select-none p-1 transition-transform duration-150 active:scale-95"
            draggable={false}
          />
        ) : (
          <div className="flex size-[calc(100%-0.5rem)] flex-col items-center justify-center rounded-full border border-border-subtle bg-surface-input p-1">
            <span className="font-mono text-base font-black tabular-nums leading-none text-text-primary">
              {displayWeight(weightKg, units)}
            </span>
            <span className="mt-0.5 text-[9px] font-extrabold uppercase tracking-wider text-text-muted">
              {WEIGHT_UNIT_PRESETS[units].unit}
            </span>
          </div>
        )}
        {selected && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border border-accent bg-surface-elevated px-1 font-mono text-[10px] font-black text-accent shadow-sm"
          >
            {`×${count}`}
          </span>
        )}
      </button>
      <button
        type="button"
        disabled={!selected}
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex size-10 items-center justify-center rounded-full border border-border-subtle bg-surface text-text-secondary transition-colors hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-25"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
