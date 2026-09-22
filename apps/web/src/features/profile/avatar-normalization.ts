export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_OUTPUT_BYTES = 1_000_000;
export const AVATAR_MAX_DIMENSION = 512;

export type AvatarValidationError = 'unsupported_type' | 'source_too_large';

export function validateAvatarSource(file: Pick<File, 'type' | 'size'>): AvatarValidationError | null {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type as typeof AVATAR_ACCEPTED_TYPES[number])) return 'unsupported_type';
  if (file.size > AVATAR_MAX_SOURCE_BYTES) return 'source_too_large';
  return null;
}

export class AvatarNormalizationError extends Error {
  constructor(readonly code: AvatarValidationError | 'normalization_failed' | 'output_too_large') {
    super(code);
  }
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };

export function avatarCenterCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return {
    sourceX: Math.floor((width - size) / 2),
    sourceY: Math.floor((height - size) / 2),
    sourceSize: size,
    outputSize: AVATAR_MAX_DIMENSION
  };
}

async function decodeAvatarImage(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new AvatarNormalizationError('normalization_failed'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new AvatarNormalizationError('normalization_failed')), 'image/webp', 0.86);
  });
}

/**
 * Draws only the centered square into a new WebP canvas. This deliberately
 * drops the source file's EXIF and avoids uploading original phone photos.
 */
export async function normalizeAvatarFile(file: File): Promise<Blob> {
  const validation = validateAvatarSource(file);
  if (validation) throw new AvatarNormalizationError(validation);

  let decoded: DecodedImage | undefined;
  try {
    decoded = await decodeAvatarImage(file);
    if (!decoded.width || !decoded.height) throw new AvatarNormalizationError('normalization_failed');
    const crop = avatarCenterCrop(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_MAX_DIMENSION;
    canvas.height = AVATAR_MAX_DIMENSION;
    const context = canvas.getContext('2d');
    if (!context) throw new AvatarNormalizationError('normalization_failed');
    context.drawImage(decoded.source, crop.sourceX, crop.sourceY, crop.sourceSize, crop.sourceSize, 0, 0, crop.outputSize, crop.outputSize);
    const normalized = await canvasBlob(canvas);
    if (normalized.size > AVATAR_MAX_OUTPUT_BYTES) throw new AvatarNormalizationError('output_too_large');
    return normalized;
  } catch (error) {
    if (error instanceof AvatarNormalizationError) throw error;
    throw new AvatarNormalizationError('normalization_failed');
  } finally {
    decoded?.release();
  }
}
