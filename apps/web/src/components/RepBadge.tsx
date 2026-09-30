import React from 'react';
import { cn } from '@light-weight/ui';
import { isValidFeaturedRepCount } from '@light-weight/domain';

interface RepBadgeProps {
  repCount: number;
  className?: string;
}

export function RepBadge({ repCount, className }: RepBadgeProps) {
  if (!isValidFeaturedRepCount(repCount)) return null;
  return (
    <span
      role="img"
      aria-label={`${repCount}RM`}
      title={`${repCount}RM`}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-accent/55 bg-accent-soft text-[10px] font-black tabular-nums leading-none text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]',
        className
      )}
    >
      {repCount}
    </span>
  );
}
