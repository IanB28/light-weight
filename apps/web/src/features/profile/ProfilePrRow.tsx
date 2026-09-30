import React from 'react';
import { Dumbbell, Shield } from 'lucide-react';
import type { Exercise, StrengthRank } from '@light-weight/domain';
import { cn } from '@light-weight/ui';
import { RepBadge } from '../../components/RepBadge.js';
import { StrengthRankBadge } from '../../components/StrengthRankBadge.js';
import { getExerciseImgUrl } from '../../lib/exercises.js';

interface ProfilePrRowProps {
  exercise?: Exercise | null;
  name: string;
  rank: StrengthRank | null;
  repCount?: number;
  displayLoad: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  ariaLabel?: string;
  className?: string;
}

export function ProfilePrRow({
  exercise,
  name,
  rank,
  repCount,
  displayLoad,
  selected = false,
  disabled = false,
  onSelect,
  ariaLabel,
  className
}: ProfilePrRowProps) {
  const imageUrl = getExerciseImgUrl(exercise ?? undefined);
  const content = (
    <>
      <span aria-hidden="true" data-testid="pr-exercise-badge" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted shadow-sm">
        {imageUrl
          ? <img src={imageUrl} alt="" loading="lazy" className="size-full object-cover" />
          : <Dumbbell className="size-4.5 stroke-[1.8]" />}
      </span>
      <span data-testid="pr-exercise-name" className="min-w-0 flex-1 truncate text-xs font-bold text-text-primary sm:text-sm">{name}</span>
      <span data-testid="pr-badge-slot" className="flex shrink-0 items-center gap-1.5 overflow-visible">
        <span data-testid="pr-rank-slot" className="flex w-7 shrink-0 items-center justify-center">
          {rank
            ? <StrengthRankBadge rank={rank} size="xs" showGlow />
            : <span data-testid="pr-rank-placeholder" aria-hidden="true" className="flex size-5 items-center justify-center rounded-full text-text-muted/40"><Shield className="size-3.5" /></span>}
        </span>
        {repCount !== undefined && <RepBadge repCount={repCount} rank={rank} showGlow />}
      </span>
      <span data-testid="pr-weight-slot" className="w-20 shrink-0 text-right text-xs font-bold tabular-nums text-accent sm:w-24 sm:text-sm">{displayLoad}</span>
    </>
  );

  const classes = cn(
    'flex min-h-14 w-full items-center gap-2.5 px-3 py-2 text-left sm:gap-3',
    onSelect && 'rounded-ui-lg border border-border-subtle bg-surface outline-none transition-colors hover:bg-surface-active focus-visible:ring-2 focus-visible:ring-accent',
    selected && 'border-accent bg-accent-soft',
    disabled && 'cursor-not-allowed opacity-45',
    className
  );

  if (onSelect) {
    return <button type="button" aria-label={ariaLabel} aria-pressed={selected} disabled={disabled} onClick={onSelect} className={classes}>{content}</button>;
  }
  return <div className={classes}>{content}</div>;
}
