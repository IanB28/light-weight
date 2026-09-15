import React from 'react';
import { cn } from '@light-weight/ui';

export interface AppLogoProps {
  size?: number | string;
  className?: string;
  alt?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  priority?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 32,
  className,
  alt = 'Light Weight',
  'aria-hidden': ariaHidden,
  priority = false
}) => {
  const isDecorative = ariaHidden === true || ariaHidden === 'true';
  const numericSize = typeof size === 'number' ? size : undefined;
  const style = numericSize ? { width: `${numericSize}px`, height: `${numericSize}px` } : undefined;

  return (
    <img
      src="/brand/icon-192.png"
      alt={isDecorative ? '' : alt}
      aria-hidden={isDecorative ? 'true' : undefined}
      width={numericSize}
      height={numericSize}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      style={style}
      className={cn(
        'inline-block shrink-0 select-none object-contain transition-transform duration-200',
        typeof size === 'string' && size,
        className
      )}
    />
  );
};
