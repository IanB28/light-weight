import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateSchemaCompatibility, readExpectedMigrationJournal, schemaVerificationFailureReason } from './schema-compatibility.js';

const expected = readExpectedMigrationJournal();
const applied = expected.map(({ when, hash }) => ({ when, hash }));

test('schema compatibility requires every exact local migration hash and timestamp', () => {
  const exact = evaluateSchemaCompatibility(expected, applied);
  assert.equal(exact.ok, true);

  const behind = evaluateSchemaCompatibility(expected, applied.slice(0, 4));
  assert.equal(behind.ok, false);
  if (!behind.ok) assert.deepEqual(behind.missing.map((entry) => entry.tag), expected.slice(4).map((entry) => entry.tag));

  const missingMiddle = evaluateSchemaCompatibility(expected, applied.filter((entry) => entry.when !== expected[3].when));
  assert.equal(missingMiddle.ok, false);
  if (!missingMiddle.ok) assert.deepEqual(missingMiddle.missing.map((entry) => entry.tag), [expected[3].tag]);

  const wrongHash = evaluateSchemaCompatibility(expected, applied.map((entry, index) => index === 2 ? { ...entry, hash: 'incorrect-hash' } : entry));
  assert.equal(wrongHash.ok, false);
  if (!wrongHash.ok) {
    assert.equal(wrongHash.reason, 'migration_hash_mismatch');
    assert.deepEqual(wrongHash.hashMismatches.map((entry) => entry.tag), [expected[2].tag]);
  }

  const ahead = evaluateSchemaCompatibility(expected, [...applied, { when: 1790100000000, hash: 'future-migration' }]);
  assert.equal(ahead.ok, true);
});

test('compiled compatibility loader resolves the journal independently of process.cwd()', () => {
  const originalCwd = process.cwd();
  const isolatedCwd = mkdtempSync(join(tmpdir(), 'lightweight-schema-'));
  try {
    process.chdir(isolatedCwd);
    const journal = readExpectedMigrationJournal();
    assert.equal(journal.length, 8);
    assert.equal(journal.at(-1)?.tag, '0007_historical_personal_records');
  } finally {
    process.chdir(originalCwd);
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test('missing Drizzle ledger is reported without exposing database internals', () => {
  assert.equal(schemaVerificationFailureReason('42P01'), 'migration_ledger_missing');
  assert.equal(schemaVerificationFailureReason('3F000'), 'migration_ledger_missing');
  assert.equal(schemaVerificationFailureReason('ECONNREFUSED'), 'database_unavailable');
});
