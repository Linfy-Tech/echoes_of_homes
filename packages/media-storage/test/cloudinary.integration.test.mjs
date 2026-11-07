import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudinaryMediaStorageFromEnv } from '../src/adapters/cloudinary.ts';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

const enabled = process.env.RUN_CLOUDINARY_INTEGRATION === '1';

test('Cloudinary webhook signature format rejects forgery and accepts the matching raw body', async () => {
  const secret = 'test-cloudinary-secret';
  const provider = createCloudinaryMediaStorageFromEnv({ CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: secret, CLOUDINARY_NOTIFICATION_URL: 'https://example.invalid/webhook' });
  const body = Buffer.from(JSON.stringify({ notification_type: 'upload', public_id: 'eoh/test', asset_id: 'asset-1', notification_id: 'event-1' }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash('sha1').update(body).update(timestamp).update(secret).digest('hex');
  assert.equal(await provider.verifyNotification(new Headers({ 'x-cld-timestamp': timestamp, 'x-cld-signature': 'forged' }), body), null);
  const event = await provider.verifyNotification(new Headers({ 'x-cld-timestamp': timestamp, 'x-cld-signature': signature }), body);
  assert.equal(event?.publicId, 'eoh/test');
});

test('Cloudinary signed upload → head/download → delete round-trip', { skip: !enabled }, async () => {
  const provider = createCloudinaryMediaStorageFromEnv();
  const bytes = Buffer.alloc(12_000_000, 0);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8_000, 24); bytes.writeUInt32LE(16_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  const upload = await provider.createUploadSession({ assetId: randomUUID(), role: 'original', mimeType: 'audio/wav', sizeBytes: bytes.length, derivatives: [{ role: 'playback', format: 'mp3', bitrateKbps: 40, channels: 1 }] });
  let ref = { provider: 'cloudinary', publicId: upload.publicId, resourceType: 'video', deliveryType: 'authenticated' };
  const path = join(tmpdir(), `eoh-cloudinary-${randomUUID()}`);
  try {
    const first = await provider.uploadChunk(upload.uploadId, bytes.subarray(0, 6_000_000), { start: 0, end: 5_999_999, total: bytes.length });
    assert.equal(first.done, false);
    const result = await provider.uploadChunk(upload.uploadId, bytes.subarray(6_000_000), { start: 6_000_000, end: bytes.length - 1, total: bytes.length });
    assert.equal(result.done, true);
    if (result.publicId) ref = { ...ref, publicId: result.publicId };
    const head = await provider.head(ref);
    assert.ok(head);
    assert.equal(head.ref.publicId, upload.publicId);
    const downloaded = await provider.download(ref, path);
    assert.equal(downloaded.bytes, bytes.length);
    const deleted = await provider.deleteAsset(ref);
    assert.equal(deleted.deleted, true);
    const backups = await provider.deleteBackups(ref);
    assert.equal(backups.backupsDeleted, true);
  } finally {
    await rm(path, { force: true });
    await provider.deleteAsset(ref).catch(() => undefined);
    await provider.deleteBackups(ref).catch(() => undefined);
    assert.equal(await provider.head(ref), null, `Cloudinary asset still exists: ${upload.publicId}`);
  }
});
