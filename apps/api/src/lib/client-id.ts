const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function toDatabaseUuid(rawId?: string | null): string {
  if (!rawId) return '00000000-0000-4000-8000-000000000000';
  if (isUuid(rawId)) return rawId;
  let hash = 0;
  for (let index = 0; index < rawId.length; index += 1) {
    hash = ((hash << 5) - hash) + rawId.charCodeAt(index);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex.slice(0, 12)}`;
}
