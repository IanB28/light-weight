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
    1790000000000: Object.freeze({
      tag: '0007_historical_personal_records',
      canonicalSourceHash: '89800f68da2dcf6a91561cfecf66fbe0e8bd861a1af3e409d308eefd10495a3a',
      acceptedAppliedHashes: Object.freeze([
        '89800f68da2dcf6a91561cfecf66fbe0e8bd861a1af3e409d308eefd10495a3a',
        // Applied to production from a Windows checkout (CRLF line endings).
        'd529ae8e196aad61922efcadc7f9a06b23cb9a46f3aec4eb7bf2aba3bf44ff11',
      ]),
    }),
    1790100000000: Object.freeze({
      tag: '0008_hpr_reps_cap_constraint',
      canonicalSourceHash: '60b429daaed9a50e09463e577f03b624ca74793dc30e095e3f4c997962398feb',
      acceptedAppliedHashes: Object.freeze([
        '60b429daaed9a50e09463e577f03b624ca74793dc30e095e3f4c997962398feb',
        // Applied to production from a Windows checkout (CRLF line endings).
        '255e2c1dd5edc6267b0228c4adf7d86ff0217e5a25450f22d2019cce92a71a9e',
      ]),
    }),
  }),
});

export function legacyMigrationHashCompatibility(when, tag) {
  const compatibility = MIGRATION_HASH_COMPATIBILITY_V1.migrations[when];
  return compatibility?.tag === tag ? compatibility : undefined;
}
