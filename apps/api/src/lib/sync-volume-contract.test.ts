import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('J: sync pull does not expose the legacy raw total_volume_kg cache as canonical volume', () => {
  const route = readFileSync(resolve(process.cwd(), 'src/routes/sync.ts'), 'utf8');
  const pull = route.slice(route.indexOf("syncRouter.get('/pull'"));
  assert.ok(pull.length > 0);
  assert.match(pull, /history: historyWithSets/);
  assert.doesNotMatch(pull, /totalVolumeKg|total_volume_kg/);

  const writer = route.slice(route.indexOf('for (const session of sessions)'), route.indexOf('syncedSessionIds.push(sessionUuid)'));
  assert.match(writer, /Legacy cache only/);
  assert.match(writer, /totalVolumeKg: String\(totalVolume\)/);
});
