import assert from 'node:assert/strict';
import test from 'node:test';
import { createShareAction } from './routine-share-action.js';

test('sharing waits for successful cloud sync before posting one snapshot with the selected IDs', async () => {
  const events: string[] = [];
  const action = createShareAction(
    async () => { events.push('sync'); return { ok: true, data: { syncedCount: 0 } }; },
    async (routineId, recipientId) => { events.push(`share:${routineId}:${recipientId}`); return {}; }
  );
  assert.deepEqual(await action('routine-1', 'friend-1'), { kind: 'sent' });
  assert.deepEqual(events, ['sync', 'share:routine-1:friend-1']);
});

test('failed sync blocks the share POST and returns a retryable localized error code', async () => {
  let sends = 0;
  const action = createShareAction(
    async () => ({ ok: false, error: { code: 'network', retryable: true } }),
    async () => { sends++; return {}; }
  );
  assert.deepEqual(await action('routine-1', 'friend-1'), {
    kind: 'error', error: { code: 'network', retryable: true }
  });
  assert.equal(sends, 0);
});

test('concurrent double click cannot send two snapshots', async () => {
  let resolveSync!: (value: { ok: true; data: { syncedCount: number } }) => void;
  let sends = 0;
  const action = createShareAction(
    () => new Promise((resolve) => { resolveSync = resolve; }),
    async () => { sends++; return {}; }
  );
  const first = action('routine-1', 'friend-1');
  assert.deepEqual(await action('routine-1', 'friend-1'), { kind: 'busy' });
  resolveSync({ ok: true, data: { syncedCount: 0 } });
  assert.deepEqual(await first, { kind: 'sent' });
  assert.equal(sends, 1);
});

test('share endpoint failure remains retryable after the single-flight lock releases', async () => {
  let sends = 0;
  const action = createShareAction(
    async () => ({ ok: true, data: { syncedCount: 0 } }),
    async () => { sends++; if (sends === 1) throw new Error('network'); return {}; }
  );
  assert.equal((await action('routine-1', 'friend-1')).kind, 'error');
  assert.deepEqual(await action('routine-1', 'friend-1'), { kind: 'sent' });
  assert.equal(sends, 2);
});
