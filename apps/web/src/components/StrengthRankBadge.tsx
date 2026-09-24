import React, { useState } from 'react';
import { type StrengthRank } from '@light-weight/domain';
import { getStrengthRankVisual } from '../lib/strength-rank-visuals.js';
import { Shield } from 'lucide-react';

export interface StrengthRankBadgeProps {
  rank: StrengthRank;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showGlow?: boolean;
  className?: string;
}

export const StrengthRankBadge: React.FC<StrengthRankBadgeProps> = ({
  rank,
  size = 'md',
  showGlow = false,
  className = ''
}) => {
  const [imgError, setImgError] = useState(false);
  const visual = getStrengthRankVisual(rank);

  const sizeClasses = {
    xs: 'size-5',
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  }[size];

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 18,
    lg: 28,
    xl: 40
  }[size];

  // Progressive opacity derived systematically from STRENGTH_RANK_VISUALS glowOpacity.
  // Preserves rank progression: novato (0) -> principiante (0.15) -> ... -> dios (0.70)
  const baseOpacity = visual.glowOpacity ?? 0.6;
  // Layer A (Inner aura): tight to silhouette contour with boosted density for high-DPI iOS visibility
  const innerOpacity = Math.min(1, Math.round(baseOpacity * 1.4 * 100) / 100);
  // Layer B (Outer aura): wider atmospheric diffusion extending perceived glow outward
  const outerOpacity = Math.min(1, Math.round(baseOpacity * 0.8 * 100) / 100);

  const innerBlur = {
    xs: '1.5px',
    sm: '2px',
    md: '3px',
    lg: '4px',
    xl: '5px',
  }[size];

  const outerBlur = {
    xs: '3.5px',
    sm: '4.5px',
    md: '6.5px',
    lg: '8.5px',
    xl: '11px',
  }[size];

  const innerInset = {
    xs: '-inset-0.5',
    sm: '-inset-0.5',
    md: '-inset-1',
    lg: '-inset-1.5',
    xl: '-inset-2',
  }[size];

  const outerInset = {
    xs: '-inset-1',
    sm: '-inset-1.5',
    md: '-inset-2.5',
    lg: '-inset-3.5',
    xl: '-inset-4',
  }[size];

  return (
    <div className={`relative inline-flex shrink-0 select-none items-center justify-center ${sizeClasses} ${className}`} title={visual.name}>
      {!imgError ? (
        <>
          {showGlow && (
            <span
              aria-hidden="true"
              data-testid="strength-rank-aura"
              className="pointer-events-none absolute inset-0 select-none"
            >
              {/* Outer atmospheric aura layer — wider diffusion, soft glow */}
              <span
                data-testid="strength-rank-aura-outer"
                className={`pointer-events-none absolute ${outerInset}`}
                style={{
                  filter: `blur(${outerBlur})`,
                  opacity: outerOpacity,
                }}
              >
                <span
                  className="block size-full"
                  style={{
                    backgroundColor: visual.glow || visual.accent,
                    maskImage: `url("${visual.assetPath}")`,
                    WebkitMaskImage: `url("${visual.assetPath}")`,
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                  }}
                />
              </span>

              {/* Inner contour aura layer — tighter blur, higher opacity along the badge edge */}
              <span
                data-testid="strength-rank-aura-inner"
                className={`pointer-events-none absolute ${innerInset}`}
                style={{
                  filter: `blur(${innerBlur})`,
                  opacity: innerOpacity,
                }}
              >
                <span
                  className="block size-full"
                  style={{
                    backgroundColor: visual.glow || visual.accent,
                    maskImage: `url("${visual.assetPath}")`,
                    WebkitMaskImage: `url("${visual.assetPath}")`,
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                  }}
                />
              </span>
            </span>
          )}
          <img
            src={visual.assetPath}
            alt={visual.name}
            className="relative size-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </>
      ) : (
        <div
          className="w-full h-full rounded-xl flex flex-col items-center justify-center font-extrabold tracking-tight tabular-nums border"
          style={{
            backgroundColor: `${visual.color}15`,
            borderColor: `${visual.color}50`,
            color: visual.color
          }}
        >
          <Shield size={iconSizes} style={{ color: visual.color }} />
          <span className="text-[9px] font-bold mt-0.5 leading-none">{visual.index}</span>
        </div>
      )}
    </div>
  );
};
