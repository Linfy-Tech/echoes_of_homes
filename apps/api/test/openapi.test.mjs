import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildServer } from '../src/server.ts';

test('generated OpenAPI document is 3.1 and covers every registered route', async () => {
  const app = buildServer();
  try {
    await app.ready();
    const document = app.swagger();
    const committed = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'));
    assert.equal(document.openapi, '3.1.0');
    assert.deepEqual(Object.keys(document.paths).sort(), Object.keys(committed.paths).sort());
    assert.ok(document.paths['/v1/auth/challenges'].post.requestBody);
    assert.ok(document.paths['/v1/me/sessions/{id}'].delete.parameters);
  } finally {
    await app.close();
  }
});
