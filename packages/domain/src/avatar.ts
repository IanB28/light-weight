/** Minimum WebP container identity shared by browser output and API upload validation. */
export function isWebpSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 // RIFF
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP
}

/** Container identity only; decoding and the upload size limit are separate checks. */
export function isJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type AvatarFormat = 'webp' | 'jpeg';

export function detectAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
  if (isWebpSignature(bytes)) return 'webp';
  if (isJpegSignature(bytes)) return 'jpeg';
  return null;
}

export function avatarFormatDetails(format: AvatarFormat): { mimeType: 'image/webp' | 'image/jpeg'; extension: 'webp' | 'jpg' } {
  return format === 'webp'
    ? { mimeType: 'image/webp', extension: 'webp' }
    : { mimeType: 'image/jpeg', extension: 'jpg' };
}
