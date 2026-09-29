const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATABASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** PostgreSQL accepts UUID literals independently of RFC version/variant bits. */
export function isDatabaseUuidLiteral(value: unknown): value is string {
  return typeof value === 'string' && DATABASE_UUID_PATTERN.test(value);
}

/** Historical client-ID mapping used by the API. Never change this algorithm: rows already use its output. */
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

/** Routine IDs may already be persisted PostgreSQL UUIDs; legacy aliases keep their original hash. */
export function canonicalizeRoutineId(rawId?: string | null): string {
  return isDatabaseUuidLiteral(rawId) ? rawId : toDatabaseUuid(rawId);
}
