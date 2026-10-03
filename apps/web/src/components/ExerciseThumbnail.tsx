import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { Exercise } from '@light-weight/domain';
import { getExerciseImgUrl } from '../lib/exercises.js';
import { shouldShowExerciseImage } from '../lib/exercise-thumbnail-state.js';

export type ExerciseThumbnailSize = 'xs' | 'sm' | 'md' | 'lg' | 'fill';

const SIZE_CLASSES: Record<ExerciseThumbnailSize, string> = {
  xs: 'size-9',
  sm: 'size-10',
  md: 'size-11',
  lg: 'size-12',
  fill: 'size-full'
};

const ICON_CLASSES: Record<ExerciseThumbnailSize, string> = {
  xs: 'size-4', sm: 'size-4', md: 'size-5', lg: 'size-5', fill: 'size-8'
};

export function ExerciseThumbnail({ exercise, size = 'sm', alt = '', className = '' }: {
  exercise?: Pick<Exercise, 'img'> | null;
  size?: ExerciseThumbnailSize;
  alt?: string;
  className?: string;
}) {
  const url = getExerciseImgUrl(exercise ?? undefined);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = shouldShowExerciseImage(url, failedUrl);

  return <span
    data-testid="exercise-thumbnail"
    data-size={size}
    role={!showImage && alt ? 'img' : undefined}
    aria-label={!showImage && alt ? alt : undefined}
    className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-ui-md border border-border-subtle bg-surface-input text-text-muted ${SIZE_CLASSES[size]} ${className}`}
  >
    {showImage
      ? <img src={url!} alt={alt} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} className="size-full object-contain" />
      : <Dumbbell aria-hidden="true" className={ICON_CLASSES[size]} />}
  </span>;
}
