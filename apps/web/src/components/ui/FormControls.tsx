import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@light-weight/ui';

export const SearchInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }>(function SearchInput({ label, className, id, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return <label htmlFor={inputId} className="relative block"><span className="sr-only">{label}</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input ref={ref} id={inputId} type="search" className={cn('ui-focus-visible ui-control-surface h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted read-only:bg-surface-active disabled:cursor-not-allowed disabled:opacity-60', className)} {...props} /></label>;
});
