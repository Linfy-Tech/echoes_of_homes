import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRecorderMimeType, parseContentRange } from '../lib/recording.ts';

test('Safari unsupported recorder configuration degrades to no selected format', () => {
  assert.equal(chooseRecorderMimeType({ isTypeSupported: () => false }), null);
});

test('recorder format selection prefers a supported audio format', () => {
  assert.equal(chooseRecorderMimeType({ isTypeSupported: (value) => value === 'audio/mp4' }), 'audio/mp4');
});

test('content range parser validates resumable upload ranges', () => {
  assert.deepEqual(parseContentRange('bytes 0-4/10'), { start: 0, end: 4, total: 10 });
  assert.equal(parseContentRange('bytes 0-4'), null);
});
