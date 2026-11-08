import { createHash } from 'node:crypto';
import type { AsrSegment, AudioChunk } from './asr.ts';

export function chunkAudio(audio: Uint8Array, durationMs: number, options: { maxChunkDurationMs?: number; overlapMs?: number } = {}): AudioChunk[] {
  const maxChunkDurationMs = options.maxChunkDurationMs ?? 600_000;
  const overlapMs = options.overlapMs ?? 1_000;
  if (durationMs <= 0 || maxChunkDurationMs <= 0 || overlapMs < 0 || overlapMs >= maxChunkDurationMs) throw new Error('invalid_audio_chunk_config');
  const chunks: AudioChunk[] = [];
  const count = Math.ceil(durationMs / maxChunkDurationMs);
  for (let index = 0; index < count; index += 1) {
    const startMs = Math.max(0, index * maxChunkDurationMs - (index ? overlapMs : 0));
    const endMs = Math.min(durationMs, (index + 1) * maxChunkDurationMs);
    const startByte = Math.floor((startMs / durationMs) * audio.byteLength);
    const endByte = index === count - 1 ? audio.byteLength : Math.ceil((endMs / durationMs) * audio.byteLength);
    const bytes = audio.slice(startByte, endByte);
    chunks.push({ index, startMs, endMs, overlapMs: index ? overlapMs : 0, audio: bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return chunks;
}

export function stitchSegments(results: Array<{ chunk: AudioChunk; segments: AsrSegment[] }>): AsrSegment[] {
  const stitched: AsrSegment[] = [];
  for (const { chunk, segments } of results.sort((a, b) => a.chunk.index - b.chunk.index)) {
    for (const segment of segments) {
      const next = { ...segment, startMs: chunk.startMs + segment.startMs, endMs: chunk.startMs + segment.endMs };
      const previous = stitched.at(-1);
      if (previous && previous.endMs >= next.startMs && previous.text.trim() === next.text.trim()) {
        previous.endMs = Math.max(previous.endMs, next.endMs);
        previous.confidence = Math.min(previous.confidence ?? 1, next.confidence ?? 1);
        previous.uncertain = previous.uncertain || next.uncertain;
      } else stitched.push(next);
    }
  }
  return stitched;
}
