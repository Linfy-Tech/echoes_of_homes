import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeAsrProvider } from '../src/asr.ts';
import { chunkAudio, stitchSegments } from '../src/audio.ts';

test('fake ASR supports deterministic uncertainty and failure modes', async () => {
  const chunk = chunkAudio(new Uint8Array(10), 10_000)[0];
  const uncertain = await new FakeAsrProvider({ mode: 'low_confidence' }).transcribe(chunk);
  assert.equal(uncertain.segments[0].uncertain, true);
  await assert.rejects(() => new FakeAsrProvider({ mode: 'timeout' }).transcribe(chunk), /provider_timeout/);
});

test('chunking and stitching preserve offsets and de-duplicate overlap', async () => {
  const chunks = chunkAudio(new Uint8Array(100), 20_000, { maxChunkDurationMs: 10_000, overlapMs: 1_000 });
  assert.equal(chunks.length, 2);
  const result = stitchSegments(chunks.map((chunk) => ({ chunk, segments: [{ startMs: 0, endMs: chunk.endMs - chunk.startMs, text: 'same words', confidence: 0.9 }] })));
  assert.equal(result.length, 1);
  assert.equal(result[0].startMs, 0);
  assert.equal(result[0].endMs, 20_000);
});
