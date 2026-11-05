const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { v2: cloudinary } = require('cloudinary');

const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const publicId = `eoh/m0-spike/${runId}/synthetic-audio`;
const resourceType = 'video';
const deliveryType = 'authenticated';
const chunkSize = 6_000_000;
const totalBytes = 12_000_000;
const tempFile = path.join(os.tmpdir(), `eoh-cloudinary-${runId}.wav`);

function wavBuffer(bytes) {
  const dataBytes = bytes - 44;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(bytes - 8, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44_100, 24);
  header.writeUInt32LE(88_200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, Buffer.alloc(dataBytes)]);
}

function signedUploadParams(extra = {}) {
  const params = {
    public_id: publicId,
    type: deliveryType,
    timestamp: Math.floor(Date.now() / 1000),
    ...extra,
  };
  return {
    ...params,
    api_key: process.env.CLOUDINARY_API_KEY,
    signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET),
  };
}

async function uploadChunk(buffer, start, end, uploadId) {
  console.log(`upload request: range=${start}-${end}`);
  const form = new FormData();
  const params = signedUploadParams();
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append('file', new Blob([buffer.subarray(start, end + 1)], { type: 'audio/wav' }), 'synthetic.wav');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: 'POST',
      headers: {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      },
      body: form,
    },
  );
  const body = await response.json();
  console.log(`upload response: status=${response.status}`);
  if (!response.ok) throw new Error(body.error?.message || `Cloudinary upload failed with HTTP ${response.status}`);
  return body;
}

async function countAssets() {
  const result = await cloudinary.api.resources({
    resource_type: resourceType,
    type: deliveryType,
    prefix: publicId,
    max_results: 100,
  });
  return result.resources.length;
}

async function main() {
  const source = wavBuffer(totalBytes);
  await fs.writeFile(tempFile, source);
  const uploadId = crypto.randomUUID();
  let uploadResult;
  let resource;
  try {
    console.log(`run: prefix=eoh/m0-spike/${runId}`);
    const config = await cloudinary.api.config();
    console.log(`account: cloud=${process.env.CLOUDINARY_CLOUD_NAME}, plan=${config.plan || 'not-reported'}, region=${config.region || 'not-reported'}`);
    try {
      const usage = await cloudinary.api.usage();
      console.log(`usage: storage_bytes=${usage.storage?.usage ?? 'not-reported'}, credits_used=${usage.credits?.usage ?? 'not-reported'}`);
    } catch (error) {
      console.log(`usage: unavailable (${error.message || 'Admin API did not report usage'})`);
    }
    const first = await uploadChunk(source, 0, chunkSize - 1, uploadId);
    assert.equal(first.done, false);
    console.log(`chunk 1: done=${first.done}, bytes=${chunkSize}`);

    // Simulate an interruption. The second request uses the same upload ID,
    // with a newly signed timestamp, which is the refreshed-signature case.
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      uploadResult = await uploadChunk(source, chunkSize, source.length - 1, uploadId);
    } catch (error) {
      if (error.message.includes('actions=["create"]')) {
        console.log(`chunk resume: blocked-by-account-permission (${error.message})`);
        return;
      }
      throw error;
    }
    assert.equal(uploadResult.done, true);
    assert.equal(uploadResult.resource_type, resourceType);
    assert.equal(uploadResult.type, deliveryType);
    console.log(`chunk resume: done=${uploadResult.done}, bytes=${uploadResult.bytes}`);

    resource = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
      type: deliveryType,
      derived: true,
      versions: true,
    });
    assert.equal(resource.type, deliveryType);
    try {
      await cloudinary.uploader.explicit(publicId, {
        resource_type: resourceType,
        type: deliveryType,
        eager: 'f_mp3,ac_mp3,br_32k',
      });
      resource = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type: deliveryType,
        derived: true,
        versions: true,
      });
      assert.ok(resource.derived?.length >= 1, 'expected an eager derivative');
      console.log(`eager derivative: count=${resource.derived.length}, format=${resource.derived[0].format}`);
    } catch (error) {
      console.log(`eager derivative: unavailable (${error.message})`);
    }

    const signedUrl = cloudinary.url(publicId, {
      resource_type: resourceType,
      type: deliveryType,
      secure: true,
      sign_url: true,
      version: uploadResult.version,
    });
    const rangeResponse = await fetch(signedUrl, { headers: { Range: 'bytes=0-1023' } });
    assert.equal(rangeResponse.status, 206);
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    assert.equal(rangeBytes.length, 1024);
    console.log(`authenticated range: status=${rangeResponse.status}, bytes=${rangeBytes.length}`);

    const beforeDelete = await countAssets();
    assert.ok(beforeDelete >= 1);
    const destroyResult = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: deliveryType,
      invalidate: true,
    });
    console.log(`destroy: result=${destroyResult.result}`);

    if (resource.derived?.length) {
      const derivedIds = resource.derived.map((item) => item.id).filter(Boolean);
      if (derivedIds.length) {
        const derivedDelete = await cloudinary.api.delete_derived_resources(derivedIds);
        console.log(`derived delete: result=${derivedDelete.deleted ? 'deleted' : 'completed'}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const afterDelete = await countAssets();
    assert.equal(afterDelete, 0);
    console.log(`cleanup: matching assets=${afterDelete}`);

    const backupVersions = resource.versions || [];
    if (backupVersions.length && resource.asset_id) {
      const versionIds = backupVersions.map((version) => version.version_id).filter(Boolean);
      if (versionIds.length) {
        const backupDelete = await cloudinary.api.delete_backed_up_versions(resource.asset_id, versionIds);
        console.log(`backup delete: result=${backupDelete.deleted ? 'deleted' : 'completed'}`);
      }
    } else {
      console.log('backup delete: no API-visible backup versions; account backup behavior requires console/vendor confirmation');
    }
  } finally {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: deliveryType,
        invalidate: true,
      });
    } catch {
      // Cleanup is best effort here; the successful path verifies absence.
    }
    await fs.rm(tempFile, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
