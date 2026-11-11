import assert from 'node:assert/strict';
import test from 'node:test';
import { isProtectedPathname, safeReturnPath, viewerForSession } from '../lib/session.ts';

test('only app routes are protected by the web session gate', () => {
  for (const pathname of ['/families', '/consent/a-story', '/record', '/transcription', '/review', '/translation', '/story', '/profile', '/sessions']) assert.equal(isProtectedPathname(pathname), true, pathname);
  for (const pathname of ['/', '/sign-in', '/verify', '/intro', '/v1/me', '/healthz']) assert.equal(isProtectedPathname(pathname), false, pathname);
});

test('the server gate accepts only a valid API session response', async () => {
  const viewer = await viewerForSession('opaque-session', async (_input, init) => {
    assert.equal(init.headers.cookie, 'eoh_session=opaque-session');
    return new Response(JSON.stringify({ id: 'user-1', email: 'person@example.com' }), { status: 200 });
  });
  assert.deepEqual(viewer, { id: 'user-1', email: 'person@example.com' });

  const rejected = await viewerForSession('expired-session', async () => new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 }));
  assert.equal(rejected, null);
});

test('post-sign-in return paths never leave the web origin', () => {
  const origin = 'https://echoes-of-home-web.vercel.app';
  assert.equal(safeReturnPath('/profile?tab=sessions', origin), '/profile?tab=sessions');
  for (const value of ['https://attacker.example', '//attacker.example', '/\\attacker.example', 'javascript:alert(1)']) assert.equal(safeReturnPath(value, origin), null, value);
});
