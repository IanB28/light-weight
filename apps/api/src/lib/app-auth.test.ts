import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('/auth/me and logout reject anonymous requests without querying a client userId', async () => {
  await withServer(async (baseUrl) => {
    const me = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(me.status, 401);
    assert.deepEqual(await me.json(), { error: 'AUTH_REQUIRED' });
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(logout.status, 401);
  });
});

test('/api/health is a minimal unauthenticated serverless health response', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('nested auth routes accept the production web origin with credentialed CORS', async () => {
  const previousOrigins = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'https://uselightweight.me';
  try {
    await withServer(async (baseUrl) => {
      const preflight = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://uselightweight.me',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type'
        }
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://uselightweight.me');
      assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

      const register = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { origin: 'https://uselightweight.me', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Ian', username: 'x', email: 'bad', password: 'weak' })
      });
      assert.equal(register.status, 422);
      assert.equal(register.headers.get('access-control-allow-origin'), 'https://uselightweight.me');
    });
  } finally {
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  }
});

test('register rejects malformed identity before persistence', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ian', username: 'x', email: 'bad', password: 'weak' })
    });
    assert.equal(response.status, 422);
    assert.equal(typeof (await response.json() as { error?: unknown }).error, 'string');
  });
});
