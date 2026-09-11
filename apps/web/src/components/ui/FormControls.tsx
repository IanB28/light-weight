import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@light-weight/ui';

interface FieldProps { label: string; hint?: string; error?: string }

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, hint, error, className, id, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return <label htmlFor={inputId} className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{label}</span><input ref={ref} id={inputId} className={cn('h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-45', className)} {...props} />{(error || hint) && <span className={cn('block text-[11px] font-medium', error ? 'text-danger' : 'text-text-muted')}>{error || hint}</span>}</label>;
});

export const SearchInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }>(function SearchInput({ label, className, id, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return <label htmlFor={inputId} className="relative block"><span className="sr-only">{label}</span><Search aria-hidden="true" className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input ref={ref} id={inputId} type="search" className={cn('h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-10 pr-4 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25', className)} {...props} /></label>;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function Select({ label, hint, error, className, id, children, ...props }, ref) {
  const generatedId = React.useId();
  const selectId = id || generatedId;
  return <label htmlFor={selectId} className="block space-y-1.5 text-xs font-bold text-text-secondary"><span>{label}</span><select ref={ref} id={selectId} className={cn('h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-45', className)} {...props}>{children}</select>{(error || hint) && <span className={cn('block text-[11px]', error ? 'text-danger' : 'text-text-muted')}>{error || hint}</span>}</label>;
});
