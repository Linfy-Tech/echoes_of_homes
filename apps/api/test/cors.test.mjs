import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServer } from '../src/server.ts';

test('CORS allows configured origins and omits headers for other origins', async (t) => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000, https://echoes-of-home-web.vercel.app';
  const app = buildServer();
  await app.ready();
  t.after(async () => {
    await app.close();
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  });

  const allowed = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'https://echoes-of-home-web.vercel.app' } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://echoes-of-home-web.vercel.app');
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

  const denied = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'https://not-allowed.example' } });
  assert.equal(denied.statusCode, 200);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
