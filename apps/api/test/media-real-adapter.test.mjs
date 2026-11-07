import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudinaryMediaStorageProvider } from '@echoes-of-home/media-storage/cloudinary';
import { createMediaFoundation } from '../src/media-foundation.ts';

test('real Cloudinary adapter upload-session API shape hides URLs, secrets, and provider IDs', async () => {
  const provider = new CloudinaryMediaStorageProvider({
    cloudName: 'test-cloud',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    notificationUrl: 'https://api.example.test/v1/webhooks/media',
  });
  const media = createMediaFoundation({ provider, consentScopes: async () => new Set(['record_and_store', 'cross_border_processing']) });
  const response = await media.createRecording('user', '00000000-0000-0000-0000-000000000001', {
    source: 'browser_recording',
    sha256: 'a'.repeat(64),
    sizeBytes: 128,
    mimeType: 'audio/wav',
  }, async () => {});
  const serialized = JSON.stringify(response);
  const upload = provider['uploads'].values().next().value;
  assert.equal(Object.hasOwn(response.upload, 'uploadUrl'), false);
  assert.equal(Object.hasOwn(response.upload, 'signature'), false);
  assert.equal(serialized.includes('api.cloudinary.com'), false);
  assert.equal(serialized.includes('test-api-secret'), false);
  assert.equal(serialized.includes(upload.publicId), false);
  assert.equal(serialized.includes('/tmp/'), false);
});
