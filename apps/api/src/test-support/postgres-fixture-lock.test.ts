import assert from 'node:assert/strict';
import test from 'node:test';
import type postgres from 'postgres';
import { lockPostgresFixture, withSharedPostgresFixture } from './postgres-fixture-lock.js';

function harness(lockError?: Error) {
  const events: string[] = [];
  const tx = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    assert.equal(values.length, 0);
    events.push(strings.join(''));
    if (lockError) throw lockError;
    return [];
  }) as unknown as postgres.TransactionSql;
  const sql = {
    begin: async (run: (transaction: postgres.TransactionSql) => Promise<void>) => {
      events.push('begin');
      try { await run(tx); events.push('commit'); }
      catch (error) { events.push('rollback'); throw error; }
    }
  } as unknown as postgres.Sql;
  return { tx, sql, events };
}

test('DDL fixture lock defaults to the documented exclusive transaction key', async () => {
  const { tx, events } = harness();
  await lockPostgresFixture(tx);
  assert.deepEqual(events, ['SELECT pg_advisory_xact_lock(198, 31)']);
});

test('DML fixture lock uses shared transaction mode on the same key', async () => {
  const { tx, events } = harness();
  await lockPostgresFixture(tx, 'shared');
  assert.deepEqual(events, ['SELECT pg_advisory_xact_lock_shared(198, 31)']);
});

test('multi-connection fixture lease precedes work and lasts through cleanup', async () => {
  const { sql, events } = harness();
  await withSharedPostgresFixture(sql, async () => {
    events.push('setup', 'concurrent HTTP work', 'cleanup');
  });
  assert.deepEqual(events, ['begin', 'SELECT pg_advisory_xact_lock_shared(198, 31)',
    'setup', 'concurrent HTTP work', 'cleanup', 'commit']);
});

test('fixture failure propagates after cleanup and rolls back the lease', async () => {
  const { sql, events } = harness();
  const failure = new Error('fixture failure');
  await assert.rejects(withSharedPostgresFixture(sql, async () => {
    try { events.push('work'); throw failure; }
    finally { events.push('cleanup'); }
  }), (error) => error === failure);
  assert.deepEqual(events, ['begin', 'SELECT pg_advisory_xact_lock_shared(198, 31)',
    'work', 'cleanup', 'rollback']);
});

test('failed lease acquisition prevents fixture operations and propagates', async () => {
  const failure = new Error('lock failure');
  const { sql, events } = harness(failure);
  await assert.rejects(withSharedPostgresFixture(sql, async () => {
    assert.fail('fixture work must not start without its lease');
  }), (error) => error === failure);
  assert.deepEqual(events, ['begin', 'SELECT pg_advisory_xact_lock_shared(198, 31)', 'rollback']);
});
