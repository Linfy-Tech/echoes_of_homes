import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeTextModelProvider } from '../src/text.ts';

const request = {
  operation: 'translate',
  data: { segments: [{ segmentId: 'segment-1', sourceText: 'uNomsa eGqeberha', glossaryTerms: ['uNomsa', 'eGqeberha'], renderMode: 'normal' }] },
  schema: { parse(value) { return value; } },
  temperature: 0,
  modelId: 'fake-text-v1',
  promptId: 'translation',
  promptVersion: '1.0.0',
};

test('fake text provider returns deterministic aligned translation output', async () => {
  const result = await new FakeTextModelProvider().generateStructured(request);
  assert.deepEqual(result.output[0], {
    segmentId: 'segment-1',
    close: 'Close translation: uNomsa eGqeberha',
    natural: 'Natural translation: uNomsa eGqeberha',
    preservedTerms: ['uNomsa', 'eGqeberha'],
  });
});

test('fake text provider seeded defect drops a glossary term for verifier fixtures', async () => {
  const result = await new FakeTextModelProvider({ mode: 'seeded_defect' }).generateStructured(request);
  assert.equal(result.output[0].preservedTerms.length, 0);
  assert.equal(result.output[0].close.includes('uNomsa'), false);
});
