/**
 * Versioned compatibility exceptions for migration ledgers already applied in
 * the field. Source files remain pinned to their canonical hashes; aliases
 * only describe known historical bytes in Drizzle's applied-migration table.
 */
export const MIGRATION_HASH_COMPATIBILITY_V1 = Object.freeze({
  version: 1,
  migrations: Object.freeze({
    1789500000000: Object.freeze({
      tag: '0002_auth_identities_v1',
      canonicalSourceHash: '873a183ad658dc725eafa63a5046f7c8e7867d9a057a9f878890158197a1991f',
      acceptedAppliedHashes: Object.freeze([
        '873a183ad658dc725eafa63a5046f7c8e7867d9a057a9f878890158197a1991f',
        // This exact mixed-line-ending file was applied before 0002's BOM
        // cleanup. It is a byte-equivalent historical ledger identity only.
        'cbeff05f643ccbe03371cfb81bd73fe7e427aa4908238b0ad68a1b43088f46c4',
      ]),
    }),
  }),
});

export function legacyMigrationHashCompatibility(when, tag) {
  const compatibility = MIGRATION_HASH_COMPATIBILITY_V1.migrations[when];
  return compatibility?.tag === tag ? compatibility : undefined;
}
