import React from 'react';
import { cn } from '@light-weight/ui';
import { useI18n } from '../lib/i18n.js';

interface RepBadgeProps {
  repCount: number;
  className?: string;
}

export function RepBadge({ repCount, className }: RepBadgeProps) {
  const { t } = useI18n();
  if (!Number.isInteger(repCount) || repCount <= 0) return null;
  const label = t('profile.repBadgeLabel', { count: repCount });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent-soft px-1 text-[10px] font-black tabular-nums leading-none text-accent',
        className
      )}
    >
      {repCount}
    </span>
  );
}
