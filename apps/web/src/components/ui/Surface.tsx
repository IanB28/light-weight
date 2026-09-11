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
