export const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'] as const;

export function chooseRecorderMimeType(mediaRecorder: Pick<typeof MediaRecorder, 'isTypeSupported'> | undefined): string | null {
  if (!mediaRecorder) return null;
  return RECORDER_MIME_TYPES.find((mimeType) => mediaRecorder.isTypeSupported(mimeType)) ?? null;
}

export function parseContentRange(value: string): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}
