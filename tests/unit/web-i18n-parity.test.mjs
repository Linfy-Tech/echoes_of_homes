import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'messages');

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child) ? keys(child, path) : [path];
  }).sort();
}

test('isiXhosa and English translation catalogues have identical keys', async () => {
  const [xh, en] = await Promise.all(['xh', 'en'].map(async (language) => JSON.parse(await readFile(join(directory, `${language}.json`), 'utf8'))));
  assert.deepEqual(keys(xh), keys(en), 'translation keys must stay in parity');
});
