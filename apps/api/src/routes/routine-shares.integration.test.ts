import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { withSharedPostgresFixture } from '../test-support/postgres-fixture-lock.js';
import { createApp } from '../app.js';
import { hashOpaqueToken } from '../lib/auth-session.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

const connectionString = process.env.DATABASE_URL;

test('HTTP routine sharing uses immutable, private snapshots and recipient-owned idempotent imports', async (t) => {
  if (!connectionString) { t.skip('DATABASE_URL is not configured'); return; }
  const sql = postgres(connectionString, { max: 5, ssl: 'require' });
  try {
    await withSharedPostgresFixture(sql, () => runRoutineSharing(t, sql));
  } finally {
    await sql.end();
  }
});

async function runRoutineSharing(t: TestContext, sql: postgres.Sql) {
  const ids = { sender: randomUUID(), recipient: randomUUID(), pending: randomUUID(), outsider: randomUUID(), source: randomUUID() };
  const exerciseA = `v1d-public-a-${randomUUID()}`;
  const exerciseB = `v1d-public-b-${randomUUID()}`;
  const custom = `v1d-custom-${randomUUID()}`;
  const privateExercise = `v1d-private-${randomUUID()}`;
  const unknown = `v1d-unknown-${randomUUID()}`;
  const runId = randomUUID().slice(0, 8);
  const tokens = new Map<string, { token: string; csrf: string }>(Object.entries(ids).filter(([key]) => key !== 'source').map(([key, id]) => [id, {
    token: `v1d-${runId}-${key}`, csrf: `v1d-${runId}-${key}-csrf`
  }]));
  const template = { version: 2, exercises: [
    { exerciseId: exerciseB, sets: [{ setType: 'warmup', targetWeightKg: 0 }, { setType: 'working', targetWeightKg: 42.5 }] },
    { exerciseId: exerciseA, sets: [{ setType: 'drop', targetWeightKg: 17.25 }, { setType: 'backoff', targetWeightKg: 12 }] }
  ] };
  const headers = (id?: string) => {
    const auth = id ? tokens.get(id) : undefined;
    return {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      ...(auth ? { cookie: `lw_session=${auth.token}; lw_csrf=${auth.csrf}`, 'x-csrf-token': auth.csrf } : {})
    };
  };
  const pair = (left: string, right: string) => left.localeCompare(right) < 0 ? [left, right] : [right, left];
  const previousOrigins = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'http://localhost:3000';
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, method = 'GET', actor?: string, body?: object) => fetch(`${base}${path}`, {
    method, headers: headers(actor), ...(body ? { body: JSON.stringify(body) } : {})
  });
  const share = (actor: string, routineId: string, recipientId: string) =>
    call('/api/routine-shares', 'POST', actor, { routineId, recipientId });
  try {
    await sql`
      INSERT INTO users (id, email, username, display_name, birth_date, gender)
      VALUES
        (${ids.sender}, ${`v1d-${runId}-sender@example.test`}, ${`v1d_${runId}_sender`}, 'Sender', '1990-01-01', 'male'),
        (${ids.recipient}, ${`v1d-${runId}-recipient@example.test`}, ${`v1d_${runId}_recipient`}, 'Recipient', '1991-01-01', 'female'),
        (${ids.pending}, ${`v1d-${runId}-pending@example.test`}, ${`v1d_${runId}_pending`}, 'Pending', '1992-01-01', 'male'),
        (${ids.outsider}, ${`v1d-${runId}-outsider@example.test`}, ${`v1d_${runId}_outsider`}, 'Outsider', '1993-01-01', 'female')
    `;
    for (const [id, auth] of tokens) await sql`
      INSERT INTO auth_sessions (user_id, token_hash, csrf_token_hash, expires_at)
      VALUES (${id}, ${hashOpaqueToken(auth.token)}, ${hashOpaqueToken(auth.csrf)}, now() + interval '1 day')
    `;
    await sql`
      INSERT INTO exercises (id, user_id, name, primary_muscle, category, is_custom)
      VALUES
        (${exerciseA}, NULL, 'Public A', 'chest', 'barbell', false),
        (${exerciseB}, NULL, 'Public B', 'back', 'barbell', false),
        (${custom}, ${ids.sender}, 'Custom private', 'chest', 'other', true),
        (${privateExercise}, ${ids.sender}, 'Private noncustom', 'chest', 'other', false)
    `;
    await sql`INSERT INTO routines (id, user_id, name, description, exercise_ids, exercise_template)
      VALUES (${ids.source}, ${ids.sender}, 'Snapshot Push', 'Original note', ${sql.json([exerciseB, exerciseA])}, ${sql.json(template)})`;
    const [acceptedA, acceptedB] = pair(ids.sender, ids.recipient);
    const [pendingA, pendingB] = pair(ids.sender, ids.pending);
    await sql`INSERT INTO friendships (user_a_id, user_b_id, requester_id, status)
      VALUES (${acceptedA}, ${acceptedB}, ${ids.sender}, 'accepted'), (${pendingA}, ${pendingB}, ${ids.sender}, 'pending')`;

    await t.test('authentication, ownership, friendship and ID guards', async () => {
      assert.equal((await call('/api/routine-shares/received')).status, 401);
      assert.equal((await call('/api/routine-shares', 'POST', undefined, { routineId: ids.source, recipientId: ids.recipient })).status, 401);
      assert.equal((await share(ids.sender, '', ids.recipient)).status, 422);
      assert.equal((await share(ids.sender, ids.source, 'bad-id')).status, 422);
      const stolen = await share(ids.recipient, ids.source, ids.sender);
      assert.equal(stolen.status, 404);
      assert.equal((await stolen.json() as { error: string }).error, 'ROUTINE_NOT_OWNED');
      assert.equal((await share(ids.sender, ids.source, ids.sender)).status, 409);
      for (const recipientId of [ids.pending, ids.outsider]) {
        const response = await share(ids.sender, ids.source, recipientId);
        assert.equal(response.status, 403);
        assert.equal((await response.json() as { error: string }).error, 'NOT_FRIENDS');
      }
    });

    await t.test('custom, private, unknown and mixed exercise routines fail atomically', async () => {
      for (const exerciseIds of [[custom], [privateExercise], [unknown], [exerciseA, custom]]) {
        const id = randomUUID();
        await sql`INSERT INTO routines (id, user_id, name, exercise_ids) VALUES (${id}, ${ids.sender}, 'Unsafe', ${sql.json(exerciseIds)})`;
        const response = await share(ids.sender, id, ids.recipient);
        assert.equal(response.status, 422);
        assert.equal((await response.json() as { error: string }).error, 'ROUTINE_HAS_CUSTOM_EXERCISES');
        assert.equal((await sql`SELECT id FROM routine_shares WHERE source_routine_id = ${id}`).length, 0);
      }
    });

    const first = await share(ids.sender, ids.source, ids.recipient);
    assert.equal(first.status, 201);
    const firstShare = (await first.json() as { share: { id: string } }).share;
    const duplicate = await share(ids.sender, ids.source, ids.recipient);
    assert.equal(duplicate.status, 201);
    const duplicateShare = (await duplicate.json() as { share: { id: string } }).share;
    assert.notEqual(firstShare.id, duplicateShare.id);

    await t.test('received snapshot retains order, V2 sets and weights after sender edit', async () => {
      await sql`UPDATE routines SET name = 'Edited later', description = 'Changed', exercise_ids = ${sql.json([exerciseA])},
        exercise_template = ${sql.json({ version: 2, exercises: [{ exerciseId: exerciseA, sets: [{ setType: 'working', targetWeightKg: 99 }] }] })}
        WHERE id = ${ids.source}`;
      const inbox = await call('/api/routine-shares/received', 'GET', ids.recipient);
      assert.equal(inbox.status, 200);
      const received = (await inbox.json() as { shares: Array<Record<string, unknown>> }).shares;
      const snapshot = received.find((item) => item.id === firstShare.id)!;
      assert.equal(snapshot.routineName, 'Snapshot Push');
      assert.equal(snapshot.routineDescription, 'Original note');
      assert.deepEqual(snapshot.exerciseIds, [exerciseB, exerciseA]);
      assert.deepEqual(snapshot.template, template);
      assert.equal(snapshot.status, 'pending');
      assert.deepEqual(Object.keys(snapshot.sender as object).sort(), ['displayName', 'id', 'username']);
      assert.equal(JSON.stringify(snapshot).includes('example.test'), false);
      assert.equal((await call('/api/routine-shares/received', 'GET', ids.outsider).then((res) => res.json()) as { shares: unknown[] }).shares.length, 0);
    });

    await t.test('recipient import uses snapshot, returns same clone on retry and retains provenance through sync', async () => {
      assert.equal((await call(`/api/routine-shares/${firstShare.id}/import`, 'POST', ids.outsider)).status, 404);
      assert.equal((await call(`/api/routine-shares/${firstShare.id}/import`, 'POST', ids.sender)).status, 404);
      const imported = await call(`/api/routine-shares/${firstShare.id}/import`, 'POST', ids.recipient);
      assert.equal(imported.status, 201);
      const clone = (await imported.json() as { routine: Record<string, unknown> }).routine;
      assert.notEqual(clone.id, ids.source);
      assert.equal(clone.userId, ids.recipient);
      assert.equal(clone.name, 'Snapshot Push');
      assert.equal(clone.description, 'Original note');
      assert.deepEqual(clone.exerciseIds, [exerciseB, exerciseA]);
      assert.deepEqual(clone.exerciseTemplate, template);
      assert.deepEqual(clone.origin, { type: 'shared', sharedBy: {
        id: ids.sender, username: `v1d_${runId}_sender`, displayName: 'Sender'
      }, shareId: firstShare.id });
      const retry = await call(`/api/routine-shares/${firstShare.id}/import`, 'POST', ids.recipient);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json() as { routine: { id: string } }).routine.id, clone.id);
      assert.equal((await sql`SELECT id FROM routines WHERE user_id = ${ids.recipient} AND id = ${clone.id as string}`).length, 1);
      assert.equal((await call(`/api/routine-shares/${firstShare.id}`, 'DELETE', ids.recipient)).status, 404);

      const sync = await call('/api/sync', 'POST', ids.recipient, { routines: [{
        id: clone.id, name: 'Recipient edit', exerciseIds: [exerciseB, exerciseA], template
      }] });
      assert.equal(sync.status, 200);
      const pull = await call('/api/sync/pull', 'GET', ids.recipient);
      assert.equal(pull.status, 200);
      const pulled = (await pull.json() as { routines: Array<Record<string, unknown>> }).routines.find((item) => item.id === clone.id)!;
      assert.equal(pulled.name, 'Recipient edit');
      assert.equal(pulled.userId, ids.recipient);
      assert.deepEqual(pulled.origin, clone.origin);
      assert.deepEqual(pulled.template, template);
      assert.deepEqual(pulled.exerciseIds, [exerciseB, exerciseA]);

      const forwarded = await share(ids.recipient, clone.id as string, ids.sender);
      assert.equal(forwarded.status, 201);
      const forwardId = (await forwarded.json() as { share: { id: string } }).share.id;
      const forwardedImport = await call(`/api/routine-shares/${forwardId}/import`, 'POST', ids.sender);
      assert.equal(forwardedImport.status, 201);
      const forwardedClone = (await forwardedImport.json() as { routine: { origin: { sharedBy: { id: string }; shareId: string } } }).routine;
      assert.equal(forwardedClone.origin.sharedBy.id, ids.recipient);
      assert.equal(forwardedClone.origin.shareId, forwardId);
    });

    await t.test('dismiss is recipient-only, removes pending and blocks import', async () => {
      assert.equal((await call(`/api/routine-shares/${duplicateShare.id}`, 'DELETE', ids.outsider)).status, 404);
      assert.equal((await call(`/api/routine-shares/${duplicateShare.id}`, 'DELETE', ids.recipient)).status, 204);
      assert.equal((await call(`/api/routine-shares/${duplicateShare.id}`, 'DELETE', ids.recipient)).status, 404);
      const inbox = (await (await call('/api/routine-shares/received', 'GET', ids.recipient)).json() as { shares: Array<{ id: string }> }).shares;
      assert.equal(inbox.some((item) => item.id === duplicateShare.id), false);
      assert.equal((await call(`/api/routine-shares/${duplicateShare.id}/import`, 'POST', ids.recipient)).status, 409);
      assert.equal((await sql`SELECT imported_routine_id FROM routine_shares WHERE id = ${duplicateShare.id}`)[0].imported_routine_id, null);
    });

    await t.test('deleting source and removing friendship do not revoke a delivered snapshot', async () => {
      const pendingShare = await share(ids.sender, ids.source, ids.recipient);
      assert.equal(pendingShare.status, 201);
      const pendingId = (await pendingShare.json() as { share: { id: string } }).share.id;
      await sql`DELETE FROM routines WHERE id = ${ids.source}`;
      await sql`DELETE FROM friendships WHERE user_a_id = ${acceptedA} AND user_b_id = ${acceptedB}`;
      const inbox = (await (await call('/api/routine-shares/received', 'GET', ids.recipient)).json() as { shares: Array<{ id: string; sourceRoutineId?: string }> }).shares;
      assert.equal(inbox.find((item) => item.id === pendingId)?.sourceRoutineId, undefined);
      const imported = await call(`/api/routine-shares/${pendingId}/import`, 'POST', ids.recipient);
      assert.equal(imported.status, 201);
      const clone = (await imported.json() as { routine: { name: string; exerciseTemplate: unknown } }).routine;
      assert.equal(clone.name, 'Edited later');
      assert.deepEqual(clone.exerciseTemplate, { version: 2, exercises: [{ exerciseId: exerciseA, sets: [{ setType: 'working', targetWeightKg: 99 }] }] });
    });

    await t.test('two concurrent imports produce one clone', async () => {
      const [a, b] = pair(ids.sender, ids.recipient);
      await sql`INSERT INTO friendships (user_a_id, user_b_id, requester_id, status)
        VALUES (${a}, ${b}, ${ids.sender}, 'accepted')`;
      const cloneSource = randomUUID();
      await sql`INSERT INTO routines (id, user_id, name, exercise_ids, exercise_template)
        VALUES (${cloneSource}, ${ids.sender}, 'Concurrent', ${sql.json([exerciseA])}, ${sql.json({ version: 2, exercises: [{ exerciseId: exerciseA, sets: [{ setType: 'working', targetWeightKg: 33 }] }] })})`;
      const sent = await share(ids.sender, cloneSource, ids.recipient);
      assert.equal(sent.status, 201);
      const shareId = (await sent.json() as { share: { id: string } }).share.id;
      const responses = await Promise.all([
        call(`/api/routine-shares/${shareId}/import`, 'POST', ids.recipient),
        call(`/api/routine-shares/${shareId}/import`, 'POST', ids.recipient)
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
      const cloneIds = await Promise.all(responses.map(async (response) => (await response.json() as { routine: { id: string } }).routine.id));
      assert.equal(cloneIds[0], cloneIds[1]);
      assert.equal((await sql`SELECT id FROM routines WHERE id = ${cloneIds[0]}`).length, 1);
    });
  } finally {
    await sql`DELETE FROM users WHERE id IN (${ids.sender}, ${ids.recipient}, ${ids.pending}, ${ids.outsider})`;
    await sql`DELETE FROM exercises WHERE id IN (${exerciseA}, ${exerciseB}, ${custom}, ${privateExercise})`;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  }
}
