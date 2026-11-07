import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import type {
  ByteRange,
  DeleteOutcome,
  DerivativeSpec,
  MediaEvent,
  MediaRole,
  MediaStorageProvider,
  MediaStream,
  ProviderAssetInfo,
  ProviderRef,
  UploadSession,
} from '../index.ts';

export type CloudinaryStorageOptions = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  notificationUrl: string;
  uploadPrefix?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type UploadState = {
  assetId: string;
  publicId: string;
  mimeType: string;
  sizeBytes: number;
  uploadId: string;
  expiresAt: Date;
  derivatives: DerivativeSpec[];
};

type CloudinaryResource = {
  asset_id?: string;
  bytes?: number;
  duration?: number;
  format?: string;
  derived?: Array<{ id?: string }>;
  versions?: Array<{ version_id?: string }>;
};

const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const randomPublicId = () => {
  const bytes = randomBytes(16);
  let value = '';
  for (const byte of bytes) value += base62[byte % base62.length];
  return value;
};

const sha1Signature = (body: Buffer, timestamp: string, secret: string) => createHash('sha1').update(body).update(timestamp).update(secret).digest('hex');
const equalSignature = (left: string, right: string) => {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};
const isNotFound = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { http_code?: number; error?: { http_code?: number } };
  return candidate.http_code === 404 || candidate.error?.http_code === 404;
};

