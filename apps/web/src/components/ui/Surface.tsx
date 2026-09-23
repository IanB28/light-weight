import React from 'react';
import { cn } from '@light-weight/ui';

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  interactive?: boolean;
  compact?: boolean;
}

export function AppCard({ elevated, interactive, compact, className, ...props }: AppCardProps) {
  return (
    <div
      className={cn(
        'glass-surface relative rounded-ui-xl border border-border-subtle',
        elevated && 'bg-surface-elevated shadow-modal',
        interactive && 'transition-[transform,border-color,background-color] hover:border-border-active active:scale-[0.99]',
        compact ? 'p-card-compact' : 'p-card',
        className
      )}
      {...props}
    />
  );
}

export interface ElevatedSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export function ElevatedSurface({
  as: Component = 'div',
  className,
  children,
  ...props
}: ElevatedSurfaceProps) {
  return (
    <Component
      className={cn(
        'glass-surface rounded-ui-xl border border-border-glass bg-surface-elevated shadow-modal',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
