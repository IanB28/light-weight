import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { legacyMigrationHashCompatibility } from './schema-compatibility-manifest.mjs';
import { readExpectedMigrations } from './schema-compatibility-core.mjs';
import { evaluateSchemaCompatibility, requiredMigrations } from './verify-schema-compatibility.mjs';
import { shouldVerifyProductionSchema } from './vercel-build-policy.mjs';

const verifierPath = fileURLToPath(new URL('./verify-schema-compatibility.mjs', import.meta.url));

function runVerifier(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr }));
  });
}

const PRODUCTION_LEDGER_0000_TO_0008 = Object.freeze([
  ['1789279804495', 'f11126bd1ba7d5eb2d5cc3f939a489098969671073eb9d14f8d70565021a88ff'],
  ['1789415100420', 'bb5906bde1e8ebd5c9d9c396d1f3601b7c8f51a7db7c97d206dad6514c4c6863'],
  ['1789500000000', 'cbeff05f643ccbe03371cfb81bd73fe7e427aa4908238b0ad68a1b43088f46c4'],
  ['1789600000000', '52a9efbc04d77cd538e2c0eb3e1a65e19793c925ad7254ca17624e064ec2bd52'],
  ['1789700000000', '40670b6896b21cd8a673443fd026931644858496e93df70e333622fca7dd8def'],
  ['1789800000000', '25d259bb35ed746762dc991d1d2be78756a14ce0192e11228166067e2549fad9'],
  ['1789900000000', '46f2283b77e54f10855cd47ae14a652e267567156f43d318d162941d43342b6b'],
  ['1790000000000', 'd529ae8e196aad61922efcadc7f9a06b23cb9a46f3aec4eb7bf2aba3bf44ff11'],
  ['1790100000000', '255e2c1dd5edc6267b0228c4adf7d86ff0217e5a25450f22d2019cce92a71a9e'],
].map(([created_at, hash]) => ({ created_at, hash })));

const CANONICAL_0009_HASH = '13e8cd9434c1873fcf53768371d564cf11e13021ee7dfce302009bd3817183ff';
const CANONICAL_0010_HASH = '163e11921ccacd423c74d0cccb2aea555178602a1edfd4d949c9213bcb6cab72';
const CANONICAL_0011_HASH = 'b2fc7458fc943df1f249e38d7f1ec74a6dbe479cb77288a16f57e2af28926c54';
const CANONICAL_0012_HASH = '5d528718ef8982d0126e735c02856815240bf99eb91c38e6f6a96d004403a5d0';

const SYNTHETIC_LEDGER_0000_TO_0009 = Object.freeze([
  ...PRODUCTION_LEDGER_0000_TO_0008,
  { created_at: '1790200000000', hash: CANONICAL_0009_HASH }
]);
const SYNTHETIC_LEDGER_0000_TO_0010 = Object.freeze([
  ...SYNTHETIC_LEDGER_0000_TO_0009,
  { created_at: '1790300000000', hash: CANONICAL_0010_HASH }
]);
const SYNTHETIC_LEDGER_0000_TO_0011 = Object.freeze([
  ...SYNTHETIC_LEDGER_0000_TO_0010,
  { created_at: '1790400000000', hash: CANONICAL_0011_HASH }
]);
const SYNTHETIC_LEDGER_0000_TO_0012 = Object.freeze([
  ...SYNTHETIC_LEDGER_0000_TO_0011,
  { created_at: '1790500000000', hash: CANONICAL_0012_HASH }
]);

