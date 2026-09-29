import { avatarFormatDetails, detectAvatarFormat, isJpegSignature, isWebpSignature, type AvatarFormat } from '@light-weight/domain';

export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_OUTPUT_BYTES = 1_000_000;
export const AVATAR_MAX_DIMENSION = 512;

export type AvatarValidationError = 'unsupported_type' | 'source_too_large' | 'source_empty';

export function validateAvatarSource(file: Pick<File, 'type' | 'size'>): AvatarValidationError | null {
  if (file.size === 0) return 'source_empty';
  if (file.size > AVATAR_MAX_SOURCE_BYTES) return 'source_too_large';
  // Mobile pickers can omit File.type. Such files require byte inspection below.
  if (file.type && !AVATAR_ACCEPTED_TYPES.includes(file.type as typeof AVATAR_ACCEPTED_TYPES[number])) return 'unsupported_type';
  return null;
}

export class AvatarNormalizationError extends Error {
  constructor(readonly code: AvatarValidationError | 'normalization_failed' | 'output_too_large' | 'output_format_unsupported') {
    super(code);
  }
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };
export type NormalizedAvatar = { blob: Blob; mimeType: 'image/webp' | 'image/jpeg'; extension: 'webp' | 'jpg' };

function hasSupportedInputSignature(bytes: Uint8Array): boolean {
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  return isJpegSignature(bytes) || png || isWebpSignature(bytes);
}

export async function validateAvatarInputFile(file: File): Promise<void> {
  const validation = validateAvatarSource(file);
  if (validation) throw new AvatarNormalizationError(validation);
  if (file.type) return;
  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!hasSupportedInputSignature(header)) throw new AvatarNormalizationError('unsupported_type');
  } catch (error) {
    if (error instanceof AvatarNormalizationError) throw error;
    throw new AvatarNormalizationError('normalization_failed');
  }
}

export async function validateNormalizedAvatarBlob(blob: Blob): Promise<NormalizedAvatar> {
  if (blob.size === 0) throw new AvatarNormalizationError('normalization_failed');
  if (blob.size > AVATAR_MAX_OUTPUT_BYTES) throw new AvatarNormalizationError('output_too_large');
  if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') throw new AvatarNormalizationError('output_format_unsupported');
  try {
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const format = detectAvatarFormat(header);
    if (!format || avatarFormatDetails(format).mimeType !== blob.type) throw new AvatarNormalizationError('normalization_failed');
    return { blob, ...avatarFormatDetails(format) };
  } catch (error) {
    if (error instanceof AvatarNormalizationError) throw error;
    throw new AvatarNormalizationError('normalization_failed');
  }
}

export function avatarCenterCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return {
    sourceX: Math.floor((width - size) / 2),
    sourceY: Math.floor((height - size) / 2),
    sourceSize: size,
    outputSize: AVATAR_MAX_DIMENSION
  };
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
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

async function decodeAvatarImage(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Some mobile engines expose createImageBitmap but reject files that <img> can decode.
    }
  }
  return decodeWithImageElement(file);
}

function canvasBlob(canvas: HTMLCanvasElement, format: AvatarFormat): Promise<Blob> {
  const { mimeType } = avatarFormatDetails(format);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new AvatarNormalizationError('normalization_failed')), mimeType, 0.86);
  });
}

/**
 * Draws only the centered square into a new canvas. This deliberately
 * drops the source file's EXIF and avoids uploading original phone photos.
 */
export async function normalizeAvatarFile(file: File): Promise<NormalizedAvatar> {
  await validateAvatarInputFile(file);

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
    let webp: Blob | null = null;
    try { webp = await canvasBlob(canvas, 'webp'); } catch { /* Unsupported WebP encoder: try explicit JPEG below. */ }
    if (webp?.type === 'image/webp') return await validateNormalizedAvatarBlob(webp);
    return await validateNormalizedAvatarBlob(await canvasBlob(canvas, 'jpeg'));
  } catch (error) {
    if (error instanceof AvatarNormalizationError) throw error;
    throw new AvatarNormalizationError('normalization_failed');
  } finally {
    decoded?.release();
  }
}
