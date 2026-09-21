export type MigrationJournalEntry = {
  when: number;
  tag: string;
  hash: string;
  acceptedAppliedHashes?: readonly string[];
};
export type AppliedMigration = { when: number; hash: string };
export type RemoteMigration = { created_at?: number | string; when?: number | string; hash?: string };

export function readExpectedMigrations(migrationsFolder: string, journalPath: string): MigrationJournalEntry[];
export function normalizeAppliedMigrations(rows: readonly RemoteMigration[]): AppliedMigration[];
export function compareMigrationLedger(expected: readonly MigrationJournalEntry[], remoteRows: readonly RemoteMigration[]): {
  ok: boolean;
  applied: AppliedMigration[];
  missing: MigrationJournalEntry[];
  hashMismatches: MigrationJournalEntry[];
};
