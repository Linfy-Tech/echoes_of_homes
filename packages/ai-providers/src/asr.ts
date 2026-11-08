export type AsrSegment = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  uncertain?: boolean;
};

export type AudioChunk = {
  index: number;
  startMs: number;
  endMs: number;
  overlapMs: number;
  audio: Uint8Array;
  sha256: string;
};

export type AsrResponse = {
  text: string;
  segments: AsrSegment[];
  languages?: string[];
  inputUnits?: number;
  outputUnits?: number;
};

export type AsrProvider = {
  readonly provider: string;
  readonly modelId: string;
  transcribe(chunk: AudioChunk, options?: { signal?: AbortSignal; languageHints?: readonly string[] }): Promise<AsrResponse>;
};

export type FakeAsrMode = 'normal' | 'low_confidence' | 'timeout' | 'failure';

export class FakeAsrProvider implements AsrProvider {
  readonly provider = 'fake';
  readonly modelId = 'fake-asr-v1';
  calls = 0;
  private readonly options: { mode?: FakeAsrMode; text?: string; latencyMs?: number };
  constructor(options: { mode?: FakeAsrMode; text?: string; latencyMs?: number } = {}) { this.options = options; }

  async transcribe(chunk: AudioChunk, options: { signal?: AbortSignal } = {}): Promise<AsrResponse> {
    this.calls += 1;
    if (this.options.latencyMs) await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    if (options.signal?.aborted) throw new Error('asr_cancelled');
    if (this.options.mode === 'timeout') throw Object.assign(new Error('provider_timeout'), { retryable: true });
    if (this.options.mode === 'failure') throw Object.assign(new Error('provider_error'), { retryable: true });
    const text = this.options.text ?? `Synthetic isiXhosa segment ${chunk.index + 1}`;
    const confidence = this.options.mode === 'low_confidence' ? 0.2 : 0.98;
    return { text, segments: [{ startMs: 0, endMs: Math.max(1, chunk.endMs - chunk.startMs), text, confidence, uncertain: confidence < 0.5 }], languages: ['xh'], inputUnits: chunk.audio.byteLength };
  }
}
