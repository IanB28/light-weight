import React, { useState } from 'react';
import { Check, ChevronDown, Info } from 'lucide-react';
import { BottomSheet } from './Disclosure.js';
import { useI18n } from '../../lib/i18n.js';
import { RIR_SCALE_ITEMS } from './rir-content.js';

export interface RirPickerProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  ariaLabel: string;
  className?: string;
}

interface RirOption {
  value: number | undefined;
  label: string;
  description: string;
}

export function RirPicker({
  value,
  onChange,
  ariaLabel,
  className = ''
}: RirPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const displayLabel = value === undefined
    ? '—'
    : value >= 6
      ? '6+'
      : String(value);

  const options: RirOption[] = [
    {
      value: undefined,
      label: t('workout.rirUnlogged'),
      description: t('workout.rirUnloggedDesc')
    },
    ...RIR_SCALE_ITEMS.map((item) => ({
      value: item.value,
      label: item.label === '6+' ? t('workout.rir6Plus') : item.label,
      description: t(item.descriptionKey)
    }))
  ];

  const isOptionSelected = (optValue: number | undefined): boolean => {
    if (optValue === undefined) return value === undefined;
    if (optValue === 6) return value !== undefined && value >= 6;
    return value === optValue;
  };

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`flex min-h-11 w-full items-center justify-between rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-xs font-bold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('workout.rirPickerTitle')}
        description={t('workout.rirEstimateDefinition')}
      >
        <div className="mb-3 flex items-start gap-2.5 rounded-ui-lg border border-accent/25 bg-accent/10 p-3 text-xs leading-relaxed text-text-secondary">
          <Info aria-hidden="true" className="size-4 shrink-0 text-accent mt-0.5" />
          <span>{t('workout.rirUnsureGuidance')}</span>
        </div>

        <div role="listbox" aria-label={ariaLabel} className="space-y-2 pb-4">
          {options.map((option) => {
            const selected = isOptionSelected(option.value);
            return (
              <button
                key={option.value === undefined ? 'unknown' : String(option.value)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-ui-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  selected
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-subtle bg-surface-input text-text-primary'
                }`}
              >
                <div>
                  <span className="block text-sm font-bold font-mono">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {option.description}
                  </span>
                </div>
                {selected && (
                  <Check aria-label={t('common.selected')} className="size-4 shrink-0 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
