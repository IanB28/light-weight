import React from 'react';
import { cn } from '@light-weight/ui';

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex min-h-6 items-center rounded-full border border-border-subtle bg-surface-input px-2.5 text-[11px] font-bold text-text-secondary', className)} {...props} />;
}

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ selected, className, ...props }: ChipProps) {
  return <button type="button" aria-pressed={selected} className={cn('min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-45', selected ? 'border-accent bg-accent text-accent-fg shadow-accent' : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-active hover:text-text-primary', className)} {...props} />;
}

export interface SegmentOption<T extends string> { value: T; label: string; icon?: React.ReactNode }
export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({ value, options, onChange, label, className }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('grid rounded-ui-lg border border-border-subtle bg-surface-input p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn('flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-ui-md px-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', value === option.value ? 'bg-accent text-accent-fg shadow-sm' : 'text-text-muted hover:text-text-primary')}>
          {option.icon}{option.label}
        </button>
      ))}
    </div>
  );
}