test('deployment verifier accepts canonical and explicitly approved historical 0002 hashes only', () => {
  const expected = requiredMigrations();
  const matching = expected.map(({ when, hash }) => ({ created_at: String(when), hash }));
  const legacy0002 = legacyMigrationHashCompatibility(1789500000000, '0002_auth_identities_v1');
  assert.ok(legacy0002);
  assert.equal(expected[2].hash, legacy0002.canonicalSourceHash);

  // Canonical Linux/Git source and synthetic 0000–0012 ledger pass.
  assert.equal(evaluateSchemaCompatibility(expected, matching).ok, true);
  assert.equal(evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0012).ok, true);

  // Current real production ledger (0000–0008) is missing all three feature migrations.
  const prodCheck = evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0008);
  assert.equal(prodCheck.ok, false);
  assert.deepEqual(prodCheck.missing.map((entry) => entry.tag), ['0009_routine_template_v2', '0010_legacy_routine_template_reconciliation', '0011_legacy_routine_share_template_compatibility', '0012_featured_pr_showcase_v1']);

  // A same-timestamp hash passes only when it is in the explicit manifest.
  const unknown0002 = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0012.map((entry) => (
    entry.created_at === '1789500000000' ? { ...entry, hash: 'not-an-approved-historical-hash' } : entry
  )));
  assert.equal(unknown0002.ok, false);
  assert.deepEqual(unknown0002.hashMismatches.map((entry) => entry.tag), ['0002_auth_identities_v1']);

  // Missing a middle migration names the exact tag.
  const behind = evaluateSchemaCompatibility(expected, matching.slice(0, 4));
  assert.equal(behind.ok, false);
  assert.deepEqual(behind.missing.map((entry) => entry.tag), expected.slice(4).map((entry) => entry.tag));
  const missingMiddle = evaluateSchemaCompatibility(expected, matching.filter((entry) => Number(entry.created_at) !== expected[2].when));
  assert.equal(missingMiddle.ok, false);
  assert.deepEqual(missingMiddle.missing.map((entry) => entry.tag), [expected[2].tag]);

  // Same timestamp with a different Drizzle hash is a distinct failure.
  const wrongHash = evaluateSchemaCompatibility(expected, matching.map((entry, index) => index === 4 ? { ...entry, hash: 'wrong' } : entry));
  assert.equal(wrongHash.ok, false);
  assert.deepEqual(wrongHash.hashMismatches.map((entry) => entry.tag), [expected[4].tag]);

  // A newer DB migration does not block an older compatible build.
  assert.equal(evaluateSchemaCompatibility(expected, [...matching, { created_at: '1790600000000', hash: 'future' }]).ok, true);
});

test('deployment verifier evaluates 0009: accepts synthetic ledger, reports real production as missing 0009, rejects unknown 0009 hash', () => {
  const expected = requiredMigrations().slice(0, 10);
  assert.equal(expected.length, 10);
  assert.equal(expected[9].tag, '0009_routine_template_v2');
  assert.equal(expected[9].hash, CANONICAL_0009_HASH);

  // A. Current production 0000–0008: missing exactly 0009
  const prodResult = evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0008);
  assert.equal(prodResult.ok, false);
  assert.deepEqual(prodResult.missing.map((e) => e.tag), ['0009_routine_template_v2']);

  // B. Synthetic 0000–0009: compatible
  const syntheticResult = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0009);
  assert.equal(syntheticResult.ok, true);

  // D. Unknown 0009 hash rejected
  const unknown0009 = evaluateSchemaCompatibility(expected, [
    ...PRODUCTION_LEDGER_0000_TO_0008,
    { created_at: '1790200000000', hash: 'unknown-hash-0009' }
  ]);
  assert.equal(unknown0009.ok, false);
  assert.deepEqual(unknown0009.hashMismatches.map((e) => e.tag), ['0009_routine_template_v2']);
});

test('0010 release gate: old 0000–0008 build accepts DB through 0010; new build rejects missing or wrong 0010', () => {
  const expected = requiredMigrations().slice(0, 11);
  assert.equal(expected.length, 11);
  assert.equal(expected[10].tag, '0010_legacy_routine_template_reconciliation');
  assert.equal(expected[10].hash, CANONICAL_0010_HASH);

  const oldBuild = expected.slice(0, 9);
  const oldAgainstNew = evaluateSchemaCompatibility(oldBuild, SYNTHETIC_LEDGER_0000_TO_0010);
  assert.equal(oldAgainstNew.ok, true);
  assert.deepEqual(oldAgainstNew.missing, []);
  assert.deepEqual(oldAgainstNew.hashMismatches, []);

  const missing0010 = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0009);
  assert.equal(missing0010.ok, false);
  assert.deepEqual(missing0010.missing.map((e) => e.tag), ['0010_legacy_routine_template_reconciliation']);
  assert.equal(evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0010).ok, true);

  const wrong0010 = evaluateSchemaCompatibility(expected, [
    ...SYNTHETIC_LEDGER_0000_TO_0009,
    { created_at: '1790300000000', hash: 'wrong-0010-hash' }
  ]);
  assert.equal(wrong0010.ok, false);
  assert.deepEqual(wrong0010.hashMismatches.map((e) => e.tag), ['0010_legacy_routine_template_reconciliation']);
});

