import React, { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@light-weight/ui';
import { useI18n } from '../../lib/i18n.js';

export function togglePasswordVisibility(current: boolean): boolean {
  return !current;
}

export function resolvePasswordInputType(showPassword: boolean): 'password' | 'text' {
  return showPassword ? 'text' : 'password';
}

export interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string | null;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label, id, className, autoComplete = 'current-password', disabled, error, visible, onVisibleChange, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [internalVisible, setInternalVisible] = useState(false);
  const isVisible = visible !== undefined ? visible : internalVisible;
  const { t } = useI18n();

  const toggleVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const next = togglePasswordVisibility(isVisible);
    if (visible === undefined) {
      setInternalVisible(next);
    }
    onVisibleChange?.(next);
  };

  return (
    <label htmlFor={inputId} className="block space-y-1.5 text-xs font-bold text-text-secondary">
      <span>{label}</span>
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={inputId}
          type={resolvePasswordInputType(isVisible)}
          autoComplete={autoComplete}
          disabled={disabled}
          className={cn(
            'h-11 w-full rounded-ui-lg border border-border-subtle bg-surface-input pl-3 pr-11 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors',
            'focus:border-accent focus:ring-2 focus:ring-accent/25',
            'disabled:pointer-events-none disabled:opacity-50',
            error && 'border-danger/60 focus:border-danger focus:ring-danger/25',
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled}
          aria-label={isVisible ? t('auth.hidePassword') : t('auth.showPassword')}
          title={isVisible ? t('auth.hidePassword') : t('auth.showPassword')}
          tabIndex={0}
          className={cn(
            'absolute right-0 inset-y-0 flex size-11 items-center justify-center rounded-r-ui-lg text-text-muted transition-colors',
            'hover:text-text-primary focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
            'disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          {isVisible ? (
            <EyeOff className="size-4.5" aria-hidden="true" />
          ) : (
            <Eye className="size-4.5" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <span role="alert" className="block text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </label>
  );
});
