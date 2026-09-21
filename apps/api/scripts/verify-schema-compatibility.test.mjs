import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
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

test('deployment verifier uses exact Drizzle timestamp/hash pairs and permits DBs ahead', () => {
  const expected = requiredMigrations();
  const matching = expected.map(({ when, hash }) => ({ created_at: String(when), hash }));

  // A: local 0000–0006 and the same remote ledger pass.
  assert.equal(evaluateSchemaCompatibility(expected, matching).ok, true);

  // B: behind and C: missing a middle migration name the exact tag.
  const behind = evaluateSchemaCompatibility(expected, matching.slice(0, 4));
  assert.equal(behind.ok, false);
  assert.deepEqual(behind.missing.map((entry) => entry.tag), expected.slice(4).map((entry) => entry.tag));
  const missingMiddle = evaluateSchemaCompatibility(expected, matching.filter((entry) => Number(entry.created_at) !== expected[2].when));
  assert.equal(missingMiddle.ok, false);
  assert.deepEqual(missingMiddle.missing.map((entry) => entry.tag), [expected[2].tag]);

  // D: same timestamp with a different Drizzle hash is a distinct failure.
  const wrongHash = evaluateSchemaCompatibility(expected, matching.map((entry, index) => index === 4 ? { ...entry, hash: 'wrong' } : entry));
  assert.equal(wrongHash.ok, false);
  assert.deepEqual(wrongHash.hashMismatches.map((entry) => entry.tag), [expected[4].tag]);

  // E: a newer DB migration does not block an older compatible build.
  assert.equal(evaluateSchemaCompatibility(expected, [...matching, { created_at: '1790000000000', hash: 'future' }]).ok, true);
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
