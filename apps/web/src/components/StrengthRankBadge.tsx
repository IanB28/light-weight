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

  const blurRadius = {
    xs: '2px',
    sm: '3px',
    md: '4px',
    lg: '5px',
    xl: '6px',
  }[size];

  return (
    <div className={`relative inline-flex shrink-0 select-none items-center justify-center ${sizeClasses} ${className}`} title={visual.name}>
      {!imgError ? (
        <>
          {showGlow && (
            <span
              aria-hidden="true"
              data-testid="strength-rank-aura"
              className="pointer-events-none absolute -inset-1"
              style={{
                filter: `blur(${blurRadius})`,
                opacity: visual.glowOpacity ?? 0.6,
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
          className="w-full h-full rounded-xl flex flex-col items-center justify-center font-black font-mono border"
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
