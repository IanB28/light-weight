import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@light-weight/ui';
import { BottomSheet } from './Disclosure.js';
import { useI18n } from '../../lib/i18n.js';

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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  return <><button type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={cn('ui-focus-visible ui-control-surface flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-left text-sm font-semibold text-text-primary hover:border-border-active', className)}><span className="min-w-0 truncate">{triggerLabel || selected?.label}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" /></button>
    <BottomSheet open={open} onClose={() => setOpen(false)} title={title}><div role="listbox" aria-label={ariaLabel} className="space-y-2 pb-4">{options.map((option) => <button key={String(option.value)} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={cn('ui-focus-visible ui-control-surface flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-ui-lg border px-3 py-2 text-left hover:border-border-active', option.value === value ? 'ui-selected-option text-text-primary' : 'border-border-subtle bg-surface-input text-text-primary')}><span className="min-w-0"><span className="block break-words text-sm font-bold">{option.label}</span>{option.description && <span className="ui-caption mt-0.5 block break-words">{option.description}</span>}</span>{option.value === value && <Check aria-label={t('common.selected')} className="size-4 shrink-0 text-text-primary" />}</button>)}</div></BottomSheet>
  </>;
}
