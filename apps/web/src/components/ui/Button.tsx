import React from 'react';
import { cn } from '@light-weight/ui';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg border-transparent shadow-accent hover:brightness-110',
  secondary: 'bg-surface-input text-text-primary border-border-subtle hover:border-border-active hover:bg-surface-active',
  ghost: 'bg-transparent text-text-secondary border-transparent hover:bg-surface-active hover:text-text-primary',
  danger: 'bg-danger-soft text-danger border-danger/30 hover:bg-danger/20'
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs rounded-ui-md',
  md: 'min-h-11 px-4 text-sm rounded-ui-lg',
  lg: 'min-h-12 px-5 text-sm rounded-ui-lg'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 border font-bold transition-[transform,background-color,border-color,filter,opacity] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  'aria-label': string;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size = 'md', children, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      size="sm"
      className={cn(size === 'md' ? 'size-11 min-h-11 p-0' : 'size-9 min-h-9 p-0', 'shrink-0 rounded-full', className)}
      {...props}
    >
      {children}
    </Button>
  );
});
