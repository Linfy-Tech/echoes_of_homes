import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cer, evaluate, normalise, renderReport, wer } from '../../scripts/asr-eval.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/asr-synthetic.json', import.meta.url), 'utf8'));

test('normalisation is deterministic and shared by WER/CER', () => {
  assert.equal(normalise('  Molo, TATA!  '), 'molo tata');
  assert.deepEqual(wer('Molo tata', 'molo tata'), { errors: 0, units: 2 });
  assert.deepEqual(cer('Molo tata', 'molo tata'), { errors: 0, units: 8 });
});

test('offline evaluator computes metrics and cost without provider calls', () => {
  const [perfect, imperfect] = evaluate(fixture);
  assert.equal(perfect.wer, 0);
  assert.equal(perfect.cer, 0);
  assert.equal(perfect.costUsd, 0);
  assert.ok(imperfect.wer > 0);
  assert.equal(imperfect.costUsd, 0.01);
  assert.match(renderReport(fixture, [perfect, imperfect]), /synthetic fixtures are pipeline tests/);
});
