import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServer } from '../src/server.ts';
import { LocalAuthService } from '../src/auth-service.ts';

async function make() {
  const auth = new LocalAuthService();
  const app = buildServer({ auth, allowedOrigins: ['http://localhost:3000'] });
  await app.ready();
  return { app, auth };
}

test('all protected routes deny requests without a session', async (t) => {
  const { app } = await make();
  t.after(() => app.close());
  for (const request of [
    { method: 'GET', url: '/v1/me' },
    { method: 'GET', url: '/v1/me/sessions' },
    { method: 'DELETE', url: '/v1/me/sessions/abc', headers: { origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' } },
    { method: 'POST', url: '/v1/me/sessions/revoke-all', headers: { origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' } },
    { method: 'POST', url: '/v1/auth/logout', headers: { origin: 'http://localhost:3000', 'x-requested-with': 'eoh-web' } },
  ]) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 401, request.url);
    assert.equal(response.json().code, 'unauthenticated');
  }
});

test('fake email OTP sign-in issues a session and serves /v1/me', async (t) => {
  const { app, auth } = await make();
  t.after(() => app.close());
  const challenge = await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email: 'sipho@example.invalid', uiLanguage: 'xh' } });
  assert.equal(challenge.statusCode, 202);
  assert.equal(challenge.json().expiresInSeconds, 600);
  const verify = await app.inject({ method: 'POST', url: '/v1/auth/challenges/verify', payload: { email: 'sipho@example.invalid', otp: auth.delivered.get('sipho@example.invalid') } });
  assert.equal(verify.statusCode, 200);
  const cookie = verify.headers['set-cookie'];
  assert.ok(cookie?.startsWith('eoh_session='));
  const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().email, 'sipho@example.invalid');
  const sessions = await app.inject({ method: 'GET', url: '/v1/me/sessions', headers: { cookie } });
  assert.equal(sessions.statusCode, 200);
  assert.equal(sessions.json().data.length, 1);
});

test('state-changing session routes require origin and requested-with CSRF headers', async (t) => {
  const { app, auth } = await make();
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email: 'csrf@example.invalid' } });
  const verify = await app.inject({ method: 'POST', url: '/v1/auth/challenges/verify', payload: { email: 'csrf@example.invalid', otp: auth.delivered.get('csrf@example.invalid') } });
  const cookie = verify.headers['set-cookie'];
  const response = await app.inject({ method: 'POST', url: '/v1/me/sessions/revoke-all', headers: { cookie } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'forbidden');
});

test('challenge input uses the contract validation error shape', async (t) => {
  const { app } = await make();
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/v1/auth/challenges', payload: { email: 'not-an-email', uiLanguage: 'xh' } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'validation_failed');
  assert.ok(Array.isArray(response.json().errors));
});
