import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../components/transcript-review.tsx', import.meta.url), 'utf8');

test('review screen exposes keyboard-native controls and non-colour status semantics', () => {
  assert.match(source, /<section className="card" aria-labelledby="review-title">/);
  assert.match(source, /<p role="status">/);
  assert.match(source, /<button[^>]+type="button"/);
  assert.match(source, /<textarea aria-label=/);
  assert.match(source, /<audio controls/);
  assert.match(source, /review\.nextFlag/);
});
