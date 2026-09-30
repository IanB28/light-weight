import React, { useState } from 'react';
import type { StrengthRank } from '@light-weight/domain';
import { cn } from '@light-weight/ui';
import { useI18n } from '../lib/i18n.js';
import { getStrengthRankVisual } from '../lib/strength-rank-visuals.js';

export const REP_BADGE_ASSET_PATH = '/badges/medal.png';

interface RepBadgeProps {
  repCount: number;
  rank?: StrengthRank | null;
  size?: 'xs' | 'sm';
  showGlow?: boolean;
  className?: string;
}

const badgeSizes = {
  xs: 'w-5 aspect-[420/554]',
  sm: 'w-6 aspect-[420/554]'
} as const;

const numberSizes = {
  single: 'text-[38cqw]',
  double: 'text-[32cqw]',
  triple: 'text-[26cqw]',
  quadruple: 'text-[20cqw]'
} as const;

function resolveRepBadgeAuraOpacity(glowOpacity: number) {
  const baseOpacity = Math.max(0, Math.min(1, glowOpacity)) * 0.35;
  return {
    inner: Math.round(Math.min(1, baseOpacity * 1.1) * 1000) / 1000,
    outer: Math.round(Math.min(1, baseOpacity * 0.3) * 1000) / 1000
  };
}

function getNumberSize(repCount: number) {
  const digits = String(repCount).length;
  if (digits >= 4) return numberSizes.quadruple;
  if (digits === 3) return numberSizes.triple;
  if (digits === 2) return numberSizes.double;
  return numberSizes.single;
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
  const auraOpacity = resolveRepBadgeAuraOpacity(visual?.glowOpacity ?? 0);
  const showRankAura = showGlow && Boolean(visual) && auraOpacity.inner > 0 && !imgError;
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
      style={{ containerType: 'size' }}
    >
      {showRankAura && (
        <span
          aria-hidden="true"
          data-testid="rep-badge-aura"
          className="pointer-events-none absolute inset-0 select-none"
        >
          <span
            data-testid="rep-badge-aura-outer"
            className="pointer-events-none absolute -inset-px blur-[2px]"
            style={{ opacity: auraOpacity.outer }}
          >
            <span className="block size-full" style={maskStyle} />
          </span>
          <span
            data-testid="rep-badge-aura-inner"
            className="pointer-events-none absolute inset-0 blur-[1px]"
            style={{ opacity: auraOpacity.inner }}
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
          className="absolute inset-0 size-full object-contain"
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
          'pointer-events-none absolute left-1/2 top-[61%] z-10 -translate-x-1/2 -translate-y-1/2 font-[800] leading-none tabular-nums tracking-[-0.01em]',
          imgError ? 'text-text-primary' : 'text-[#6b3f0e]',
          getNumberSize(repCount)
        )}
        style={{
          fontFamily: '"Barlow Condensed", "Arial Narrow", Impact, sans-serif',
          lineHeight: 1,
          textShadow: imgError
            ? undefined
            : '0 0.028em 0 rgba(255, 238, 180, 0.75), 0 -0.012em 0 rgba(60, 30, 4, 0.35)'
        }}
      >
        {repCount}
      </span>
    </span>
  );
}
