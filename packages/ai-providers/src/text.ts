export type TranslationInputSegment = {
  segmentId: string;
  sourceText: string;
  glossaryTerms: readonly string[];
  renderMode: 'normal' | 'unclear_marker' | 'inaudible_marker';
};

export type TranslationOutputSegment = {
  segmentId: string;
  close: string;
  natural: string;
  preservedTerms: string[];
  translatorQueries?: string[];
};

export type TextModelRequest<T> = {
  operation: 'translate' | 'verify';
  data: unknown;
  schema: { parse(value: unknown): T };
  temperature: 0;
  modelId: string;
  promptId: string;
  promptVersion: string;
  signal?: AbortSignal;
};

export type TextModelProvider = {
  readonly provider: string;
  readonly modelId: string;
  generateStructured<T>(request: TextModelRequest<T>): Promise<{ output: T; inputUnits: number; outputUnits: number }>;
};

export type FakeTextModelMode = 'normal' | 'seeded_defect' | 'failure';

export class FakeTextModelProvider implements TextModelProvider {
  readonly provider = 'fake';
  readonly modelId = 'fake-text-v1';
  calls = 0;
  private readonly options: { mode?: FakeTextModelMode };
  constructor(options: { mode?: FakeTextModelMode } = {}) { this.options = options; }

  async generateStructured<T>(request: TextModelRequest<T>): Promise<{ output: T; inputUnits: number; outputUnits: number }> {
    this.calls += 1;
    if (request.signal?.aborted) throw new Error('translation_cancelled');
    if (this.options.mode === 'failure') throw Object.assign(new Error('text_provider_error'), { retryable: true });
    const data = request.data as { segments?: TranslationInputSegment[]; source?: string; translated?: string };
    let output: unknown;
    if (request.operation === 'translate') {
      const segments = data.segments ?? [];
      output = segments.map((segment) => {
        const preservedTerms = segment.glossaryTerms.filter((term) => segment.sourceText.includes(term));
        const marker = segment.renderMode === 'unclear_marker' ? '[unclear in the original]' : segment.renderMode === 'inaudible_marker' ? '[inaudible in the original]' : '';
        const close = marker || `Close translation: ${segment.sourceText}`;
        const natural = marker || `Natural translation: ${segment.sourceText}`;
        if (this.options.mode === 'seeded_defect' && preservedTerms.length) return { segmentId: segment.segmentId, close: close.replace(preservedTerms[0]!, ''), natural: natural.replace(preservedTerms[0]!, ''), preservedTerms: [] };
        return { segmentId: segment.segmentId, close, natural, preservedTerms };
      });
    } else {
      output = { issues: this.options.mode === 'seeded_defect' ? [{ checkId: 'llm.omission', severity: 'blocking', detail: 'The seeded verifier found a possible omission.' }] : [] };
    }
    return { output: request.schema.parse(output), inputUnits: JSON.stringify(request.data).length, outputUnits: JSON.stringify(output).length };
  }
}
