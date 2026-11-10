import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [root = '/tmp/echoes-screenshots'] = process.argv.slice(2);
const beforeRoot = path.join(root, 'before');
const afterRoot = path.join(root, 'after');

async function pngs(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await pngs(path.join(directory, entry.name), relative));
    else if (entry.name.endsWith('.png')) files.push(relative);
  }
  return files;
}

async function hash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

const beforeFiles = (await pngs(beforeRoot)).sort();
const afterFiles = (await pngs(afterRoot)).sort();
const missingBefore = afterFiles.filter((file) => !beforeFiles.includes(file));
const missingAfter = beforeFiles.filter((file) => !afterFiles.includes(file));
if (missingBefore.length || missingAfter.length || beforeFiles.length === 0) {
  throw new Error(`Screenshot sets do not match: before=${beforeFiles.length}, after=${afterFiles.length}, missingBefore=${missingBefore.length}, missingAfter=${missingAfter.length}`);
}

const identical = [];
for (const file of afterFiles) if (await hash(path.join(beforeRoot, file)) === await hash(path.join(afterRoot, file))) identical.push(file);
const report = { beforeCount: beforeFiles.length, afterCount: afterFiles.length, identicalCount: identical.length, changedCount: afterFiles.length - identical.length, identical };
await writeFile(path.join(root, 'visual-diff-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (identical.length > 2) throw new Error(`More than two before/after screenshot pairs are identical (${identical.length}); capture comparison is not trustworthy.`);