test('0011 release gate: old 0000–0008 build accepts DB through 0011; new build rejects missing or wrong 0011', () => {
  const expected = requiredMigrations().slice(0, 12);
  assert.equal(expected.length, 12);
  assert.equal(expected[11].tag, '0011_legacy_routine_share_template_compatibility');
  assert.equal(expected[11].hash, CANONICAL_0011_HASH);

  const oldBuild = expected.slice(0, 9);
  const oldAgainstNew = evaluateSchemaCompatibility(oldBuild, SYNTHETIC_LEDGER_0000_TO_0011);
  assert.equal(oldAgainstNew.ok, true);
  assert.deepEqual(oldAgainstNew.missing, []);
  assert.deepEqual(oldAgainstNew.hashMismatches, []);

  const missing0010And0011 = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0009);
  assert.equal(missing0010And0011.ok, false);
  assert.deepEqual(missing0010And0011.missing.map((e) => e.tag), [
    '0010_legacy_routine_template_reconciliation',
    '0011_legacy_routine_share_template_compatibility'
  ]);

  const missing0011 = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0010);
  assert.equal(missing0011.ok, false);
  assert.deepEqual(missing0011.missing.map((e) => e.tag), ['0011_legacy_routine_share_template_compatibility']);
  assert.equal(evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0011).ok, true);

  const wrong0011 = evaluateSchemaCompatibility(expected, [
    ...SYNTHETIC_LEDGER_0000_TO_0010,
    { created_at: '1790400000000', hash: 'wrong-0011-hash' }
  ]);
  assert.equal(wrong0011.ok, false);
  assert.deepEqual(wrong0011.hashMismatches.map((e) => e.tag), ['0011_legacy_routine_share_template_compatibility']);
});

test('0012 release gate: old builds accept DB through 0012; new build rejects missing or wrong 0012', () => {
  const expected = requiredMigrations();
  assert.equal(expected.length, 13);
  assert.equal(expected[12].tag, '0012_featured_pr_showcase_v1');
  assert.equal(expected[12].hash, CANONICAL_0012_HASH);

  const oldBuild = expected.slice(0, 12);
  const oldAgainstNew = evaluateSchemaCompatibility(oldBuild, SYNTHETIC_LEDGER_0000_TO_0012);
  assert.equal(oldAgainstNew.ok, true);
  assert.deepEqual(oldAgainstNew.missing, []);

  const missing0012 = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0011);
  assert.equal(missing0012.ok, false);
  assert.deepEqual(missing0012.missing.map((entry) => entry.tag), ['0012_featured_pr_showcase_v1']);
  assert.equal(evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0012).ok, true);

  const wrong0012 = evaluateSchemaCompatibility(expected, [
    ...SYNTHETIC_LEDGER_0000_TO_0011,
    { created_at: '1790500000000', hash: 'wrong-0012-hash' }
  ]);
  assert.equal(wrong0012.ok, false);
  assert.deepEqual(wrong0012.hashMismatches.map((entry) => entry.tag), ['0012_featured_pr_showcase_v1']);
});

