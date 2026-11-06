import { readFile, writeFile } from 'node:fs/promises';
import { buildServer } from '../src/server.ts';

const outputPath = new URL('../openapi.json', import.meta.url);
const checkOnly = process.argv.includes('--check');
const app = buildServer();

try {
  await app.ready();
  const document = app.swagger();
  const rendered = `${JSON.stringify(document, null, 2)}\n`;
  if (checkOnly) {
    const committed = await readFile(outputPath, 'utf8');
    if (committed !== rendered) {
      process.stderr.write('apps/api/openapi.json is out of date; run pnpm --filter @echoes-of-home/api openapi:generate\n');
      process.exitCode = 1;
    }
  } else {
    await writeFile(outputPath, rendered, 'utf8');
  }
} finally {
  await app.close();
}
