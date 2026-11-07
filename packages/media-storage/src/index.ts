import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type MediaRole = 'original' | 'playback' | 'processing' | 'consent_evidence' | 'consent_script_audio' | 'export_archive';
export type ProviderRef = Readonly<{ provider: 'fake' | 'cloudinary'; publicId: string; resourceType: 'video' | 'raw'; deliveryType: 'authenticated' }>;
export type DerivativeSpec = Readonly<{ role: 'playback'; format: string; bitrateKbps: number; channels: 1 | 2 }>;
export type UploadSession = Readonly<{ assetId: string; provider: 'fake' | 'cloudinary'; uploadId: string; publicId: string; chunkSizeBytes: number; expiresAt: Date; signature: string; uploadUrl: string }>;
export type MediaEvent = Readonly<{ provider: 'fake' | 'cloudinary'; eventId: string; publicId: string; assetId: string; status: 'uploaded'; timestamp: number }>;
export type ByteRange = Readonly<{ start: number; end?: number }>;
export type MediaStream = Readonly<{ body: AsyncIterable<Uint8Array>; bytes: number; mimeType: string; contentRange?: string }>;
export type ProviderAssetInfo = Readonly<{ ref: ProviderRef; bytes: number; sha256: string; mimeType: string; durationMs: number; hasAudio: boolean }>;
export type DeleteOutcome = Readonly<{ deleted: boolean; derivedDeleted: number; backupsDeleted: boolean }>;

export interface MediaStorageProvider {
  readonly name: 'cloudinary' | 'fake';
  createUploadSession(input: { assetId: string; role: MediaRole; mimeType: string; sizeBytes: number; derivatives: DerivativeSpec[] }): Promise<UploadSession>;
  refreshUploadSession(assetId: string): Promise<UploadSession>;
  uploadChunk(uploadId: string, chunk: Uint8Array, range: { start: number; end: number; total: number }): Promise<{ done: boolean; bytes: number }>;
  verifyNotification(headers: Headers, rawBody: Buffer): Promise<MediaEvent | null>;
  openStream(ref: ProviderRef, range?: ByteRange): Promise<MediaStream>;
  download(ref: ProviderRef, destPath: string): Promise<{ bytes: number }>;
  head(ref: ProviderRef): Promise<ProviderAssetInfo | null>;
  deleteAsset(ref: ProviderRef): Promise<DeleteOutcome>;
  deleteBackups(ref: ProviderRef): Promise<DeleteOutcome>;
  putFile(input: { assetId: string; role: MediaRole; path: string; mimeType: string }): Promise<ProviderRef>;
}

const signatureFor = (body: Buffer, timestamp: string, secret: string) => createHash('sha1').update(body).update(timestamp).update(secret).digest('hex');
const safeEqual = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };

