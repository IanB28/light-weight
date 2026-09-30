import React, { useState } from 'react';
import type { StrengthRank } from '@light-weight/domain';
import { cn } from '@light-weight/ui';
import { useI18n } from '../lib/i18n.js';
import { getStrengthRankVisual } from '../lib/strength-rank-visuals.js';

export const REP_BADGE_ASSET_PATH = '/badges/rep-badge-template.png';

interface RepBadgeProps {
  repCount: number;
  rank?: StrengthRank | null;
  size?: 'xs' | 'sm';
  showGlow?: boolean;
  className?: string;
}

const badgeSizes = {
  xs: 'size-7',
  sm: 'size-8'
} as const;

const numberSizes = {
  xs: {
    single: 'text-[11px]',
    double: 'text-[9px]',
    triple: 'text-[7px]'
  },
  sm: {
    single: 'text-[13px]',
    double: 'text-[11px]',
    triple: 'text-[9px]'
  }
} as const;

function getNumberSize(size: 'xs' | 'sm', repCount: number) {
  const digits = String(repCount).length;
  if (digits >= 3) return numberSizes[size].triple;
  if (digits === 2) return numberSizes[size].double;
  return numberSizes[size].single;
}

export function RepBadge({
  repCount,
  rank = null,
  size = 'xs',
  showGlow = true,
  className
}: RepBadgeProps) {
  const { t } = useI18n();
  const [imgError, setImgError] = useState(false);
  if (!Number.isInteger(repCount) || repCount <= 0) return null;

  const label = t('profile.repBadgeLabel', { count: repCount });
  const visual = rank ? getStrengthRankVisual(rank) : null;
  const baseOpacity = (visual?.glowOpacity ?? 0) * 0.7;
  const showRankAura = showGlow && Boolean(visual) && baseOpacity > 0 && !imgError;
  const auraColor = visual ? (visual.glow || visual.accent) : undefined;
  const maskStyle = {
    backgroundColor: auraColor,
    maskImage: `url("${REP_BADGE_ASSET_PATH}")`,
    WebkitMaskImage: `url("${REP_BADGE_ASSET_PATH}")`,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskSize: 'contain'
  } as React.CSSProperties;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-visible',
        badgeSizes[size],
        className
      )}
    >
      {showRankAura && (
        <span
          aria-hidden="true"
          data-testid="rep-badge-aura"
          className="pointer-events-none absolute inset-0 select-none"
        >
          <span
            data-testid="rep-badge-aura-outer"
            className="pointer-events-none absolute -inset-1 blur-[3.5px]"
            style={{ opacity: Math.min(1, baseOpacity * 0.55) }}
          >
            <span className="block size-full" style={maskStyle} />
          </span>
          <span
            data-testid="rep-badge-aura-inner"
            className="pointer-events-none absolute -inset-0.5 blur-[1.5px]"
            style={{ opacity: Math.min(1, baseOpacity * 1.15) }}
          >
            <span className="block size-full" style={maskStyle} />
          </span>
        </span>
      )}

      {!imgError ? (
        <img
          src={REP_BADGE_ASSET_PATH}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          onError={() => setImgError(true)}
          className="relative size-full object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          data-testid="rep-badge-fallback"
          className="absolute inset-0 rounded-full border border-border-subtle bg-surface-input"
        />
      )}

      <span
        aria-hidden="true"
        data-testid="rep-badge-number"
        className={cn(
          'pointer-events-none absolute left-1/2 top-[41.5%] z-10 -translate-x-1/2 -translate-y-1/2 font-[900] leading-none tabular-nums tracking-[-0.04em]',
          imgError ? 'text-text-primary' : 'text-[#FFF4D6]',
          getNumberSize(size, repCount)
        )}
        style={{
          fontFamily: '"Arial Narrow", "Roboto Condensed", sans-serif',
          textShadow: imgError ? undefined : '0 1px 2px rgba(0, 0, 0, 0.75)'
        }}
      >
        {repCount}
      </span>
    </span>
  );
}