test('deployment verifier accepts canonical and CRLF hashes for 0007, rejecting unknown hashes', () => {
  const expected = requiredMigrations();
  const legacy0007 = legacyMigrationHashCompatibility(1790000000000, '0007_historical_personal_records');
  assert.ok(legacy0007);
  assert.equal(expected[7].hash, legacy0007.canonicalSourceHash);

  // Canonical LF hash accepted
  const canonicalRow = [{ created_at: '1790000000000', hash: '89800f68da2dcf6a91561cfecf66fbe0e8bd861a1af3e409d308eefd10495a3a' }];
  const canonicalCheck = evaluateSchemaCompatibility([expected[7]], canonicalRow);
  assert.equal(canonicalCheck.ok, true);

  // Known CRLF applied hash accepted
  const crlfRow = [{ created_at: '1790000000000', hash: 'd529ae8e196aad61922efcadc7f9a06b23cb9a46f3aec4eb7bf2aba3bf44ff11' }];
  const crlfCheck = evaluateSchemaCompatibility([expected[7]], crlfRow);
  assert.equal(crlfCheck.ok, true);

  // Unknown hash rejected
  const unknownRow = [{ created_at: '1790000000000', hash: 'unknown-hash-0007' }];
  const unknownCheck = evaluateSchemaCompatibility([expected[7]], unknownRow);
  assert.equal(unknownCheck.ok, false);
  assert.deepEqual(unknownCheck.hashMismatches.map((e) => e.tag), ['0007_historical_personal_records']);
});

test('deployment verifier accepts canonical and CRLF hashes for 0008, rejecting unknown hashes', () => {
  const expected = requiredMigrations();
  const legacy0008 = legacyMigrationHashCompatibility(1790100000000, '0008_hpr_reps_cap_constraint');
  assert.ok(legacy0008);
  assert.equal(expected[8].hash, legacy0008.canonicalSourceHash);

  // Canonical LF hash accepted
  const canonicalRow = [{ created_at: '1790100000000', hash: '60b429daaed9a50e09463e577f03b624ca74793dc30e095e3f4c997962398feb' }];
  const canonicalCheck = evaluateSchemaCompatibility([expected[8]], canonicalRow);
  assert.equal(canonicalCheck.ok, true);

  // Known CRLF applied hash accepted
  const crlfRow = [{ created_at: '1790100000000', hash: '255e2c1dd5edc6267b0228c4adf7d86ff0217e5a25450f22d2019cce92a71a9e' }];
  const crlfCheck = evaluateSchemaCompatibility([expected[8]], crlfRow);
  assert.equal(crlfCheck.ok, true);

  // Unknown hash rejected
  const unknownRow = [{ created_at: '1790100000000', hash: 'unknown-hash-0008' }];
  const unknownCheck = evaluateSchemaCompatibility([expected[8]], unknownRow);
  assert.equal(unknownCheck.ok, false);
  assert.deepEqual(unknownCheck.hashMismatches.map((e) => e.tag), ['0008_hpr_reps_cap_constraint']);
});