/** Deterministic provider used by CI. It keeps provider URLs and paths private to this package. */
export class FakeMediaStorageProvider implements MediaStorageProvider {
  readonly name = 'fake' as const;
  readonly webhookSecret: string;
  private readonly uploads = new Map<string, { assetId: string; ref: ProviderRef; mimeType: string; expected: number; bytes: Buffer }>();
  private readonly assets = new Map<string, ProviderAssetInfo & { bytesData: Buffer }>();
  constructor(options: { webhookSecret?: string } = {}) { this.webhookSecret = options.webhookSecret ?? 'fake-webhook-secret'; }
  async createUploadSession(input: { assetId: string; role: MediaRole; mimeType: string; sizeBytes: number; derivatives: DerivativeSpec[] }): Promise<UploadSession> {
    const uploadId = randomUUID(); const publicId = `fake/${randomUUID()}`;
    const ref: ProviderRef = { provider: 'fake', publicId, resourceType: 'video', deliveryType: 'authenticated' };
    this.uploads.set(uploadId, { assetId: input.assetId, ref, mimeType: input.mimeType, expected: input.sizeBytes, bytes: Buffer.alloc(0) });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return { assetId: input.assetId, provider: 'fake', uploadId, publicId, chunkSizeBytes: 5_000_000, expiresAt: new Date(Date.now() + 3_600_000), signature: signatureFor(Buffer.from(publicId), timestamp, this.webhookSecret), uploadUrl: `https://fake.invalid/upload/${uploadId}` };
  }
  async refreshUploadSession(assetId: string) { const entry = [...this.uploads.values()].find((upload) => upload.assetId === assetId); if (!entry) throw new Error('upload_not_found'); return this.createUploadSession({ assetId, role: 'original', mimeType: entry.mimeType, sizeBytes: entry.expected, derivatives: [] }); }
  async uploadChunk(uploadId: string, chunk: Uint8Array, range: { start: number; end: number; total: number }) { const upload = this.uploads.get(uploadId); if (!upload || range.start !== upload.bytes.length || range.total !== upload.expected || range.end - range.start + 1 !== chunk.byteLength) throw new Error('invalid_upload_chunk'); upload.bytes = Buffer.concat([upload.bytes, Buffer.from(chunk)]); const done = upload.bytes.length === upload.expected; if (done) { const hash = createHash('sha256').update(upload.bytes).digest('hex'); this.assets.set(upload.ref.publicId, { ref: upload.ref, bytes: upload.bytes.length, sha256: hash, mimeType: upload.mimeType, durationMs: 1_000, hasAudio: true, bytesData: upload.bytes }); } return { done, bytes: upload.bytes.length }; }
  signWebhook(body: Buffer, event: Omit<MediaEvent, 'provider'>) { const timestamp = String(event.timestamp); return { 'x-cld-timestamp': timestamp, 'x-cld-signature': signatureFor(body, timestamp, this.webhookSecret) }; }
  async verifyNotification(headers: Headers, rawBody: Buffer) { const timestamp = headers.get('x-cld-timestamp'); const signature = headers.get('x-cld-signature'); if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 600 || !safeEqual(signature, signatureFor(rawBody, timestamp, this.webhookSecret))) return null; let event: Omit<MediaEvent, 'provider'>; try { event = JSON.parse(rawBody.toString('utf8')) as Omit<MediaEvent, 'provider'>; } catch { return null; } return event.status === 'uploaded' && typeof event.eventId === 'string' && typeof event.publicId === 'string' && typeof event.assetId === 'string' ? { ...event, provider: 'fake' as const } : null; }
  async openStream(ref: ProviderRef, range?: ByteRange) { const asset = this.assets.get(ref.publicId); if (!asset) throw new Error('asset_not_found'); const start = range?.start ?? 0; const end = Math.min(range?.end ?? asset.bytes - 1, asset.bytes - 1); if (start < 0 || start > end) throw new Error('invalid_range'); const body = asset.bytesData.subarray(start, end + 1); return { body: (async function* () { yield body; }()), bytes: body.length, mimeType: asset.mimeType, contentRange: range ? `bytes ${start}-${end}/${asset.bytes}` : undefined }; }
  async download(ref: ProviderRef, destPath: string) { const fs = await import('node:fs/promises'); const asset = this.assets.get(ref.publicId); if (!asset) throw new Error('asset_not_found'); await fs.writeFile(destPath, asset.bytesData); return { bytes: asset.bytes }; }
  async head(ref: ProviderRef) { const asset = this.assets.get(ref.publicId); return asset ? { ...asset, bytesData: undefined } as ProviderAssetInfo : null; }
  async deleteAsset(ref: ProviderRef) { const deleted = this.assets.delete(ref.publicId); return { deleted, derivedDeleted: 0, backupsDeleted: false }; }
  async deleteBackups(_ref: ProviderRef) { return { deleted: true, derivedDeleted: 0, backupsDeleted: true }; }
  async putFile(input: { assetId: string; role: MediaRole; path: string; mimeType: string }) { const fs = await import('node:fs/promises'); const bytes = await fs.readFile(input.path); const ref: ProviderRef = { provider: 'fake', publicId: `fake/${randomUUID()}`, resourceType: 'raw', deliveryType: 'authenticated' }; this.assets.set(ref.publicId, { ref, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mimeType: input.mimeType, durationMs: 0, hasAudio: false, bytesData: bytes }); return ref; }
}

export const sha256Hex = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
