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

export const WeightPlate = React.memo(function WeightPlate({
  weightKg,
  units,
  count,
  addLabel,
  removeLabel,
  onAdd,
  onRemove
}: WeightPlateProps) {
  const selected = count > 0;
  const assetUrl = resolvePlateAsset(weightKg, units);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={addLabel}
        aria-pressed={selected}
        onClick={onAdd}
        className="relative flex size-20 items-center justify-center rounded-full p-0 transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95 motion-reduce:transition-none"
      >
        {/* Semantic non-layout aura layer behind the PNG */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-150 ease-out motion-reduce:transition-none ${
            selected ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            boxShadow: '0 0 16px var(--accent-glow)'
          }}
        />

        {assetUrl ? (
          <img
            src={assetUrl}
            alt=""
            loading="eager"
            decoding="async"
            className={`size-full object-contain pointer-events-none select-none transition-transform duration-150 ease-out motion-reduce:transition-none ${
              selected ? 'scale-[1.03]' : 'scale-100'
            }`}
            draggable={false}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center rounded-full border border-border-subtle bg-surface-input p-2 transition-transform duration-150 ease-out motion-reduce:transition-none">
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
            key={count}
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 z-10 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-xs font-black text-accent-fg shadow-md animate-badge-pop motion-reduce:animate-none"
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
        className="flex size-9 items-center justify-center rounded-full border border-border-subtle bg-surface text-text-secondary transition-colors hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-25"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
});