export class CloudinaryMediaStorageProvider implements MediaStorageProvider {
  readonly name = 'cloudinary' as const;
  private readonly options: CloudinaryStorageOptions;
  private readonly uploads = new Map<string, UploadState>();
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudinaryStorageOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    cloudinary.config({ cloud_name: options.cloudName, api_key: options.apiKey, api_secret: options.apiSecret, secure: true });
  }

  private timestamp(): number { return Math.floor((this.options.now?.() ?? Date.now()) / 1000); }

  private signedParams(state: UploadState): Record<string, string> {
    const params: Record<string, string> = {
      public_id: state.publicId,
      type: 'authenticated',
      timestamp: String(this.timestamp()),
      notification_url: this.options.notificationUrl,
    };
    const playback = state.derivatives.find((derivative) => derivative.role === 'playback');
    if (playback) params.eager = `f_${playback.format},ac_${playback.channels === 1 ? 'mp3' : 'stereo'},br_${playback.bitrateKbps}k`;
    return { ...params, api_key: this.options.apiKey, signature: cloudinary.utils.api_sign_request(params, this.options.apiSecret) };
  }

  private session(state: UploadState): UploadSession {
    const params = this.signedParams(state);
    return {
      assetId: state.assetId,
      provider: 'cloudinary',
      uploadId: state.uploadId,
      publicId: state.publicId,
      chunkSizeBytes: 6_000_000,
      expiresAt: state.expiresAt,
      signature: params.signature ?? '',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.options.cloudName}/video/upload`,
      params,
    };
  }

  async createUploadSession(input: { assetId: string; role: MediaRole; mimeType: string; sizeBytes: number; derivatives: DerivativeSpec[] }): Promise<UploadSession> {
    if (input.role !== 'original' && input.role !== 'consent_evidence') throw new Error('cloudinary_direct_upload_role_not_supported');
    const state: UploadState = {
      assetId: input.assetId,
      publicId: `${this.options.uploadPrefix ?? 'eoh/prod'}/${randomPublicId()}`,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadId: randomUUID(),
      expiresAt: new Date((this.options.now?.() ?? Date.now()) + 3_600_000),
      derivatives: input.derivatives,
    };
    this.uploads.set(state.uploadId, state);
    return this.session(state);
  }

  async refreshUploadSession(assetId: string): Promise<UploadSession> {
    const state = [...this.uploads.values()].find((candidate) => candidate.assetId === assetId);
    if (!state) throw new Error('upload_not_found');
    state.expiresAt = new Date((this.options.now?.() ?? Date.now()) + 3_600_000);
    return this.session(state);
  }

  async uploadChunk(uploadId: string, chunk: Uint8Array, range: { start: number; end: number; total: number }): Promise<{ done: boolean; bytes: number; publicId?: string }> {
    const state = this.uploads.get(uploadId);
    if (!state || range.total !== state.sizeBytes || range.end - range.start + 1 !== chunk.byteLength) throw new Error('invalid_upload_chunk');
    const params = this.signedParams(state);
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.append(key, value);
    form.append('file', new Blob([Buffer.from(chunk)], { type: state.mimeType }), 'recording');
    const response = await this.fetchImpl(stateUploadUrl(this.options.cloudName), { method: 'POST', headers: { 'X-Unique-Upload-Id': uploadId, 'Content-Range': `bytes ${range.start}-${range.end}/${range.total}` }, body: form });
    const body = await response.json() as { done?: boolean; bytes?: number; public_id?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? `cloudinary_upload_${response.status}`);
    if (typeof body.public_id === 'string') state.publicId = body.public_id;
    return { done: body.done === true, bytes: body.bytes ?? range.end + 1, publicId: typeof body.public_id === 'string' ? body.public_id : undefined };
  }

  async verifyNotification(headers: Headers, rawBody: Buffer): Promise<MediaEvent | null> {
    const timestamp = headers.get('x-cld-timestamp');
    const signature = headers.get('x-cld-signature');
    const parsedTimestamp = Number(timestamp);
    if (!timestamp || !signature || !Number.isFinite(parsedTimestamp) || Math.abs(this.timestamp() - parsedTimestamp) > 600 || !equalSignature(signature, sha1Signature(rawBody, timestamp, this.options.apiSecret))) return null;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>; } catch { return null; }
    if (typeof payload.public_id !== 'string' || payload.notification_type !== 'upload' && payload.notification_type !== 'upload_chunked') return null;
    const eventId = typeof payload.notification_id === 'string' ? payload.notification_id : `${String(payload.asset_id ?? payload.public_id)}:${String(payload.version ?? timestamp)}`;
    return { provider: 'cloudinary', eventId, publicId: payload.public_id, assetId: typeof payload.asset_id === 'string' ? payload.asset_id : eventId, status: 'uploaded', timestamp: parsedTimestamp };
  }

  private signedDeliveryUrl(ref: ProviderRef, version?: number): string {
    return cloudinary.url(ref.publicId, { resource_type: ref.resourceType, type: ref.deliveryType, secure: true, sign_url: true, ...(version ? { version } : {}) });
  }

  async openStream(ref: ProviderRef, range?: ByteRange): Promise<MediaStream> {
    const headers: Record<string, string> = {};
    if (range) headers.Range = `bytes=${range.start}-${range.end ?? ''}`;
    const response = await this.fetchImpl(this.signedDeliveryUrl(ref), { headers });
    if (!response.ok || !response.body) throw new Error(`cloudinary_stream_${response.status}`);
    const contentRange = response.headers.get('content-range') ?? undefined;
    const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
    const body = response.body;
    const stream = (async function* () { const reader = body.getReader(); try { while (true) { const next = await reader.read(); if (next.done) break; yield next.value; } } finally { reader.releaseLock(); } }());
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    return { body: stream, bytes: contentLength, mimeType: contentType, contentRange };
  }

  async download(ref: ProviderRef, destPath: string): Promise<{ bytes: number }> {
    const stream = await this.openStream(ref);
    const chunks: Buffer[] = [];
    for await (const chunk of stream.body) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, bytes);
    return { bytes: bytes.length };
  }

  async head(ref: ProviderRef): Promise<ProviderAssetInfo | null> {
    let resource: CloudinaryResource;
    try { resource = await cloudinary.api.resource(ref.publicId, { resource_type: ref.resourceType, type: ref.deliveryType, versions: true }); } catch (error) { if (isNotFound(error)) return null; throw error; }
    return { ref, bytes: resource.bytes ?? 0, sha256: '', mimeType: resource.format ? `audio/${resource.format}` : 'audio/mpeg', durationMs: Math.round((resource.duration ?? 0) * 1000), hasAudio: ref.resourceType === 'video' };
  }

  async deleteAsset(ref: ProviderRef): Promise<DeleteOutcome> {
    let resource: CloudinaryResource | null = null;
    try { resource = await cloudinary.api.resource(ref.publicId, { resource_type: ref.resourceType, type: ref.deliveryType, derived: true, versions: true }); } catch (error) { if (!isNotFound(error)) throw error; }
    const derivedIds = resource?.derived?.map((item) => item.id).filter((id): id is string => Boolean(id)) ?? [];
    if (derivedIds.length) await cloudinary.api.delete_derived_resources(derivedIds);
    const destroyed = await cloudinary.uploader.destroy(ref.publicId, { resource_type: ref.resourceType, type: ref.deliveryType, invalidate: true });
    return { deleted: destroyed.result === 'ok' || destroyed.result === 'not found', derivedDeleted: derivedIds.length, backupsDeleted: false };
  }

  async deleteBackups(ref: ProviderRef): Promise<DeleteOutcome> {
    let resource: CloudinaryResource;
    try { resource = await cloudinary.api.resource(ref.publicId, { resource_type: ref.resourceType, type: ref.deliveryType, versions: true }); } catch (error) { if (isNotFound(error)) return { deleted: true, derivedDeleted: 0, backupsDeleted: true }; throw error; }
    const assetId = resource.asset_id;
    const versionIds = resource.versions?.map((version) => version.version_id).filter((id): id is string => Boolean(id)) ?? [];
    if (assetId && versionIds.length) await (cloudinary.api as unknown as { delete_backed_up_assets: (id: string, versions: string[]) => Promise<unknown> }).delete_backed_up_assets(assetId, versionIds);
    return { deleted: true, derivedDeleted: 0, backupsDeleted: true };
  }

  async putFile(input: { assetId: string; role: MediaRole; path: string; mimeType: string }): Promise<ProviderRef> {
    const result = await cloudinary.uploader.upload(input.path, { resource_type: input.role === 'export_archive' ? 'raw' : 'video', type: 'authenticated', public_id: `${this.options.uploadPrefix ?? 'eoh/prod'}/${randomPublicId()}`, invalidate: true });
    return { provider: 'cloudinary', publicId: result.public_id, resourceType: input.role === 'export_archive' ? 'raw' : 'video', deliveryType: 'authenticated' };
  }
}

const stateUploadUrl = (cloudName: string) => `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;

export function createCloudinaryMediaStorageFromEnv(env: NodeJS.ProcessEnv = process.env): CloudinaryMediaStorageProvider {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_NOTIFICATION_URL'] as const;
  for (const name of required) if (!env[name]) throw new Error(`${name} is required for Cloudinary media storage`);
  return new CloudinaryMediaStorageProvider({ cloudName: env.CLOUDINARY_CLOUD_NAME!, apiKey: env.CLOUDINARY_API_KEY!, apiSecret: env.CLOUDINARY_API_SECRET!, notificationUrl: env.CLOUDINARY_NOTIFICATION_URL!, uploadPrefix: env.CLOUDINARY_UPLOAD_PREFIX ?? env.CLOUDINARY_FOLDER_PREFIX });
}
