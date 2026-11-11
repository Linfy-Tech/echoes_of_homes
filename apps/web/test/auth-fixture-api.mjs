import { createServer } from 'node:http';

const port = Number(process.env.EOH_AUTH_FIXTURE_PORT ?? 4100);
const sessionCookie = 'eoh_session=test-session';

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function hasValidSession(request) {
  return request.headers.cookie?.split(';').some((value) => value.trim() === sessionCookie) ?? false;
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname === '/healthz') return send(response, 200, { ok: true });
  if (url.pathname === '/v1/auth/challenges' && request.method === 'POST') return send(response, 202, { challengeId: 'fixture-challenge', expiresInSeconds: 600 });
  if (url.pathname === '/v1/auth/challenges/verify' && request.method === 'POST') {
    return send(response, 200, { user: { id: 'fixture-user', email: 'demo@example.com' }, session: { id: 'fixture-session', expiresAt: '2030-01-01T00:00:00.000Z' } }, { 'set-cookie': `${sessionCookie}; HttpOnly; Path=/; SameSite=Lax` });
  }
  if (url.pathname === '/v1/auth/logout' && request.method === 'POST') return send(response, 204, undefined, { 'set-cookie': 'eoh_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
  if (url.pathname === '/v1/me') return hasValidSession(request) ? send(response, 200, { id: 'fixture-user', email: 'demo@example.com' }) : send(response, 401, { code: 'unauthenticated' });
  if (url.pathname === '/v1/me/sessions') return hasValidSession(request) ? send(response, 200, { data: [{ id: 'fixture-session', expiresAt: '2030-01-01T00:00:00.000Z' }] }) : send(response, 401, { code: 'unauthenticated' });
  return send(response, 404, { code: 'not_found' });
}).listen(port, '127.0.0.1', () => process.stdout.write(`auth fixture listening on ${port}\n`));
