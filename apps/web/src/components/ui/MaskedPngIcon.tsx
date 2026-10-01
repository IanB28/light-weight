import React from 'react';

export interface MaskedPngIconProps {
  src: string;
  className?: string;
  opticalScale?: number;
}

/** Renders monochrome PNG artwork as a decorative currentColor mask. */
export const MaskedPngIcon: React.FC<MaskedPngIconProps> = ({
  src,
  className = '',
  opticalScale = 1
}) => (
  <span
    aria-hidden="true"
    data-icon-src={src}
    className={`masked-png-icon inline-block shrink-0 ${className}`}
  >
    <span
      className="block size-full"
      style={{
        backgroundColor: 'currentColor',
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        transform: `scale(${opticalScale})`
      }}
    />
  </span>
);
