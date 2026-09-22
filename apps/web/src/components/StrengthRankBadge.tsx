import React, { useState } from 'react';
import { type StrengthRank } from '@light-weight/domain';
import { getStrengthRankVisual } from '../lib/strength-rank-visuals.js';
import { Shield } from 'lucide-react';

export interface StrengthRankBadgeProps {
  rank: StrengthRank;
  size?: 'sm' | 'md' | 'lg' | 'xl';
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
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  }[size];

  const iconSizes = {
    sm: 12,
    md: 18,
    lg: 28,
    xl: 40
  }[size];

  const glowStyle = showGlow
    ? { filter: `drop-shadow(0 0 10px ${visual.glow}) drop-shadow(0 0 20px ${visual.glow})` }
    : undefined;

  return (
    <div className={`relative inline-flex shrink-0 select-none items-center justify-center ${sizeClasses} ${className}`} title={visual.name}>
      {!imgError ? (
        <img
          src={visual.assetPath}
          alt={visual.name}
          className="size-full object-contain"
          style={glowStyle}
          onError={() => setImgError(true)}
          loading="lazy"
        />
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
