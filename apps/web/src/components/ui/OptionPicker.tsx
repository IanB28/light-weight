import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BottomSheet } from './Disclosure.js';

export interface OptionPickerOption<T extends string | number> { value: T; label: string; description?: string; }
interface OptionPickerProps<T extends string | number> {
  value: T;
  options: OptionPickerOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  title?: string;
  triggerLabel?: string;
  className?: string;
}

export function OptionPicker<T extends string | number>({ value, options, onChange, ariaLabel, title = ariaLabel, triggerLabel, className = '' }: OptionPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  return <><button type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`flex min-h-11 w-full items-center justify-between rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-xs font-bold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}><span className="truncate">{triggerLabel || selected?.label}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" /></button>
    <BottomSheet open={open} onClose={() => setOpen(false)} title={title}><div role="listbox" aria-label={ariaLabel} className="space-y-2 pb-4">{options.map((option) => <button key={String(option.value)} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-ui-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${option.value === value ? 'border-accent bg-accent-soft text-accent' : 'border-border-subtle bg-surface-input text-text-primary'}`}><span><span className="block text-sm font-bold">{option.label}</span>{option.description && <span className="mt-0.5 block text-xs text-text-muted">{option.description}</span>}</span>{option.value === value && <Check aria-label="Seleccionado" className="size-4 shrink-0" />}</button>)}</div></BottomSheet>
  </>;
}
