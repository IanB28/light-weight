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

const PRODUCTION_LEDGER_0000_TO_0006 = Object.freeze([
  ['1789279804495', 'f11126bd1ba7d5eb2d5cc3f939a489098969671073eb9d14f8d70565021a88ff'],
  ['1789415100420', 'bb5906bde1e8ebd5c9d9c396d1f3601b7c8f51a7db7c97d206dad6514c4c6863'],
  ['1789500000000', 'cbeff05f643ccbe03371cfb81bd73fe7e427aa4908238b0ad68a1b43088f46c4'],
  ['1789600000000', '52a9efbc04d77cd538e2c0eb3e1a65e19793c925ad7254ca17624e064ec2bd52'],
  ['1789700000000', '40670b6896b21cd8a673443fd026931644858496e93df70e333622fca7dd8def'],
  ['1789800000000', '25d259bb35ed746762dc991d1d2be78756a14ce0192e11228166067e2549fad9'],
  ['1789900000000', '46f2283b77e54f10855cd47ae14a652e267567156f43d318d162941d43342b6b'],
].map(([created_at, hash]) => ({ created_at, hash })));

test('deployment verifier accepts canonical and explicitly approved historical 0002 hashes only', () => {
  const expected = requiredMigrations();
  const matching = expected.map(({ when, hash }) => ({ created_at: String(when), hash }));
  const legacy0002 = legacyMigrationHashCompatibility(1789500000000, '0002_auth_identities_v1');
  assert.ok(legacy0002);
  assert.equal(expected[2].hash, legacy0002.canonicalSourceHash);

  // Canonical Linux/Git source and the actual production 0000–0006 ledger pass.
  assert.equal(evaluateSchemaCompatibility(expected, matching).ok, true);
  assert.equal(evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0006).ok, true);

  // A same-timestamp hash passes only when it is in the explicit manifest.
  const unknown0002 = evaluateSchemaCompatibility(expected, PRODUCTION_LEDGER_0000_TO_0006.map((entry) => (
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
  assert.equal(evaluateSchemaCompatibility(expected, [...matching, { created_at: '1790000000000', hash: 'future' }]).ok, true);
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