test('compatibility aliases never permit a modified local 0002 source file', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0002_auth_identities_v1.sql'), '-- modified migration source\n');
    assert.throws(
      () => readExpectedMigrations(sandbox, journalPath),
      /source integrity mismatch for 0002_auth_identities_v1/,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('compatibility aliases never permit a modified local 0007 source file', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0007_historical_personal_records.sql'), '-- modified migration source 0007\n');
    assert.throws(
      () => readExpectedMigrations(sandbox, journalPath),
      /source integrity mismatch for 0007_historical_personal_records/,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('compatibility aliases never permit a modified local 0008 source file', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0008_hpr_reps_cap_constraint.sql'), '-- modified migration source 0008\n');
    assert.throws(
      () => readExpectedMigrations(sandbox, journalPath),
      /source integrity mismatch for 0008_hpr_reps_cap_constraint/,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('production simulation: canonical Linux/Vercel LF source is compatible with synthetic ledger and reports real production missing 0009–0012', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-vercel-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    const { readdir, readFile } = await import('node:fs/promises');
    const files = await readdir(sandbox);
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const content = await readFile(join(sandbox, file), 'utf8');
        await writeFile(join(sandbox, file), content.replace(/\r\n/g, '\n'), 'utf8');
      }
    }

    const expected = readExpectedMigrations(sandbox, journalPath);
    assert.equal(expected.length, 13);

    const prodResult = evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0008);
    assert.equal(prodResult.ok, false);
    assert.deepEqual(prodResult.missing.map((e) => e.tag), ['0009_routine_template_v2', '0010_legacy_routine_template_reconciliation', '0011_legacy_routine_share_template_compatibility', '0012_featured_pr_showcase_v1']);

    const syntheticResult = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(syntheticResult.ok, true, 'Canonical LF source on Vercel must be compatible with synthetic ledger');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('cross-platform checkout: Windows CRLF source passes source integrity and is compatible with synthetic ledger', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-win-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    const { readFile } = await import('node:fs/promises');
    for (const tag of ['0007_historical_personal_records', '0008_hpr_reps_cap_constraint']) {
      const content = await readFile(join(sandbox, `${tag}.sql`), 'utf8');
      await writeFile(join(sandbox, `${tag}.sql`), content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
    }

    const expected = readExpectedMigrations(sandbox, journalPath);
    assert.equal(expected.length, 13);

    const prodResult = evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0008);
    assert.equal(prodResult.ok, false);
    assert.deepEqual(prodResult.missing.map((e) => e.tag), ['0009_routine_template_v2', '0010_legacy_routine_template_reconciliation', '0011_legacy_routine_share_template_compatibility', '0012_featured_pr_showcase_v1']);

    const syntheticResult = evaluateSchemaCompatibility(expected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(syntheticResult.ok, true, 'Windows CRLF checkout must be compatible with synthetic ledger');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('local 0009 modification changes expected hash and fails compatibility with synthetic ledger', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-0009-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0009_routine_template_v2.sql'), '-- modified 0009 SQL\n');
    const modifiedExpected = readExpectedMigrations(sandbox, journalPath);
    assert.notEqual(modifiedExpected[9].hash, CANONICAL_0009_HASH);
    const check = evaluateSchemaCompatibility(modifiedExpected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(check.ok, false);
    assert.deepEqual(check.hashMismatches.map((e) => e.tag), ['0009_routine_template_v2']);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('local 0010 modification changes expected hash and fails compatibility without an alias', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-0010-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0010_legacy_routine_template_reconciliation.sql'), '-- modified 0010 SQL\n');
    const modifiedExpected = readExpectedMigrations(sandbox, journalPath);
    assert.notEqual(modifiedExpected[10].hash, CANONICAL_0010_HASH);
    const check = evaluateSchemaCompatibility(modifiedExpected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(check.ok, false);
    assert.deepEqual(check.hashMismatches.map((e) => e.tag), ['0010_legacy_routine_template_reconciliation']);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('local 0011 modification changes expected hash and fails compatibility without an alias', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-0011-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0011_legacy_routine_share_template_compatibility.sql'), '-- modified 0011 SQL\n');
    const modifiedExpected = readExpectedMigrations(sandbox, journalPath);
    assert.notEqual(modifiedExpected[11].hash, CANONICAL_0011_HASH);
    const check = evaluateSchemaCompatibility(modifiedExpected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(check.ok, false);
    assert.deepEqual(check.hashMismatches.map((e) => e.tag), ['0011_legacy_routine_share_template_compatibility']);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('local 0012 modification changes expected hash and fails compatibility without an alias', async () => {
  const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
  const sandbox = await mkdtemp(join(tmpdir(), 'lightweight-schema-0012-'));
  try {
    await cp(migrationsFolder, sandbox, { recursive: true });
    await writeFile(join(sandbox, '0012_featured_pr_showcase_v1.sql'), '-- modified 0012 SQL\n');
    const modifiedExpected = readExpectedMigrations(sandbox, journalPath);
    assert.notEqual(modifiedExpected[12].hash, CANONICAL_0012_HASH);
    const check = evaluateSchemaCompatibility(modifiedExpected, SYNTHETIC_LEDGER_0000_TO_0012);
    assert.equal(check.ok, false);
    assert.deepEqual(check.hashMismatches.map((entry) => entry.tag), ['0012_featured_pr_showcase_v1']);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('production verifier fails clearly without a DATABASE_URL in an isolated child process', async () => {
  const env = { ...process.env, VERCEL_ENV: 'production' };
  delete env.DATABASE_URL;
  const result = await runVerifier(env);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /DATABASE_URL is required/);
});

test('preview and local builds do not invoke the production schema gate', () => {
  assert.equal(shouldVerifyProductionSchema({ VERCEL_ENV: 'preview' }), false);
  assert.equal(shouldVerifyProductionSchema({}), false);
  assert.equal(shouldVerifyProductionSchema({ VERCEL_ENV: 'production' }), true);
});
